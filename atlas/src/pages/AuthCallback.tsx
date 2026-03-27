import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import Spinner from '../components/Spinner'
import { exchangeNotionCode } from '../lib/api'
import { setApiKey, setWorkspaceName } from '../lib/storage'

export default function AuthCallback() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const code = searchParams.get('code')
    if (!code) {
      setError('Missing authorization code.')
      return
    }

    exchangeNotionCode(code)
      .then((response) => {
        setApiKey(response.apiKey)
        setWorkspaceName(response.workspaceName)
        navigate('/setup', { replace: true })
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'Unable to connect to Notion.')
      })
  }, [navigate, searchParams])

  if (error) {
    return (
      <div className='centered-message'>
        <p>{error}</p>
        <Link to='/'>Try again</Link>
      </div>
    )
  }

  return <Spinner label='Setting up your account…' />
}
