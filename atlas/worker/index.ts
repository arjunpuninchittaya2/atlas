import { apiKeyKey, kvGetJson, userKey, type ApiKeyRecord, type UserRecord } from './kv'
import { handleAuthCallback, handleAuthNotion } from './routes/auth'
import { handleDashboardCourses, handleDashboardGet } from './routes/dashboard'
import { handleSetupCreateDb, handleSetupInfo, handleSetupVerify } from './routes/setup'
import { handleUpdate } from './routes/update'

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
  headers.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
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
    '/api/setup/create-db',
    '/api/setup/verify',
    '/api/setup-info',
    '/api/dashboard',
    '/api/dashboard/courses',
  ].includes(pathname)
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
    } else if (url.pathname === '/api/auth/notion' && request.method === 'GET') {
      response = await handleAuthNotion(context)
    } else if (url.pathname === '/api/auth/callback') {
      response = await handleAuthCallback(context)
    } else if (url.pathname === '/api/setup/create-db') {
      response = await handleSetupCreateDb(context)
    } else if (url.pathname === '/api/setup/verify' && request.method === 'GET') {
      response = await handleSetupVerify(context)
    } else if (url.pathname === '/api/setup-info' && request.method === 'GET') {
      response = await handleSetupInfo(context)
    } else if (url.pathname === '/api/dashboard' && request.method === 'GET') {
      response = await handleDashboardGet(context)
    } else if (url.pathname === '/api/dashboard/courses') {
      response = await handleDashboardCourses(context)
    } else if (url.pathname === '/update') {
      response = await handleUpdate(context)
    } else {
      response = json({ error: 'Not found' }, 404)
    }

    return withCors(response)
  },
} satisfies ExportedHandler<Env>
