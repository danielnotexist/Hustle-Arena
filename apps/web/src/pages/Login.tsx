import { useEffect } from 'react'
import { Auth } from '@supabase/auth-ui-react'
import { ThemeSupa } from '@supabase/auth-ui-shared'
import { supabase } from '../lib/supabase'
import { ArrowLeft } from 'lucide-react'
import { useSearchParams } from 'react-router-dom'

export default function Login({ onBack }: { onBack: () => void }) {
  const [searchParams] = useSearchParams()

  useEffect(() => {
    const token = searchParams.get('token')
    if (token) {
      // Set the session manually with the JWT from backend
      supabase.auth.setSession({
        access_token: token,
        refresh_token: '', // Custom JWTs usually don't have refresh tokens in this simple flow
      }).then(({ error }) => {
        if (!error) {
          window.location.href = '/dashboard'
        }
      })
    }
  }, [searchParams])

  const handleSteamLogin = () => {
    const backendUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001'
    window.location.href = `${backendUrl}/api/auth/steam`
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-background p-4 relative">
      {/* Background Neon Effects */}
      <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-primary/10 rounded-full blur-[120px] pointer-events-none"></div>
      <div className="absolute bottom-[10%] right-[-10%] w-[30%] h-[30%] bg-accent/10 rounded-full blur-[100px] pointer-events-none"></div>

      <button 
        onClick={onBack}
        className="absolute top-8 left-8 flex items-center space-x-2 text-muted-foreground hover:text-primary transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        <span className="font-bold uppercase tracking-widest text-xs">Back to Home</span>
      </button>

      <div className="w-full max-w-md bg-card p-10 rounded-[2rem] border border-border shadow-2xl relative z-10">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-black tracking-tighter text-primary mb-2">
            HUSTLE<span className="text-foreground">ARENA</span>
          </h1>
          <p className="text-muted-foreground text-sm font-medium uppercase tracking-widest">Entry Point</p>
        </div>
        
        {/* Steam Login Button */}
        <button 
          onClick={handleSteamLogin}
          className="w-full mb-6 flex items-center justify-center space-x-3 bg-[#171a21] hover:bg-[#2a475e] text-white py-4 rounded-xl font-bold uppercase tracking-widest transition-all transform hover:scale-[1.02] shadow-lg border border-[#66c0f4]/20"
        >
          {/* Custom Steam SVG since lucide doesn't have it */}
          <svg viewBox="0 0 24 24" className="h-6 w-6 fill-current">
            <path d="M12 0C5.372 0 0 5.372 0 12c0 1.25.19 2.45.54 3.58l5.35 2.19c.47-.3 1.05-.48 1.67-.48.51 0 .97.13 1.38.35l2.45-3.57c0-.01 0-.01-.01-.02-.85-.82-1.38-1.97-1.38-3.25 0-2.48 2.02-4.5 4.5-4.5s4.5 2.02 4.5 4.5-2.02 4.5-4.5 4.5c-1.28 0-2.43-.53-3.25-1.38l-3.57 2.45c.22.41.35.87.35 1.38 0 1.66-1.34 3-3 3-.24 0-.47-.03-.69-.08l-2.88 1.17C2.96 23.33 6.64 24 12 24c6.628 0 12-5.372 12-12S18.628 0 12 0zm1.5 13.5c-1.103 0-2-.897-2-2s.897-2 2-2 2 .897 2 2-.897 2-2 2z"/>
          </svg>
          <span>Login with Steam</span>
        </button>

        <div className="relative mb-8">
          <div className="absolute inset-0 flex items-center">
            <span className="w-full border-t border-border"></span>
          </div>
          <div className="relative flex justify-center text-xs uppercase">
            <span className="bg-card px-2 text-muted-foreground font-bold tracking-widest">Or Email</span>
          </div>
        </div>

        <Auth
          supabaseClient={supabase}
          appearance={{
            theme: ThemeSupa,
            variables: {
              default: {
                colors: {
                  brand: 'hsl(190 100% 50%)',
                  brandAccent: 'hsl(265 90% 60%)',
                  inputBackground: 'hsl(228 22% 11%)',
                  inputText: 'white',
                  inputPlaceholder: 'hsl(220 12% 50%)',
                  inputBorder: 'hsl(228 15% 16%)',
                }
              }
            },
            className: {
              button: 'rounded-xl font-bold uppercase tracking-widest transition-all hover:scale-[1.02]',
              input: 'rounded-xl border-border bg-card',
              label: 'text-xs font-bold uppercase tracking-widest text-muted-foreground mb-1',
            }
          }}
          providers={[]} // Clear providers to fix build error
          theme="dark"
          localization={{
            variables: {
              sign_up: {
                email_label: 'Email Address',
                password_label: 'Create Password',
                button_label: 'Create Account',
                social_provider_text: 'Sign up with {{provider}}',
              },
            },
          }}
          additionalFields={[
            {
              name: 'username',
              label: 'Username',
              placeholder: 'Arena Nickname',
              type: 'text',
            },
          ]}
        />

        <div className="mt-8 pt-6 border-t border-border text-center">
          <p className="text-[10px] text-muted-foreground uppercase tracking-[0.2em] leading-relaxed">
            By entering the arena, you confirm you are 18+ and agree to our Terms of Service.
          </p>
        </div>
      </div>
    </div>
  )
}
