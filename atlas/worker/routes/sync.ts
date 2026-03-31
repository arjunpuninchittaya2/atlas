import type { UserRecord } from '../types'
import { kvPutJson, userKey } from '../types'

type ClassroomDueDate = {
  year?: number
  month?: number
  day?: number
}

type ClassroomDueTime = {
  hours?: number
  minutes?: number
}

type CourseWorkItem = {
  id?: string
  title?: string
  description?: string
  workType?: string
  dueDate?: ClassroomDueDate
  dueTime?: ClassroomDueTime
  alternateLink?: string
  completed?: boolean
  submissionState?: string | null
}

type AnnouncementItem = {
  id?: string
  text?: string
  alternateLink?: string
}

type IncomingCourse = {
  id?: string
  name?: string
  section?: string
  courseWork?: CourseWorkItem[]
  announcements?: AnnouncementItem[]
}

type SyncPayload = {
  syncMode?: string
  courses?: IncomingCourse[]
}

function pad2(value: number) {
  return String(value).padStart(2, '0')
}

function mapDueDate(dueDate?: ClassroomDueDate) {
  if (!dueDate?.year || !dueDate?.month || !dueDate?.day) {
    return null
  }

  return `${dueDate.year}-${pad2(dueDate.month)}-${pad2(dueDate.day)}`
}

function mapDueTime(dueTime?: ClassroomDueTime) {
  if (dueTime?.hours === undefined || dueTime?.minutes === undefined) {
    return null
  }

  return `${pad2(dueTime.hours)}:${pad2(dueTime.minutes)}`
}

function mapAssignmentType(workType?: string):
  | 'ASSIGNMENT'
  | 'QUIZ'
  | 'MATERIAL'
  | 'ANNOUNCEMENT' {
  if (workType === 'MULTIPLE_CHOICE_QUESTION' || workType === 'SHORT_ANSWER_QUESTION') {
    return 'QUIZ'
  }
  if (workType === 'MATERIAL') {
    return 'MATERIAL'
  }

  return 'ASSIGNMENT'
}

function mapCompletionStatus(item: CourseWorkItem, current?: 'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETED') {
  const state = item.submissionState
  if (item.completed === true || state === 'TURNED_IN' || state === 'RETURNED') {
    return 'COMPLETED'
  }
  if (state === 'RECLAIMED_BY_STUDENT') {
    return 'IN_PROGRESS'
  }
  if (item.completed === false) {
    return 'NOT_STARTED'
  }

  return current ?? 'NOT_STARTED'
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

export async function handleUpdateSync(user: UserRecord, env: Env, payload: SyncPayload) {
  const now = new Date().toISOString()
  const incomingCourses = Array.isArray(payload.courses) ? payload.courses : []

  let coursesCreated = 0
  let coursesUpdated = 0
  let assignmentsCreated = 0
  let assignmentsUpdated = 0

  for (const incoming of incomingCourses) {
    const incomingCourseId = incoming.id?.trim()
    const incomingCourseName = incoming.name?.trim()
    if (!incomingCourseId || !incomingCourseName) {
      continue
    }

    const existingCourseIndex = user.data.courses.findIndex(c => c.id === incomingCourseId)
    if (existingCourseIndex === -1) {
      user.data.courses.push({
        id: incomingCourseId,
        name: incomingCourseName,
        enabled: true,
        color: null,
        createdAt: now,
      })
      coursesCreated += 1
    } else {
      const existingCourse = user.data.courses[existingCourseIndex]!
      existingCourse.name = incomingCourseName
      existingCourse.enabled = true
      coursesUpdated += 1
    }

    const courseWork = Array.isArray(incoming.courseWork) ? incoming.courseWork : []
    for (const item of courseWork) {
      const workId = item.id?.trim()
      const title = item.title?.trim()
      if (!workId || !title) {
        continue
      }

      const assignmentId = `cw:${incomingCourseId}:${workId}`
      const existingAssignmentIndex = user.data.assignments.findIndex(a => a.id === assignmentId)
      const mappedType = mapAssignmentType(item.workType)
      const dueDate = mapDueDate(item.dueDate)
      const dueTime = mapDueTime(item.dueTime)
      const description = item.description?.trim() || ''
      const link = item.alternateLink?.trim() || null
      const status = mapCompletionStatus(item)

      if (existingAssignmentIndex === -1) {
        user.data.assignments.push({
          id: assignmentId,
          title,
          description,
          courseId: incomingCourseId,
          dueDate,
          dueTime,
          type: mappedType,
          status,
          link,
          createdAt: now,
          updatedAt: now,
        })
        assignmentsCreated += 1
      } else {
        const existing = user.data.assignments[existingAssignmentIndex]!
        existing.title = title
        existing.description = description
        existing.courseId = incomingCourseId
        existing.dueDate = dueDate
        existing.dueTime = dueTime
        existing.type = mappedType
        existing.link = link
        existing.status = mapCompletionStatus(item, existing.status)
        existing.updatedAt = now
        assignmentsUpdated += 1
      }
    }

    const announcements = Array.isArray(incoming.announcements) ? incoming.announcements : []
    for (const item of announcements) {
      const annId = item.id?.trim()
      const text = item.text?.trim()
      if (!annId || !text) {
        continue
      }

      const assignmentId = `ann:${incomingCourseId}:${annId}`
      const existingAssignmentIndex = user.data.assignments.findIndex(a => a.id === assignmentId)
      const link = item.alternateLink?.trim() || null

      if (existingAssignmentIndex === -1) {
        user.data.assignments.push({
          id: assignmentId,
          title: text.slice(0, 120),
          description: text,
          courseId: incomingCourseId,
          dueDate: null,
          dueTime: null,
          type: 'ANNOUNCEMENT',
          status: 'NOT_STARTED',
          link,
          createdAt: now,
          updatedAt: now,
        })
        assignmentsCreated += 1
      } else {
        const existing = user.data.assignments[existingAssignmentIndex]!
        existing.title = text.slice(0, 120)
        existing.description = text
        existing.courseId = incomingCourseId
        existing.type = 'ANNOUNCEMENT'
        existing.link = link
        existing.updatedAt = now
        assignmentsUpdated += 1
      }
    }
  }

  user.updatedAt = now
  user.data.syncLog.push({
    timestamp: now,
    action: 'CLASSROOM_SYNC',
    details: `mode=${payload.syncMode ?? 'queued'} courses+${coursesCreated}/~${coursesUpdated} assignments+${assignmentsCreated}/~${assignmentsUpdated}`,
  })
  if (user.data.syncLog.length > 100) {
    user.data.syncLog = user.data.syncLog.slice(-100)
  }

  await kvPutJson(env.ATLAS_KV, userKey(user.userId), user)

  return json({
    ok: true,
    syncMode: payload.syncMode ?? 'queued',
    coursesCreated,
    coursesUpdated,
    assignmentsCreated,
    assignmentsUpdated,
    assignmentsSynced: assignmentsCreated + assignmentsUpdated,
  })
}
