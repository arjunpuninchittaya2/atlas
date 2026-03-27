import { getApiKey } from './storage'

const API_BASE = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, '') ?? ''

function getApiUrl(path: string) {
  if (!path.startsWith('/')) {
    throw new Error('Path must start with /')
  }

  return `${API_BASE}${path}`
}

async function request<T>(path: string, init: RequestInit = {}, includeAuth = true): Promise<T> {
  const headers = new Headers(init.headers)
  headers.set('Content-Type', 'application/json')

  if (includeAuth) {
    const apiKey = getApiKey()
    if (!apiKey) throw new Error('Not authenticated')
    headers.set('Authorization', `Bearer ${apiKey}`)
  }

  const response = await fetch(getApiUrl(path), { ...init, headers })
  const data = (await response.json().catch(() => ({}))) as T & { error?: string }

  if (!response.ok) {
    throw new Error(data.error ?? 'Request failed')
  }

  return data
}

export type AuthCallbackResponse = {
  apiKey: string
  workspaceName: string
}

export type CreateDbResponse = {
  databaseId: string
  databaseUrl: string
  databaseName: string
}

export type SetupInfoResponse = {
  apiKey: string
  updateUrl: string
}

export type VerifyResponse = {
  verified: boolean
}

export type SyncLogEntry = {
  timestamp: string
  coursesReceived: number
  assignmentsAdded: number
  assignmentsUpdated: number
  assignmentsSkipped: number
}

export type DashboardResponse = {
  workspaceName: string
  lastSyncAt: string | null
  syncLog: SyncLogEntry[]
  enabledCourseIds: string[]
  courses: Array<{ id: string; name: string }>
}

export function getPublicApiUrl(path: string) {
  return getApiUrl(path)
}

export function exchangeNotionCode(code: string) {
  return request<AuthCallbackResponse>('/api/auth/callback', {
    method: 'POST',
    body: JSON.stringify({ code }),
  }, false)
}

export function createDatabase(databaseId?: string) {
  return request<CreateDbResponse>('/api/setup/create-db', {
    method: 'POST',
    body: JSON.stringify(databaseId ? { databaseId } : {}),
  })
}

export function getSetupInfo() {
  return request<SetupInfoResponse>('/api/setup-info')
}

export function verifySetup() {
  return request<VerifyResponse>('/api/setup/verify')
}

export function getDashboard() {
  return request<DashboardResponse>('/api/dashboard')
}

export function updateCourses(enabledCourseIds: string[]) {
  return request<{ ok: true }>('/api/dashboard/courses', {
    method: 'POST',
    body: JSON.stringify({ enabledCourseIds }),
  })
}
