import type { ApiContext } from '../index'
import { kvPutJson, userKey } from '../kv'
import { createNotionDatabaseForUser } from '../notion'

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function getDatabaseUrl(databaseId: string) {
  return `https://www.notion.so/${databaseId.replaceAll('-', '')}`
}

export async function handleSetupCreateDb(context: ApiContext) {
  if (!context.user) {
    return json({ error: 'Unauthorized' }, 401)
  }

  if (context.request.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405)
  }

  const body = (await context.request.json().catch(() => ({}))) as { databaseId?: string }
  const user = context.user

  if (body.databaseId) {
    user.databaseId = body.databaseId
    await kvPutJson(context.env.ATLAS_KV, userKey(user.userId), user)

    return json({
      databaseId: body.databaseId,
      databaseUrl: getDatabaseUrl(body.databaseId),
      databaseName: 'Connected database',
    })
  }

  try {
    const db = await createNotionDatabaseForUser(user)
    user.databaseId = db.id
    await kvPutJson(context.env.ATLAS_KV, userKey(user.userId), user)

    return json({
      databaseId: db.id,
      databaseUrl: db.url,
      databaseName: db.title,
    })
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'Failed to create database' }, 400)
  }
}

export async function handleSetupVerify(context: ApiContext) {
  if (!context.user) {
    return json({ error: 'Unauthorized' }, 401)
  }

  return json({ verified: Boolean(context.user.lastSyncAt) })
}

export async function handleSetupInfo(context: ApiContext) {
  if (!context.user || !context.apiKey) {
    return json({ error: 'Unauthorized' }, 401)
  }

  const updateUrl = `${new URL(context.request.url).origin}/update`
  return json({ apiKey: context.apiKey, updateUrl })
}

