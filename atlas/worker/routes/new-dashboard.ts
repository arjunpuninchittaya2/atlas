import type { ApiContext } from '../index'
import { kvPutJson, userKey, type Assignment, type Course } from '../types'

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

export async function handleGetDashboard(context: ApiContext) {
  if (!context.user) {
    return json({ error: 'Unauthorized' }, 401)
  }

  return json({
    user: {
      id: context.user.userId,
      email: context.user.email,
      name: context.user.data.profile.name,
    },
    courses: context.user.data.courses,
    assignments: context.user.data.assignments,
    syncLog: context.user.data.syncLog.slice(-10), // Last 10 logs
  })
}

export async function handleCreateCourse(context: ApiContext) {
  if (!context.user) {
    return json({ error: 'Unauthorized' }, 401)
  }

  if (context.request.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405)
  }

  const body = (await context.request.json().catch(() => ({}))) as {
    name?: string
    color?: string
  }

  if (!body.name) {
    return json({ error: 'Course name required' }, 400)
  }

  const course: Course = {
    id: crypto.randomUUID(),
    name: body.name,
    enabled: true,
    color: body.color || null,
    createdAt: new Date().toISOString(),
  }

  context.user.data.courses.push(course)
  context.user.updatedAt = new Date().toISOString()
  await kvPutJson(context.env.ATLAS_KV, userKey(context.user.userId), context.user)

  return json({ course })
}

export async function handleUpdateCourse(context: ApiContext) {
  if (!context.user) {
    return json({ error: 'Unauthorized' }, 401)
  }

  if (context.request.method !== 'PATCH') {
    return json({ error: 'Method not allowed' }, 405)
  }

  const body = (await context.request.json().catch(() => ({}))) as {
    id?: string
    name?: string
    enabled?: boolean
    color?: string
  }

  if (!body.id) {
    return json({ error: 'Course ID required' }, 400)
  }

  const courseIndex = context.user.data.courses.findIndex(c => c.id === body.id)
  if (courseIndex === -1) {
    return json({ error: 'Course not found' }, 404)
  }

  const course = context.user.data.courses[courseIndex]!
  if (body.name !== undefined) course.name = body.name
  if (body.enabled !== undefined) course.enabled = body.enabled
  if (body.color !== undefined) course.color = body.color

  context.user.updatedAt = new Date().toISOString()
  await kvPutJson(context.env.ATLAS_KV, userKey(context.user.userId), context.user)

  return json({ course })
}

export async function handleDeleteCourse(context: ApiContext) {
  if (!context.user) {
    return json({ error: 'Unauthorized' }, 401)
  }

  if (context.request.method !== 'DELETE') {
    return json({ error: 'Method not allowed' }, 405)
  }

  const url = new URL(context.request.url)
  const courseId = url.searchParams.get('id')

  if (!courseId) {
    return json({ error: 'Course ID required' }, 400)
  }

  const courseIndex = context.user.data.courses.findIndex(c => c.id === courseId)
  if (courseIndex === -1) {
    return json({ error: 'Course not found' }, 404)
  }

  context.user.data.courses.splice(courseIndex, 1)
  // Also remove all assignments for this course
  context.user.data.assignments = context.user.data.assignments.filter(a => a.courseId !== courseId)

  context.user.updatedAt = new Date().toISOString()
  await kvPutJson(context.env.ATLAS_KV, userKey(context.user.userId), context.user)

  return json({ ok: true })
}

export async function handleCreateAssignment(context: ApiContext) {
  if (!context.user) {
    return json({ error: 'Unauthorized' }, 401)
  }

  if (context.request.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405)
  }

  const body = (await context.request.json().catch(() => ({}))) as {
    title?: string
    description?: string
    courseId?: string
    dueDate?: string
    dueTime?: string
    type?: Assignment['type']
    link?: string
  }

  if (!body.title || !body.courseId) {
    return json({ error: 'Title and course ID required' }, 400)
  }

  // Verify course exists
  const courseExists = context.user.data.courses.some(c => c.id === body.courseId)
  if (!courseExists) {
    return json({ error: 'Course not found' }, 404)
  }

  const now = new Date().toISOString()
  const assignment: Assignment = {
    id: crypto.randomUUID(),
    title: body.title,
    description: body.description || '',
    courseId: body.courseId,
    dueDate: body.dueDate || null,
    dueTime: body.dueTime || null,
    type: body.type || 'ASSIGNMENT',
    status: 'NOT_STARTED',
    link: body.link || null,
    createdAt: now,
    updatedAt: now,
  }

  context.user.data.assignments.push(assignment)
  context.user.updatedAt = new Date().toISOString()
  await kvPutJson(context.env.ATLAS_KV, userKey(context.user.userId), context.user)

  return json({ assignment })
}

export async function handleUpdateAssignment(context: ApiContext) {
  if (!context.user) {
    return json({ error: 'Unauthorized' }, 401)
  }

  if (context.request.method !== 'PATCH') {
    return json({ error: 'Method not allowed' }, 405)
  }

  const body = (await context.request.json().catch(() => ({}))) as {
    id?: string
    title?: string
    description?: string
    dueDate?: string
    dueTime?: string
    status?: Assignment['status']
    link?: string
  }

  if (!body.id) {
    return json({ error: 'Assignment ID required' }, 400)
  }

  const assignmentIndex = context.user.data.assignments.findIndex(a => a.id === body.id)
  if (assignmentIndex === -1) {
    return json({ error: 'Assignment not found' }, 404)
  }

  const assignment = context.user.data.assignments[assignmentIndex]!
  if (body.title !== undefined) assignment.title = body.title
  if (body.description !== undefined) assignment.description = body.description
  if (body.dueDate !== undefined) assignment.dueDate = body.dueDate
  if (body.dueTime !== undefined) assignment.dueTime = body.dueTime
  if (body.status !== undefined) assignment.status = body.status
  if (body.link !== undefined) assignment.link = body.link
  assignment.updatedAt = new Date().toISOString()

  context.user.updatedAt = new Date().toISOString()
  await kvPutJson(context.env.ATLAS_KV, userKey(context.user.userId), context.user)

  return json({ assignment })
}

export async function handleDeleteAssignment(context: ApiContext) {
  if (!context.user) {
    return json({ error: 'Unauthorized' }, 401)
  }

  if (context.request.method !== 'DELETE') {
    return json({ error: 'Method not allowed' }, 405)
  }

  const url = new URL(context.request.url)
  const assignmentId = url.searchParams.get('id')

  if (!assignmentId) {
    return json({ error: 'Assignment ID required' }, 400)
  }

  const assignmentIndex = context.user.data.assignments.findIndex(a => a.id === assignmentId)
  if (assignmentIndex === -1) {
    return json({ error: 'Assignment not found' }, 404)
  }

  context.user.data.assignments.splice(assignmentIndex, 1)
  context.user.updatedAt = new Date().toISOString()
  await kvPutJson(context.env.ATLAS_KV, userKey(context.user.userId), context.user)

  return json({ ok: true })
}
