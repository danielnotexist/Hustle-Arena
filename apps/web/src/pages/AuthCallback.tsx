import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { LoadingState, ErrorState, Button } from '../components/ui/primitives'
import { supabase } from '../lib/supabase'

export default function AuthCallbackPage() {
  const navigate = useNavigate()
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  useEffect(() => {
    let mounted = true

    async function completeAuth() {
      try {
        const url = new URL(window.location.href)
        const code = url.searchParams.get('code')

        if (code) {
          await supabase.auth.exchangeCodeForSession(code)
        }

        const {
          data: { session },
        } = await supabase.auth.getSession()

        if (!session) {
          throw new Error('The auth callback did not produce an active session.')
        }

        if (mounted) {
          navigate('/dashboard', { replace: true })
        }
      } catch (error) {
        if (mounted) {
          setErrorMessage(error instanceof Error ? error.message : 'Auth callback failed')
        }
      }
    }

    void completeAuth()

    return () => {
      mounted = false
    }
  }, [navigate])

  if (errorMessage) {
    return (
      <div className="p-6">
        <ErrorState
          title="Authentication callback failed"
          message={errorMessage}
          action={
            <Button type="button" onClick={() => navigate('/login', { replace: true })}>
              Return to sign in
            </Button>
          }
        />
      </div>
    )
  }

  return <LoadingState label="Completing secure sign-in..." />
}
