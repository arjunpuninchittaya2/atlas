// New user data structure - stores all user data in a large JSON object

export type Assignment = {
  id: string
  title: string
  description: string
  courseId: string
  dueDate: string | null
  dueTime: string | null
  type: 'ASSIGNMENT' | 'QUIZ' | 'MATERIAL' | 'ANNOUNCEMENT'
  status: 'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETED'
  link: string | null
  createdAt: string
  updatedAt: string
}

export type Course = {
  id: string
  name: string
  enabled: boolean
  color: string | null
  createdAt: string
}

export type SyncLogEntry = {
  timestamp: string
  action: string
  details: string
}

export type UserData = {
  profile: {
    email: string
    name: string | null
    timezone: string
    createdAt: string
    lastLoginAt: string
  }
  courses: Course[]
  assignments: Assignment[]
  syncLog: SyncLogEntry[]
}

export type UserRecord = {
  userId: string
  email: string
  passwordHash: string
  data: UserData
  createdAt: string
  updatedAt: string
}

export type ApiKeyRecord = {
  userId: string
}

// KV helper functions
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

export function emailToUserIdKey(email: string) {
  return `email:${email.toLowerCase()}`
}

export function apiKeyKey(apiKey: string) {
  return `apikey:${apiKey}`
}

export function syncLogKey(userId: string) {
  return `synclog:${userId}`
}
