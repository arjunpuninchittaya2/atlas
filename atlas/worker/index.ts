import { apiKeyKey, kvGetJson, userKey, type ApiKeyRecord, type UserRecord } from './types'
import { handleRegister, handleLogin, handleGetProfile } from './routes/new-auth'
import {
  handleGetDashboard,
  handleCreateCourse,
  handleUpdateCourse,
  handleDeleteCourse,
  handleCreateAssignment,
  handleUpdateAssignment,
  handleDeleteAssignment,
} from './routes/new-dashboard'

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
    '/api/profile',
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
    } else if (url.pathname === '/api/auth/register' && request.method === 'POST') {
      response = await handleRegister(context)
    } else if (url.pathname === '/api/auth/login' && request.method === 'POST') {
      response = await handleLogin(context)
    } else if (url.pathname === '/api/profile' && request.method === 'GET') {
      response = await handleGetProfile(context)
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
    } else {
      response = json({ error: 'Not found' }, 404)
    }

    return withCors(response)
  },
} satisfies ExportedHandler<Env>
