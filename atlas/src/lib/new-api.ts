import { getApiKey, setApiKey, clearApiKey } from './storage'

// Empty fallback intentionally uses relative paths in local dev through Vite proxy.
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

// Types
export type User = {
  id: string
  email: string
  name: string | null
  setupCompleted?: boolean
  appScriptUrl?: string | null
}

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

export type RegisterResponse = {
  apiKey: string
  user: User
}

export type LoginResponse = {
  apiKey: string
  user: User
}

export type DashboardResponse = {
  user: User
  courses: Course[]
  assignments: Assignment[]
  syncLog: SyncLogEntry[]
}

export type AdminUserSummary = {
  userId: string
  email: string
  name: string | null
  courses: number
  assignments: number
  createdAt: string
  updatedAt: string
}

export type AdminUserRecord = {
  userId: string
  email: string
  passwordHash: string
  data: {
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
  createdAt: string
  updatedAt: string
}

// Auth API
export async function register(email: string, password: string, name?: string) {
  const response = await request<RegisterResponse>(
    '/api/auth/register',
    {
      method: 'POST',
      body: JSON.stringify({ email, password, name }),
    },
    false
  )
  setApiKey(response.apiKey)
  return response
}

export async function login(email: string, password: string) {
  const response = await request<LoginResponse>(
    '/api/auth/login',
    {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    },
    false
  )
  setApiKey(response.apiKey)
  return response
}

export function logout() {
  clearApiKey()
}

export function getProfile() {
  return request<{ user: User }>('/api/profile')
}

export function completeSetup(data: { checklistConfirmed: boolean }) {
  return request<{ ok: true }>('/api/setup/complete', {
    method: 'POST',
    body: JSON.stringify(data),
  })
}

export function verifyInitialSync() {
  return request<{
    verified: boolean
    lastSyncAt: string | null
    details: string | null
    courses: number
    assignments: number
  }>('/api/setup/verify-initial-sync')
}

// Dashboard API
export function getDashboard() {
  return request<DashboardResponse>('/api/dashboard')
}

// Course API
export function createCourse(name: string, color?: string) {
  return request<{ course: Course }>('/api/courses', {
    method: 'POST',
    body: JSON.stringify({ name, color }),
  })
}

export function updateCourse(id: string, updates: Partial<Omit<Course, 'id' | 'createdAt'>>) {
  return request<{ course: Course }>('/api/courses/update', {
    method: 'PATCH',
    body: JSON.stringify({ id, ...updates }),
  })
}

export function deleteCourse(id: string) {
  return request<{ ok: true }>(`/api/courses/delete?id=${id}`, {
    method: 'DELETE',
  })
}

// Assignment API
export function createAssignment(data: {
  title: string
  description?: string
  courseId: string
  dueDate?: string
  dueTime?: string
  type?: Assignment['type']
  link?: string
}) {
  return request<{ assignment: Assignment }>('/api/assignments', {
    method: 'POST',
    body: JSON.stringify(data),
  })
}

export function updateAssignment(
  id: string,
  updates: Partial<Omit<Assignment, 'id' | 'courseId' | 'type' | 'createdAt' | 'updatedAt'>>
) {
  return request<{ assignment: Assignment }>('/api/assignments/update', {
    method: 'PATCH',
    body: JSON.stringify({ id, ...updates }),
  })
}

export function deleteAssignment(id: string) {
  return request<{ ok: true }>(`/api/assignments/delete?id=${id}`, {
    method: 'DELETE',
  })
}

export function getPublicApiUrl(path: string) {
  return getApiUrl(path)
}

// Admin API
export function adminListUsers() {
  return request<{ users: AdminUserSummary[] }>('/api/admin/users')
}

export function adminGetUser(userId: string) {
  return request<{ user: AdminUserRecord }>(`/api/admin/user?userId=${encodeURIComponent(userId)}`)
}

export function adminUpdateUser(user: AdminUserRecord) {
  return request<{ user: AdminUserRecord }>('/api/admin/user', {
    method: 'PATCH',
    body: JSON.stringify({ user }),
  })
}

export function adminDeleteUser(userId: string) {
  return request<{ ok: true; deletedApiKeys: number }>(
    `/api/admin/user?userId=${encodeURIComponent(userId)}`,
    { method: 'DELETE' }
  )
}

export function adminClearNamespace() {
  return request<{ ok: true; deleted: number }>('/api/admin/kv/clear', {
    method: 'POST',
  })
}
