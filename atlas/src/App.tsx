import { Navigate, Route, Routes } from 'react-router-dom'
import Landing from './pages/Landing'
import Auth from './pages/Auth'
import AuthCallback from './pages/AuthCallback'
import Setup from './pages/Setup'
import Dashboard from './pages/Dashboard'

export default function App() {
  return (
    <Routes>
      <Route path='/' element={<Landing />} />
      <Route path='/auth' element={<Auth />} />
      <Route path='/auth/callback' element={<AuthCallback />} />
      <Route path='/setup' element={<Setup />} />
      <Route path='/dashboard' element={<Dashboard />} />
      <Route path='*' element={<Navigate to='/' replace />} />
    </Routes>
  )
}
