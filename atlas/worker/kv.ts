export type SyncLogEntry = {
  timestamp: string
  coursesReceived: number
  assignmentsAdded: number
  assignmentsUpdated: number
  assignmentsSkipped: number
}

export type KnownCourse = {
  id: string
  name: string
}

export type UserRecord = {
  userId: string
  notionAccessToken: string
  notionRefreshToken: string | null
  workspaceName: string
  workspaceId: string
  databaseId: string | null
  timezone: string
  enabledCourseIds: string[]
  createdAt: string
  lastSyncAt: string | null
  courses?: KnownCourse[]
}

export type SeenRecord = {
  notionPageId: string
  hash: string
}

export type ApiKeyRecord = {
  userId: string
}

export async function kvGetJson<T>(kv: KVNamespace, key: string): Promise<T | null> {
  const value = await kv.get(key)
  if (!value) return null

  try {
    return JSON.parse(value) as T
  } catch {
    return null
  }
}

export async function kvPutJson(kv: KVNamespace, key: string, value: unknown): Promise<void> {
  await kv.put(key, JSON.stringify(value))
}

export function userKey(userId: string) {
  return `user:${userId}`
}

export function apiKeyKey(apiKey: string) {
  return `apikey:${apiKey}`
}

export function seenKey(userId: string, assignmentId: string) {
  return `seen:${userId}:${assignmentId}`
}

export function syncLogKey(userId: string) {
  return `synclog:${userId}`
}
