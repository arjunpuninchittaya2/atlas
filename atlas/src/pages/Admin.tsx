import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AlertTriangle, RefreshCw, Shield, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  adminClearNamespace,
  adminDeleteUser,
  adminGetUser,
  adminListUsers,
  adminUpdateUser,
  type AdminUserRecord,
  type AdminUserSummary,
} from '@/lib/new-api'
import { isAuthenticated } from '@/lib/storage'

const ADMIN_EMAIL = '9961749@bedfordnhk12.net'

export default function Admin() {
  const navigate = useNavigate()
  const [users, setUsers] = useState<AdminUserSummary[]>([])
  const [selectedUserId, setSelectedUserId] = useState('')
  const [editor, setEditor] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [status, setStatus] = useState('')

  const selectedUser = useMemo(
    () => users.find(u => u.userId === selectedUserId) ?? null,
    [users, selectedUserId]
  )

  const loadUsers = async () => {
    const result = await adminListUsers()
    setUsers(result.users)
  }

  const goToLoginForAdmin = useCallback(() => {
    navigate(`/login?redirect=${encodeURIComponent('/admin')}`)
  }, [navigate])

  useEffect(() => {
    if (!isAuthenticated()) {
      goToLoginForAdmin()
      return
    }

    ;(async () => {
      try {
        await loadUsers()
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to load admin data'
        if (message === 'Unauthorized') {
          goToLoginForAdmin()
          return
        }
        if (message === 'Forbidden') {
          navigate('/dashboard')
          return
        }

        setError(message)
      } finally {
        setLoading(false)
      }
    })()
  }, [goToLoginForAdmin, navigate])

  const handleSelectUser = async (userId: string) => {
    setError('')
    setStatus('')
    setSelectedUserId(userId)
    try {
      const result = await adminGetUser(userId)
      setEditor(JSON.stringify(result.user, null, 2))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load user')
      setEditor('')
    }
  }

  const handleSave = async () => {
    setError('')
    setStatus('')
    let parsed: AdminUserRecord
    try {
      parsed = JSON.parse(editor) as AdminUserRecord
    } catch {
      setError('JSON is invalid')
      return
    }

    setSaving(true)
    try {
      const result = await adminUpdateUser(parsed)
      setEditor(JSON.stringify(result.user, null, 2))
      await loadUsers()
      setStatus('User updated')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update user')
    } finally {
      setSaving(false)
    }
  }

  const handleDeleteUser = async () => {
    if (!selectedUserId) return
    if (!window.confirm(`Delete user ${selectedUser?.email ?? selectedUserId}? This cannot be undone.`)) {
      return
    }

    setSaving(true)
    setError('')
    setStatus('')
    try {
      await adminDeleteUser(selectedUserId)
      setEditor('')
      setSelectedUserId('')
      await loadUsers()
      setStatus('User deleted')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete user')
    } finally {
      setSaving(false)
    }
  }

  const handleClearKv = async () => {
    if (!window.confirm('Delete ALL keys from ATLAS_KV? This will erase every account and session.')) {
      return
    }

    setSaving(true)
    setError('')
    setStatus('')
    try {
      const result = await adminClearNamespace()
      setEditor('')
      setSelectedUserId('')
      setUsers([])
      setStatus(`Namespace cleared. Deleted ${result.deleted} key(s).`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to clear namespace')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className='min-h-screen bg-[#0b0b0b] text-white flex items-center justify-center'>
        <p className='text-neutral-400'>Loading admin console...</p>
      </div>
    )
  }

  return (
    <div className='min-h-screen bg-[#0b0b0b] text-white p-6 md:p-8'>
      <div className='max-w-7xl mx-auto space-y-4'>
        <div className='flex flex-wrap items-center justify-between gap-3'>
          <div>
            <h1 className='text-3xl font-light flex items-center gap-2'>
              <Shield className='w-7 h-7 text-red-300' />
              Admin Console
            </h1>
            <p className='text-sm text-neutral-400'>Restricted to {ADMIN_EMAIL}</p>
          </div>
          <div className='flex gap-2'>
            <Button variant='outline' onClick={() => navigate('/dashboard')}>
              Back to Dashboard
            </Button>
            <Button variant='secondary' onClick={loadUsers} disabled={saving}>
              <RefreshCw className='w-4 h-4 mr-2' />
              Refresh Users
            </Button>
            <Button variant='destructive' onClick={handleClearKv} disabled={saving}>
              <AlertTriangle className='w-4 h-4 mr-2' />
              Clear KV Namespace
            </Button>
          </div>
        </div>

        {error && <div className='p-3 rounded border border-red-700 bg-red-950 text-red-200'>{error}</div>}
        {status && <div className='p-3 rounded border border-emerald-700 bg-emerald-950 text-emerald-200'>{status}</div>}

        <div className='grid grid-cols-1 xl:grid-cols-3 gap-4'>
          <Card className='xl:col-span-1'>
            <CardHeader>
              <CardTitle>Accounts ({users.length})</CardTitle>
            </CardHeader>
            <CardContent className='space-y-2 max-h-[70vh] overflow-auto'>
              {users.map(user => (
                <button
                  key={user.userId}
                  onClick={() => handleSelectUser(user.userId)}
                  className={`w-full text-left rounded border px-3 py-2 transition-colors ${
                    selectedUserId === user.userId
                      ? 'border-neutral-200 bg-neutral-800'
                      : 'border-neutral-800 bg-neutral-900 hover:bg-neutral-800'
                  }`}
                >
                  <p className='text-sm font-medium'>{user.email}</p>
                  <p className='text-xs text-neutral-400'>
                    {user.courses} courses • {user.assignments} assignments
                  </p>
                </button>
              ))}
              {users.length === 0 && <p className='text-sm text-neutral-400'>No users found.</p>}
            </CardContent>
          </Card>

          <Card className='xl:col-span-2'>
            <CardHeader>
              <CardTitle>User JSON Editor</CardTitle>
            </CardHeader>
            <CardContent className='space-y-3'>
              <textarea
                value={editor}
                onChange={e => setEditor(e.target.value)}
                placeholder='Select a user to view/edit raw JSON'
                className='w-full min-h-[60vh] rounded-md border border-neutral-800 bg-black p-3 text-sm font-mono'
              />
              <div className='flex gap-2'>
                <Button onClick={handleSave} disabled={saving || !selectedUserId || !editor.trim()}>
                  Save User Changes
                </Button>
                <Button
                  variant='destructive'
                  onClick={handleDeleteUser}
                  disabled={saving || !selectedUserId}
                >
                  <Trash2 className='w-4 h-4 mr-2' />
                  Delete Selected User
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}