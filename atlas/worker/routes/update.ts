import type { ApiContext } from '../index'
import {
  apiKeyKey,
  kvGetJson,
  kvPutJson,
  seenKey,
  syncLogKey,
  userKey,
  type ApiKeyRecord,
  type KnownCourse,
  type SeenRecord,
  type SyncLogEntry,
  type UserRecord,
} from '../kv'
import { createNotionPage, updateNotionPage } from '../notion'

type Coursework = {
  id: string
  title?: string
  description?: string
  workType?: string
  dueDate?: { year: number; month: number; day: number }
  dueTime?: { hours: number; minutes: number }
  alternateLink?: string
}

type Announcement = {
  id: string
  text?: string
  alternateLink?: string
}

type CoursePayload = {
  id: string
  name: string
  section?: string
  courseWork?: Coursework[]
  announcements?: Announcement[]
}

type UpdatePayload = {
  apiKey?: string
  courses?: CoursePayload[]
}

type NormalizedItem = {
  id: string
  title: string
  description: string
  workType: string
  dueDate: { year: number; month: number; day: number } | null
  dueTime: { hours: number; minutes: number } | null
  alternateLink: string | null
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function normalizeCourseName(course: CoursePayload) {
  return `${course.name}${course.section ? ` — ${course.section}` : ''}`
}

function normalizeItem(item: Coursework | Announcement, isAnnouncement: boolean): NormalizedItem {
  if (isAnnouncement) {
    const ann = item as Announcement
    return {
      id: ann.id,
      title: (ann.text ?? 'Announcement').slice(0, 100),
      description: ann.text ?? '',
      workType: 'ANNOUNCEMENT',
      dueDate: null,
      dueTime: null,
      alternateLink: ann.alternateLink ?? null,
    }
  }

  const cw = item as Coursework
  return {
    id: cw.id,
    title: cw.title ?? 'Untitled assignment',
    description: cw.description ?? '',
    workType: cw.workType ?? 'ASSIGNMENT',
    dueDate: cw.dueDate ?? null,
    dueTime: cw.dueTime ?? null,
    alternateLink: cw.alternateLink ?? null,
  }
}

async function shortHash(value: string) {
  const bytes = new TextEncoder().encode(value)
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  const hex = [...new Uint8Array(digest).slice(0, 8)]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')

  return hex
}

function isCourseEnabled(user: UserRecord, courseId: string) {
  if (user.enabledCourseIds.length === 0) return true
  return user.enabledCourseIds.includes(courseId)
}

export async function handleUpdate(context: ApiContext) {
  if (context.request.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405)
  }

  const body = (await context.request.json().catch(() => ({}))) as UpdatePayload
  if (!body.apiKey || !Array.isArray(body.courses)) {
    return json({ error: 'Invalid payload' }, 400)
  }

  const keyLookup = await kvGetJson<ApiKeyRecord>(context.env.ATLAS_KV, apiKeyKey(body.apiKey))
  if (!keyLookup) {
    return json({ error: 'Invalid apiKey' }, 401)
  }

  const user = await kvGetJson<UserRecord>(context.env.ATLAS_KV, userKey(keyLookup.userId))
  if (!user) {
    return json({ error: 'User not found' }, 404)
  }

  if (!user.databaseId) {
    return json({ error: 'No database configured' }, 400)
  }

  let assignmentsAdded = 0
  let assignmentsUpdated = 0
  let assignmentsSkipped = 0

  const mergedCourses = new Map((user.courses ?? []).map((course) => [course.id, course]))

  for (const course of body.courses) {
    mergedCourses.set(course.id, { id: course.id, name: normalizeCourseName(course) })

    if (!isCourseEnabled(user, course.id)) {
      assignmentsSkipped += (course.courseWork?.length ?? 0) + (course.announcements?.length ?? 0)
      continue
    }

    const courseRef: KnownCourse = { id: course.id, name: normalizeCourseName(course) }

    const items: Array<{ item: Coursework | Announcement; isAnnouncement: boolean }> = [
      ...(course.courseWork ?? []).map((item) => ({ item, isAnnouncement: false })),
      ...(course.announcements ?? []).map((item) => ({ item, isAnnouncement: true })),
    ]

    for (const entry of items) {
      const normalized = normalizeItem(entry.item, entry.isAnnouncement)
      const hash = await shortHash(
        `${normalized.title}${normalized.dueDate?.year ?? ''}${normalized.dueDate?.month ?? ''}${normalized.dueDate?.day ?? ''}${normalized.description}`,
      )

      const seenRecord = await kvGetJson<SeenRecord>(context.env.ATLAS_KV, seenKey(user.userId, normalized.id))

      if (!seenRecord) {
        const notionPageId = await createNotionPage(user, normalized, courseRef)
        await kvPutJson(context.env.ATLAS_KV, seenKey(user.userId, normalized.id), { notionPageId, hash })
        assignmentsAdded += 1
        continue
      }

      if (seenRecord.hash === hash) {
        assignmentsSkipped += 1
        continue
      }

      await updateNotionPage(user, seenRecord.notionPageId, normalized, courseRef)
      await kvPutJson(context.env.ATLAS_KV, seenKey(user.userId, normalized.id), {
        notionPageId: seenRecord.notionPageId,
        hash,
      })
      assignmentsUpdated += 1
    }
  }

  user.lastSyncAt = new Date().toISOString()
  user.courses = [...mergedCourses.values()]

  const knownEnabled = new Set(user.enabledCourseIds)
  for (const course of body.courses) {
    if (!knownEnabled.has(course.id)) {
      user.enabledCourseIds.push(course.id)
      knownEnabled.add(course.id)
    }
  }

  const syncLogEntry: SyncLogEntry = {
    timestamp: user.lastSyncAt,
    coursesReceived: body.courses.length,
    assignmentsAdded,
    assignmentsUpdated,
    assignmentsSkipped,
  }

  const currentLog = (await kvGetJson<SyncLogEntry[]>(context.env.ATLAS_KV, syncLogKey(user.userId))) ?? []
  const nextLog = [syncLogEntry, ...currentLog].slice(0, 10)

  await Promise.all([
    kvPutJson(context.env.ATLAS_KV, userKey(user.userId), user),
    kvPutJson(context.env.ATLAS_KV, syncLogKey(user.userId), nextLog),
  ])

  return json({
    added: assignmentsAdded,
    updated: assignmentsUpdated,
    skipped: assignmentsSkipped,
  })
}
