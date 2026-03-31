import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import Landing from './pages/Landing'
import Login from './pages/Login'
import NewDashboard from './pages/NewDashboard'
import Admin from './pages/Admin'
import Setup from './pages/Setup'
import { isAuthenticated } from './lib/storage'
import { getProfile } from './lib/new-api'
import { useEffect, useState } from 'react'

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const location = useLocation()
  return isAuthenticated() ? (
    <>{children}</>
  ) : (
    <Navigate
      to={`/login?redirect=${encodeURIComponent(`${location.pathname}${location.search}`)}`}
      replace
    />
  )
}

function SetupProtectedRoute({ children }: { children: React.ReactNode }) {
  const location = useLocation()
  const [state, setState] = useState<'loading' | 'ready' | 'needs-setup'>('loading')

  useEffect(() => {
    let alive = true

    if (!isAuthenticated()) {
      return
    }

    getProfile()
      .then(({ user }) => {
        if (!alive) return
        setState(user.setupCompleted ? 'ready' : 'needs-setup')
      })
      .catch(() => {
        if (!alive) return
        setState('ready')
      })

    return () => {
      alive = false
    }
  }, [location.pathname])

  if (!isAuthenticated()) {
    return (
      <Navigate
        to={`/login?redirect=${encodeURIComponent(`${location.pathname}${location.search}`)}`}
        replace
      />
    )
  }

  if (state === 'loading') {
    return <div className='min-h-screen bg-background' />
  }

  if (state === 'needs-setup') {
    return (
      <Navigate
        to={`/setup?redirect=${encodeURIComponent(`${location.pathname}${location.search}`)}`}
        replace
      />
    )
  }

  return <>{children}</>
}

export default function App() {
  return (
    <Routes>
      <Route path='/' element={<Landing />} />
      <Route path='/login' element={<Login />} />
      <Route
        path='/setup'
        element={
          <ProtectedRoute>
            <Setup />
          </ProtectedRoute>
        }
      />
      <Route
        path='/dashboard'
        element={
          <SetupProtectedRoute>
            <NewDashboard />
          </SetupProtectedRoute>
        }
      />
      <Route
        path='/admin'
        element={
          <SetupProtectedRoute>
            <Admin />
          </SetupProtectedRoute>
        }
      />
      <Route path='*' element={<Navigate to='/' replace />} />
    </Routes>
  )
}
