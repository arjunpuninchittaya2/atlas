import type { KnownCourse, UserRecord } from './kv'

type NotionPropertyValue = Record<string, unknown>

type NormalizedItem = {
  id: string
  title: string
  description: string
  workType: string
  dueDate: { year: number; month: number; day: number } | null
  dueTime: { hours: number; minutes: number } | null
  alternateLink: string | null
}

const NOTION_VERSION = '2022-06-28'

async function notionRequest<T>(
  token: string,
  path: string,
  init: RequestInit,
): Promise<T> {
  const response = await fetch(`https://api.notion.com/v1${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      'Notion-Version': NOTION_VERSION,
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  })

  const data = (await response.json().catch(() => ({}))) as T & { message?: string }
  if (!response.ok) {
    throw new Error(data.message ?? 'Notion request failed')
  }

  return data
}

export async function createNotionDatabaseForUser(
  user: UserRecord,
): Promise<{ id: string; url: string; title: string }> {
  const searchRes = await notionRequest<{ results: Array<{ id: string }> }>(user.notionAccessToken, '/search', {
    method: 'POST',
    body: JSON.stringify({
      filter: { property: 'object', value: 'page' },
      page_size: 1,
    }),
  })

  const parentPageId = searchRes.results[0]?.id
  if (!parentPageId) {
    throw new Error('No writable Notion page found. Share at least one page with the integration first.')
  }

  const databaseName = 'ATLAS Assignments'
  const payload = {
    parent: { type: 'page_id', page_id: parentPageId },
    title: [{ type: 'text', text: { content: databaseName } }],
    properties: {
      Title: { title: {} },
      Course: { select: {} },
      'Due Date': { date: {} },
      Type: { select: {} },
      Description: { rich_text: {} },
      Link: { url: {} },
      Status: { select: {} },
      'Classroom ID': { rich_text: {} },
    },
  }

  const result = await notionRequest<{ id: string; url: string }>(user.notionAccessToken, '/databases', {
    method: 'POST',
    body: JSON.stringify(payload),
  })

  return {
    id: result.id,
    url: result.url,
    title: databaseName,
  }
}

function dateOnlyString(dueDate: { year: number; month: number; day: number }) {
  const month = String(dueDate.month).padStart(2, '0')
  const day = String(dueDate.day).padStart(2, '0')
  return `${dueDate.year}-${month}-${day}`
}

function formatLocalParts(date: Date, timeZone: string) {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })

  const parts = formatter.formatToParts(date)
  const get = (type: string) => Number(parts.find((part) => part.type === type)?.value ?? 0)
  return {
    year: get('year'),
    month: get('month'),
    day: get('day'),
    hour: get('hour'),
    minute: get('minute'),
  }
}

function toUtcIsoInTimeZone(
  dueDate: { year: number; month: number; day: number },
  dueTime: { hours: number; minutes: number },
  timeZone: string,
) {
  let guess = Date.UTC(dueDate.year, dueDate.month - 1, dueDate.day, dueTime.hours, dueTime.minutes, 0)

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const parts = formatLocalParts(new Date(guess), timeZone)
    const target = Date.UTC(dueDate.year, dueDate.month - 1, dueDate.day, dueTime.hours, dueTime.minutes, 0)
    const seen = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, 0)
    guess += target - seen
  }

  return new Date(guess).toISOString()
}

function truncate(value: string, limit: number) {
  return value.length > limit ? value.slice(0, limit) : value
}

function toProperties(
  item: NormalizedItem,
  courseName: string,
  user: UserRecord,
  includeStatus: boolean,
): Record<string, NotionPropertyValue> {
  const dueDateValue = item.dueDate
    ? item.dueTime
      ? { start: toUtcIsoInTimeZone(item.dueDate, item.dueTime, user.timezone) }
      : { start: dateOnlyString(item.dueDate) }
    : null

  const properties: Record<string, NotionPropertyValue> = {
    Title: {
      title: [{ type: 'text', text: { content: truncate(item.title || 'Untitled', 100) } }],
    },
    Course: {
      select: { name: truncate(courseName || 'Unknown Course', 100) },
    },
    'Due Date': {
      date: dueDateValue,
    },
    Type: {
      select: { name: truncate(item.workType || 'ANNOUNCEMENT', 100) },
    },
    Description: {
      rich_text: item.description
        ? [{ type: 'text', text: { content: truncate(item.description, 2000) } }]
        : [],
    },
    Link: {
      url: item.alternateLink,
    },
    'Classroom ID': {
      rich_text: [{ type: 'text', text: { content: item.id } }],
    },
  }

  if (includeStatus) {
    properties.Status = { select: { name: 'Not Started' } }
  }

  return properties
}

export async function createNotionPage(
  user: UserRecord,
  item: NormalizedItem,
  course: KnownCourse,
): Promise<string> {
  if (!user.databaseId) {
    throw new Error('No database configured')
  }

  const response = await notionRequest<{ id: string }>(user.notionAccessToken, '/pages', {
    method: 'POST',
    body: JSON.stringify({
      parent: { database_id: user.databaseId },
      properties: toProperties(item, course.name, user, true),
    }),
  })

  return response.id
}

export async function updateNotionPage(
  user: UserRecord,
  notionPageId: string,
  item: NormalizedItem,
  course: KnownCourse,
): Promise<void> {
  await notionRequest(user.notionAccessToken, `/pages/${notionPageId}`, {
    method: 'PATCH',
    body: JSON.stringify({
      properties: toProperties(item, course.name, user, false),
    }),
  })
}

export type OAuthExchangeResponse = {
  access_token: string
  refresh_token?: string
  workspace_name: string
  workspace_id: string
  owner: {
    user?: {
      id: string
    }
  }
}

export async function exchangeNotionCode(
  clientId: string,
  clientSecret: string,
  redirectUri: string,
  code: string,
): Promise<OAuthExchangeResponse> {
  const basic = btoa(`${clientId}:${clientSecret}`)

  const response = await fetch('https://api.notion.com/v1/oauth/token', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${basic}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
    }),
  })

  const data = (await response.json().catch(() => ({}))) as OAuthExchangeResponse & { error?: string; message?: string }
  if (!response.ok) {
    throw new Error(data.error ?? data.message ?? 'Unable to authenticate with Notion')
  }

  return data
}
