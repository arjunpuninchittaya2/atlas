import { useEffect } from 'react'
import Spinner from '../components/Spinner'
import { getPublicApiUrl } from '../lib/api'

export default function Auth() {
  useEffect(() => {
    window.location.href = getPublicApiUrl('/api/auth/notion')
  }, [])

  return <Spinner label='Connecting to Notion…' />
}
