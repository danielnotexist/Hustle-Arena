import { Auth } from '@supabase/auth-ui-react'
import { ThemeSupa } from '@supabase/auth-ui-shared'
import { supabase } from '../lib/supabase'
import { ArrowLeft } from 'lucide-react'

export default function Login({ onBack }: { onBack: () => void }) {
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
          providers={['steam']}
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
