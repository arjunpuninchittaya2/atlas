import { apiKeyKey, kvGetJson, userKey, type ApiKeyRecord, type UserRecord } from './types'
import {
  handleRegister,
  handleLogin,
  handleGetProfile,
  handleCompleteSetup,
  handleVerifyInitialSync,
} from './routes/new-auth'
import {
  handleGetDashboard,
  handleCreateCourse,
  handleUpdateCourse,
  handleDeleteCourse,
  handleCreateAssignment,
  handleUpdateAssignment,
  handleDeleteAssignment,
} from './routes/new-dashboard'
import {
  handleAdminClearNamespace,
  handleAdminDeleteUser,
  handleAdminGetUser,
  handleAdminListUsers,
  handleAdminUpdateUser,
} from './routes/admin'
import { handleUpdateSync } from './routes/sync'

export type ApiContext = {
  request: Request
  env: Env
  user: UserRecord | null
  apiKey: string | null
}

function withCors(response: Response) {
  const headers = new Headers(response.headers)
  headers.set('Access-Control-Allow-Origin', '*')
  headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  headers.set('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS')
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  })
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

async function getAuthedUser(request: Request, env: Env) {
  const authorization = request.headers.get('Authorization')
  if (!authorization?.startsWith('Bearer ')) {
    return { user: null, apiKey: null }
  }

  const apiKey = authorization.slice('Bearer '.length).trim()
  if (!apiKey) {
    return { user: null, apiKey: null }
  }

  const mapping = await kvGetJson<ApiKeyRecord>(env.ATLAS_KV, apiKeyKey(apiKey))
  if (!mapping) {
    return { user: null, apiKey: null }
  }

  const user = await kvGetJson<UserRecord>(env.ATLAS_KV, userKey(mapping.userId))
  return { user, apiKey }
}

function requiresAuth(pathname: string) {
  return [
    '/api/admin',
    '/api/profile',
    '/api/setup/complete',
    '/api/setup/verify-initial-sync',
    '/api/dashboard',
    '/api/courses',
    '/api/courses/update',
    '/api/courses/delete',
    '/api/assignments',
    '/api/assignments/update',
    '/api/assignments/delete',
  ].some(path => pathname.startsWith(path))
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url)

    if (request.method === 'OPTIONS') {
      return withCors(new Response(null, { status: 204 }))
    }

    const { user, apiKey } = await getAuthedUser(request, env)
    const context: ApiContext = { request, env, user, apiKey }

    if (requiresAuth(url.pathname) && !user) {
      return withCors(json({ error: 'Unauthorized' }, 401))
    }

    let response: Response

    if (url.pathname === '/health' && request.method === 'GET') {
      response = json({ ok: true })
    } else if (url.pathname === '/update' && request.method === 'POST') {
      try {
        const body = (await request.json().catch(() => ({}))) as {
          apiKey?: string
          syncMode?: string
          courses?: unknown[]
        }

        const payloadApiKey = body.apiKey?.trim()
        if (!payloadApiKey) {
          response = json({ error: 'apiKey required' }, 400)
        } else {
          const mapping = await kvGetJson<ApiKeyRecord>(env.ATLAS_KV, apiKeyKey(payloadApiKey))
          if (!mapping) {
            response = json({ error: 'Invalid apiKey' }, 401)
          } else {
            const syncUser = await kvGetJson<UserRecord>(env.ATLAS_KV, userKey(mapping.userId))
            if (!syncUser) {
              response = json({ error: 'User not found' }, 404)
            } else {
              response = await handleUpdateSync(syncUser, env, {
                syncMode: body.syncMode,
                courses: Array.isArray(body.courses)
                  ? (body.courses as Parameters<typeof handleUpdateSync>[2]['courses'])
                  : [],
              })
            }
          }
        }
      } catch (error) {
        response = json(
          {
            error: 'Sync processing failed',
            details: error instanceof Error ? error.message : 'Unknown error',
          },
          500
        )
      }
    } else if (url.pathname === '/api/auth/register' && request.method === 'POST') {
      response = await handleRegister(context)
    } else if (url.pathname === '/api/auth/login' && request.method === 'POST') {
      response = await handleLogin(context)
    } else if (url.pathname === '/api/profile' && request.method === 'GET') {
      response = await handleGetProfile(context)
    } else if (url.pathname === '/api/setup/complete' && request.method === 'POST') {
      response = await handleCompleteSetup(context)
    } else if (url.pathname === '/api/setup/verify-initial-sync' && request.method === 'GET') {
      response = await handleVerifyInitialSync(context)
    } else if (url.pathname === '/api/dashboard' && request.method === 'GET') {
      response = await handleGetDashboard(context)
    } else if (url.pathname === '/api/courses' && request.method === 'POST') {
      response = await handleCreateCourse(context)
    } else if (url.pathname === '/api/courses/update' && request.method === 'PATCH') {
      response = await handleUpdateCourse(context)
    } else if (url.pathname === '/api/courses/delete' && request.method === 'DELETE') {
      response = await handleDeleteCourse(context)
    } else if (url.pathname === '/api/assignments' && request.method === 'POST') {
      response = await handleCreateAssignment(context)
    } else if (url.pathname === '/api/assignments/update' && request.method === 'PATCH') {
      response = await handleUpdateAssignment(context)
    } else if (url.pathname === '/api/assignments/delete' && request.method === 'DELETE') {
      response = await handleDeleteAssignment(context)
    } else if (url.pathname === '/api/admin/users' && request.method === 'GET') {
      response = await handleAdminListUsers(context)
    } else if (url.pathname === '/api/admin/user' && request.method === 'GET') {
      response = await handleAdminGetUser(context)
    } else if (url.pathname === '/api/admin/user' && request.method === 'PATCH') {
      response = await handleAdminUpdateUser(context)
    } else if (url.pathname === '/api/admin/user' && request.method === 'DELETE') {
      response = await handleAdminDeleteUser(context)
    } else if (url.pathname === '/api/admin/kv/clear' && request.method === 'POST') {
      response = await handleAdminClearNamespace(context)
    } else {
      response = json({ error: 'Not found' }, 404)
    }

    return withCors(response)
  },
} satisfies ExportedHandler<Env>
