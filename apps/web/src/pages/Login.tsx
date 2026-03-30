import { Auth } from '@supabase/auth-ui-react'
import { ThemeSupa } from '@supabase/auth-ui-shared'
import { supabase } from '../lib/supabase'

export default function Login() {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-slate-950 p-4">
      <div className="w-full max-w-md bg-slate-900 p-8 rounded-2xl border border-slate-800 shadow-2xl">
        <h1 className="text-3xl font-bold text-center mb-2 bg-gradient-to-r from-orange-500 to-red-600 bg-clip-text text-transparent">
          HUSTLE ARENA
        </h1>
        <p className="text-slate-400 text-center mb-8">Join the elite CS2 wager platform</p>
        
        <Auth
          supabaseClient={supabase}
          appearance={{
            theme: ThemeSupa,
            variables: {
              default: {
                colors: {
                  brand: '#f97316',
                  brandAccent: '#dc2626',
                  inputBackground: '#1e293b',
                  inputText: 'white',
                  inputPlaceholder: '#94a3b8',
                }
              }
            }
          }}
          providers={['github', 'google']}
          theme="dark"
        />
      </div>
    </div>
  )
}
