import type { ApiContext } from '../index'
import { apiKeyKey, kvPutJson, userKey, type UserRecord } from '../kv'
import { exchangeNotionCode } from '../notion'

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function getAuthRedirect(env: Env) {
  const url = new URL('https://api.notion.com/v1/oauth/authorize')
  url.searchParams.set('client_id', env.NOTION_CLIENT_ID)
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('owner', 'user')
  url.searchParams.set('redirect_uri', env.NOTION_REDIRECT_URI)
  return url.toString()
}

export async function handleAuthNotion(context: ApiContext) {
  const redirectUrl = getAuthRedirect(context.env)
  return Response.redirect(redirectUrl, 302)
}

export async function handleAuthCallback(context: ApiContext) {
  if (context.request.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405)
  }

  const body = (await context.request.json().catch(() => ({}))) as { code?: string }
  if (!body.code) {
    return json({ error: 'Missing code' }, 400)
  }

  try {
    const oauth = await exchangeNotionCode(
      context.env.NOTION_CLIENT_ID,
      context.env.NOTION_CLIENT_SECRET,
      context.env.NOTION_REDIRECT_URI,
      body.code,
    )

    const userId = crypto.randomUUID()
    const apiKey = crypto.randomUUID().replaceAll('-', '')

    const userRecord: UserRecord = {
      userId,
      notionAccessToken: oauth.access_token,
      notionRefreshToken: oauth.refresh_token ?? null,
      workspaceName: oauth.workspace_name,
      workspaceId: oauth.workspace_id,
      databaseId: null,
      timezone: context.request.headers.get('CF-Timezone') ?? 'UTC',
      enabledCourseIds: [],
      createdAt: new Date().toISOString(),
      lastSyncAt: null,
      courses: [],
    }

    await Promise.all([
      kvPutJson(context.env.ATLAS_KV, userKey(userId), userRecord),
      kvPutJson(context.env.ATLAS_KV, apiKeyKey(apiKey), { userId }),
    ])

    return json({ apiKey, workspaceName: oauth.workspace_name })
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'Auth failed' }, 400)
  }
}
