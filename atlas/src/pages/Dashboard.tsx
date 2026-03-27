import { useEffect, useMemo, useState } from 'react'
import { Unlink } from 'lucide-react'
import Skeleton from '../components/Skeleton'
import Toggle from '../components/Toggle'
import { getDashboard, updateCourses, type DashboardResponse } from '../lib/api'
import { getWorkspaceName } from '../lib/storage'
import { formatRelativeTime } from '../lib/time'
import './Dashboard.css'

export default function Dashboard() {
  const [loading, setLoading] = useState(true)
  const [data, setData] = useState<DashboardResponse | null>(null)
  const [savingCourseId, setSavingCourseId] = useState<string | null>(null)

  useEffect(() => {
    getDashboard()
      .then((response) => setData(response))
      .finally(() => setLoading(false))
  }, [])

  const stale = useMemo(() => {
    if (!data?.lastSyncAt) return false
    const ts = new Date(data.lastSyncAt).getTime()
    if (Number.isNaN(ts)) return false
    return Date.now() - ts > 24 * 60 * 60 * 1000
  }, [data?.lastSyncAt])

  const toggleCourse = async (courseId: string) => {
    if (!data) return

    const isEnabled = data.enabledCourseIds.includes(courseId)
    const next = isEnabled
      ? data.enabledCourseIds.filter((id) => id !== courseId)
      : [...data.enabledCourseIds, courseId]

    setSavingCourseId(courseId)
    setData({ ...data, enabledCourseIds: next })

    try {
      await updateCourses(next)
    } catch {
      setData(data)
    } finally {
      setSavingCourseId(null)
    }
  }

  if (loading) {
    return (
      <main className='dashboard loading'>
        <Skeleton height={56} />
        <Skeleton height={220} />
        <Skeleton height={180} />
      </main>
    )
  }

  if (!data) {
    return (
      <div className='centered-message'>
        <p>Unable to load dashboard.</p>
      </div>
    )
  }

  const workspaceName = data.workspaceName || getWorkspaceName() || 'Unknown workspace'

  return (
    <main className='dashboard'>
      <aside className='sidebar'>
        <h1>ATLAS</h1>
        <nav>
          <a href='/dashboard'>Dashboard</a>
          <span className='disabled'>Settings (coming soon)</span>
        </nav>
        <div className='workspace-line'>
          <span>Connected to {workspaceName}</span>
          <button type='button' aria-label='Unlink placeholder'>
            <Unlink size={14} />
          </button>
        </div>
      </aside>

      <section className='dashboard-main'>
        <article className='surface-card'>
          <h2>Status</h2>
          <p className={stale ? 'secondary' : ''}>{formatRelativeTime(data.lastSyncAt)}</p>
          {stale && <p className='secondary'>Script may not be running. Check your Apps Script triggers.</p>}
        </article>

        <article className='surface-card'>
          <h2>Sync Log</h2>
          {data.syncLog.length === 0 ? (
            <p className='secondary'>No syncs yet.</p>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Time</th>
                  <th>Courses</th>
                  <th>Added</th>
                  <th>Updated</th>
                  <th>Skipped</th>
                </tr>
              </thead>
              <tbody>
                {data.syncLog.map((entry) => (
                  <tr key={entry.timestamp}>
                    <td>{new Date(entry.timestamp).toLocaleString()}</td>
                    <td>{entry.coursesReceived}</td>
                    <td>{entry.assignmentsAdded}</td>
                    <td>{entry.assignmentsUpdated}</td>
                    <td>{entry.assignmentsSkipped}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </article>

        {data.enabledCourseIds.length > 0 && (
          <article className='surface-card'>
            <h2>Courses</h2>
            <ul className='course-list'>
              {data.courses.map((course) => {
                const enabled = data.enabledCourseIds.includes(course.id)
                const saving = savingCourseId === course.id

                return (
                  <li key={course.id}>
                    <span className={enabled ? '' : 'course-disabled'}>{course.name}</span>
                    <div className='course-toggle'>
                      <Toggle checked={enabled} onChange={() => void toggleCourse(course.id)} disabled={saving} />
                      {saving && <small>Saving…</small>}
                    </div>
                  </li>
                )
              })}
            </ul>
          </article>
        )}
      </section>
    </main>
  )
}
