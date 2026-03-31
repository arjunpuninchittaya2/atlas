import type { ApiContext } from '../index'
import {
  apiKeyKey,
  emailToUserIdKey,
  kvGetJson,
  kvPutJson,
  userKey,
  type ApiKeyRecord,
  type UserRecord,
} from '../types'

const ADMIN_EMAIL = '9961749@bedfordnhk12.net'

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function isAdmin(context: ApiContext) {
  return context.user?.email.toLowerCase() === ADMIN_EMAIL
}

function requireAdmin(context: ApiContext) {
  if (!context.user) return json({ error: 'Unauthorized' }, 401)
  if (!isAdmin(context)) return json({ error: 'Forbidden' }, 403)
  return null
}

async function listAllKeys(kv: KVNamespace, prefix?: string): Promise<string[]> {
  const keys: string[] = []
  let cursor: string | undefined

  do {
    const page = await kv.list({ prefix, cursor })
    keys.push(...page.keys.map(k => k.name))
    cursor = page.list_complete ? undefined : page.cursor
  } while (cursor)

  return keys
}

export async function handleAdminListUsers(context: ApiContext) {
  const authError = requireAdmin(context)
  if (authError) return authError

  const keys = await listAllKeys(context.env.ATLAS_KV, 'user:')
  const users = (
    await Promise.all(keys.map(key => kvGetJson<UserRecord>(context.env.ATLAS_KV, key)))
  ).filter(Boolean) as UserRecord[]

  return json({
    users: users.map(user => ({
      userId: user.userId,
      email: user.email,
      name: user.data.profile.name,
      courses: user.data.courses.length,
      assignments: user.data.assignments.length,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    })),
  })
}

export async function handleAdminGetUser(context: ApiContext) {
  const authError = requireAdmin(context)
  if (authError) return authError

  const url = new URL(context.request.url)
  const userId = url.searchParams.get('userId')
  if (!userId) return json({ error: 'userId required' }, 400)

  const user = await kvGetJson<UserRecord>(context.env.ATLAS_KV, userKey(userId))
  if (!user) return json({ error: 'User not found' }, 404)

  return json({ user })
}

export async function handleAdminUpdateUser(context: ApiContext) {
  const authError = requireAdmin(context)
  if (authError) return authError

  if (context.request.method !== 'PATCH') {
    return json({ error: 'Method not allowed' }, 405)
  }

  const body = (await context.request.json().catch(() => ({}))) as {
    user?: UserRecord
  }

  if (!body.user?.userId || !body.user.email) {
    return json({ error: 'Valid user object required' }, 400)
  }

  const existing = await kvGetJson<UserRecord>(context.env.ATLAS_KV, userKey(body.user.userId))
  if (!existing) {
    return json({ error: 'User not found' }, 404)
  }

  const nextUser: UserRecord = {
    ...body.user,
    email: body.user.email.toLowerCase(),
    updatedAt: new Date().toISOString(),
  }

  await kvPutJson(context.env.ATLAS_KV, userKey(nextUser.userId), nextUser)

  if (existing.email.toLowerCase() !== nextUser.email.toLowerCase()) {
    await context.env.ATLAS_KV.delete(emailToUserIdKey(existing.email))
  }
  await kvPutJson(context.env.ATLAS_KV, emailToUserIdKey(nextUser.email), nextUser.userId)

  return json({ user: nextUser })
}

export async function handleAdminDeleteUser(context: ApiContext) {
  const authError = requireAdmin(context)
  if (authError) return authError

  const url = new URL(context.request.url)
  const userId = url.searchParams.get('userId')
  if (!userId) return json({ error: 'userId required' }, 400)

  const user = await kvGetJson<UserRecord>(context.env.ATLAS_KV, userKey(userId))
  if (!user) return json({ error: 'User not found' }, 404)

  const apiKeyNames = await listAllKeys(context.env.ATLAS_KV, 'apikey:')
  const apiKeysForUser: string[] = []

  for (const keyName of apiKeyNames) {
    const apiKey = keyName.replace(/^apikey:/, '')
    const mapping = await kvGetJson<ApiKeyRecord>(context.env.ATLAS_KV, apiKeyKey(apiKey))
    if (mapping?.userId === userId) {
      apiKeysForUser.push(keyName)
    }
  }

  await Promise.all([
    context.env.ATLAS_KV.delete(userKey(userId)),
    context.env.ATLAS_KV.delete(emailToUserIdKey(user.email)),
    ...apiKeysForUser.map(key => context.env.ATLAS_KV.delete(key)),
  ])

  return json({ ok: true, deletedApiKeys: apiKeysForUser.length })
}

export async function handleAdminClearNamespace(context: ApiContext) {
  const authError = requireAdmin(context)
  if (authError) return authError

  if (context.request.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405)
  }

  const allKeys = await listAllKeys(context.env.ATLAS_KV)
  await Promise.all(allKeys.map(key => context.env.ATLAS_KV.delete(key)))

  return json({ ok: true, deleted: allKeys.length })
}
