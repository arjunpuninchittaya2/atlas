import type { ApiContext } from '../index'
import { apiKeyKey, emailToUserIdKey, kvGetJson, kvPutJson, userKey, type UserRecord } from '../types'

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

// Simple password hashing using Web Crypto API
async function hashPassword(password: string): Promise<string> {
  const encoder = new TextEncoder()
  const data = encoder.encode(password)
  const hash = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(hash))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
}

export async function handleRegister(context: ApiContext) {
  if (context.request.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405)
  }

  const body = (await context.request.json().catch(() => ({}))) as {
    email?: string
    password?: string
    name?: string
  }

  if (!body.email || !body.password) {
    return json({ error: 'Email and password required' }, 400)
  }

  // Validate email format
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  if (!emailRegex.test(body.email)) {
    return json({ error: 'Invalid email format' }, 400)
  }

  // Validate password strength
  if (body.password.length < 8) {
    return json({ error: 'Password must be at least 8 characters' }, 400)
  }

  const email = body.email.toLowerCase()

  // Check if user already exists
  const existingUserId = await kvGetJson<string>(context.env.ATLAS_KV, emailToUserIdKey(email))
  if (existingUserId) {
    return json({ error: 'Email already registered' }, 409)
  }

  try {
    const userId = crypto.randomUUID()
    const apiKey = crypto.randomUUID().replaceAll('-', '')
    const passwordHash = await hashPassword(body.password)
    const now = new Date().toISOString()

    const userRecord: UserRecord = {
      userId,
      email,
      passwordHash,
      data: {
        profile: {
          email,
          name: body.name || null,
          timezone: context.request.headers.get('CF-Timezone') ?? 'UTC',
          createdAt: now,
          lastLoginAt: now,
        },
        courses: [],
        assignments: [],
        syncLog: [],
      },
      createdAt: now,
      updatedAt: now,
    }

    await Promise.all([
      kvPutJson(context.env.ATLAS_KV, userKey(userId), userRecord),
      kvPutJson(context.env.ATLAS_KV, emailToUserIdKey(email), userId),
      kvPutJson(context.env.ATLAS_KV, apiKeyKey(apiKey), { userId }),
    ])

    return json({
      apiKey,
      user: {
        id: userId,
        email,
        name: body.name || null,
      },
    })
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'Registration failed' }, 500)
  }
}

export async function handleLogin(context: ApiContext) {
  if (context.request.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405)
  }

  const body = (await context.request.json().catch(() => ({}))) as {
    email?: string
    password?: string
  }

  if (!body.email || !body.password) {
    return json({ error: 'Email and password required' }, 400)
  }

  const email = body.email.toLowerCase()

  try {
    // Get user ID from email
    const userId = await kvGetJson<string>(context.env.ATLAS_KV, emailToUserIdKey(email))
    if (!userId) {
      return json({ error: 'Invalid email or password' }, 401)
    }

    // Get user record
    const user = await kvGetJson<UserRecord>(context.env.ATLAS_KV, userKey(userId))
    if (!user) {
      return json({ error: 'Invalid email or password' }, 401)
    }

    // Verify password
    const passwordHash = await hashPassword(body.password)
    if (passwordHash !== user.passwordHash) {
      return json({ error: 'Invalid email or password' }, 401)
    }

    // Generate new API key
    const apiKey = crypto.randomUUID().replaceAll('-', '')
    await kvPutJson(context.env.ATLAS_KV, apiKeyKey(apiKey), { userId })

    // Update last login time
    user.data.profile.lastLoginAt = new Date().toISOString()
    user.updatedAt = new Date().toISOString()
    await kvPutJson(context.env.ATLAS_KV, userKey(userId), user)

    return json({
      apiKey,
      user: {
        id: user.userId,
        email: user.email,
        name: user.data.profile.name,
      },
    })
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'Login failed' }, 500)
  }
}

export async function handleGetProfile(context: ApiContext) {
  if (!context.user) {
    return json({ error: 'Unauthorized' }, 401)
  }

  return json({
    user: {
      id: context.user.userId,
      email: context.user.email,
      name: context.user.data.profile.name,
      timezone: context.user.data.profile.timezone,
      createdAt: context.user.data.profile.createdAt,
    },
  })
}
