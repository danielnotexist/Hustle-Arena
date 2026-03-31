import { Auth } from '@supabase/auth-ui-react'
import { ThemeSupa } from '@supabase/auth-ui-shared'
import { ArrowLeft, ShieldCheck, Wallet, Swords } from 'lucide-react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { Panel, StatusBadge } from '../components/ui/primitives'

export default function LoginPage() {
  return (
    <div className="relative min-h-screen overflow-hidden bg-ink-950 px-6 py-10 text-white">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(39,212,255,0.18),transparent_28%),radial-gradient(circle_at_80%_20%,rgba(255,119,47,0.22),transparent_32%),linear-gradient(180deg,#06080d_0%,#090c13_42%,#05070c_100%)]" />

      <div className="relative mx-auto grid max-w-[1280px] gap-8 lg:grid-cols-[1fr_480px]">
        <section className="space-y-6">
          <Link to="/" className="inline-flex items-center gap-2 text-sm text-zinc-400 transition hover:text-white">
            <ArrowLeft className="h-4 w-4" />
            Back to landing
          </Link>

          <StatusBadge tone="brand">English-only product shell</StatusBadge>
          <div className="space-y-4">
            <h1 className="font-display text-5xl leading-[1.04] text-white md:text-6xl">
              Secure the session.
              <br />
              Then clear the gate.
            </h1>
            <p className="max-w-2xl text-lg text-zinc-300">
              Supabase handles account auth while the app enforces KYC before deposit, withdrawal, and play. OAuth and email verification both redirect through the hardened callback route.
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <Panel className="bg-white/[0.04]">
              <ShieldCheck className="h-6 w-6 text-signal-cyan" />
              <h2 className="mt-4 text-lg font-semibold text-white">Verified entry</h2>
              <p className="mt-2 text-sm text-zinc-400">Protected actions stay blocked until KYC is verified.</p>
            </Panel>
            <Panel className="bg-white/[0.04]">
              <Wallet className="h-6 w-6 text-signal-orange" />
              <h2 className="mt-4 text-lg font-semibold text-white">Wallet safety</h2>
              <p className="mt-2 text-sm text-zinc-400">Balances, locks, and payout state are tracked server-side with audit history.</p>
            </Panel>
            <Panel className="bg-white/[0.04]">
              <Swords className="h-6 w-6 text-zinc-100" />
              <h2 className="mt-4 text-lg font-semibold text-white">Realtime lobbies</h2>
              <p className="mt-2 text-sm text-zinc-400">Queueing and lobby flow stream over Socket.IO after sign-in.</p>
            </Panel>
          </div>
        </section>

        <Panel className="border-white/15 bg-panel-950/95 p-8">
          <div className="mb-6">
            <p className="text-xs uppercase tracking-[0.28em] text-signal-cyan">Hustle-Arena</p>
            <h2 className="mt-3 text-3xl font-semibold text-white">Access the preview environment</h2>
            <p className="mt-2 text-sm text-zinc-400">Use email, Google, or GitHub. Callback routing will continue into the app shell.</p>
          </div>

          <Auth
            supabaseClient={supabase}
            providers={['google', 'github']}
            theme="dark"
            redirectTo={`${window.location.origin}/auth/callback`}
            appearance={{
              theme: ThemeSupa,
              variables: {
                default: {
                  colors: {
                    brand: '#ff7a37',
                    brandAccent: '#ff9d5f',
                    inputBackground: '#121723',
                    inputText: '#f4f4f5',
                    inputBorder: '#272b34',
                  },
                },
              },
              className: {
                button:
                  '!rounded-2xl !border-0 !bg-[#ff7a37] !px-4 !py-3 !font-semibold !text-[#06080d] hover:!bg-[#ff9354]',
                input: '!rounded-2xl !border !border-white/10 !bg-[#121723] !text-white',
                label: '!text-xs !uppercase !tracking-[0.24em] !text-zinc-500',
                anchor: '!text-signal-cyan',
                message: '!text-sm !text-zinc-400',
              },
            }}
          />
        </Panel>
      </div>
    </div>
  )
}
