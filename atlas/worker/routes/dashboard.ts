import type { ApiContext } from '../index'
import { kvGetJson, kvPutJson, syncLogKey, userKey, type SyncLogEntry } from '../kv'

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

export async function handleDashboardGet(context: ApiContext) {
  if (!context.user) {
    return json({ error: 'Unauthorized' }, 401)
  }

  const syncLog = (await kvGetJson<SyncLogEntry[]>(context.env.ATLAS_KV, syncLogKey(context.user.userId))) ?? []

  return json({
    workspaceName: context.user.workspaceName,
    lastSyncAt: context.user.lastSyncAt,
    syncLog,
    enabledCourseIds: context.user.enabledCourseIds,
    courses: context.user.courses ?? [],
  })
}

export async function handleDashboardCourses(context: ApiContext) {
  if (!context.user) {
    return json({ error: 'Unauthorized' }, 401)
  }

  if (context.request.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405)
  }

  const body = (await context.request.json().catch(() => ({}))) as { enabledCourseIds?: unknown }

  if (!Array.isArray(body.enabledCourseIds) || !body.enabledCourseIds.every((id) => typeof id === 'string')) {
    return json({ error: 'enabledCourseIds must be an array of strings' }, 400)
  }

  context.user.enabledCourseIds = body.enabledCourseIds
  await kvPutJson(context.env.ATLAS_KV, userKey(context.user.userId), context.user)

  return json({ ok: true })
}
