import { ArrowRight, MessageSquare, Shield, Swords, Trophy, Wallet } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { Button, Panel, StatusBadge } from '../components/ui/primitives'

const features = [
  {
    icon: Wallet,
    title: 'Custodial wallet logic',
    description: 'Off-chain USDT balances with deposit crediting, withdrawal requests, audit logs, and stake locks tied to match lifecycle.',
  },
  {
    icon: Shield,
    title: 'KYC first enforcement',
    description: 'Deposits, withdrawals, and queue entry are blocked until identity review clears the account.',
  },
  {
    icon: Swords,
    title: 'Realtime match flow',
    description: 'Auto queue, custom lobbies, ready checks, map voting, and live match state over Socket.IO.',
  },
  {
    icon: Trophy,
    title: 'Automated payout engine',
    description: 'Dedicated server callbacks settle winners, apply VIP fee rules, and persist match stats in one path.',
  },
  {
    icon: MessageSquare,
    title: 'Social surface built in',
    description: 'Friends, direct messaging, and post-driven community activity live inside the same product shell.',
  },
]

export default function LandingPage() {
  const navigate = useNavigate()

  return (
    <div className="min-h-screen overflow-hidden bg-ink-950 text-white">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(39,212,255,0.12),transparent_35%),radial-gradient(circle_at_80%_30%,rgba(255,119,47,0.18),transparent_28%),linear-gradient(180deg,#06080d_0%,#090c13_38%,#05070c_100%)]" />
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.03)_1px,transparent_1px)] bg-[size:80px_80px] opacity-20" />

      <header className="relative mx-auto flex max-w-[1400px] items-center justify-between px-6 py-6">
        <div>
          <p className="text-sm uppercase tracking-[0.34em] text-signal-cyan">Hustle-Arena</p>
          <p className="mt-2 text-sm text-zinc-400">Self-wagered CS2 with production-grade flow.</p>
        </div>
        <div className="flex items-center gap-3">
          <Button type="button" variant="ghost" onClick={() => navigate('/login')}>
            Sign in
          </Button>
          <Button type="button" onClick={() => navigate('/login')}>
            Enter app
          </Button>
        </div>
      </header>

      <main className="relative mx-auto grid max-w-[1400px] gap-10 px-6 pb-20 pt-10 lg:grid-cols-[1.15fr_0.85fr]">
        <section className="space-y-8">
          <StatusBadge tone="brand">Production-grade MVP track</StatusBadge>
          <div className="space-y-5">
            <h1 className="max-w-4xl font-display text-5xl leading-[1.02] text-white md:text-7xl">
              Wager on the server.
              <br />
              Operate like an esports product.
            </h1>
            <p className="max-w-2xl text-lg text-zinc-300">
              Hustle-Arena combines custodial USDT balance management, KYC gates, public queueing, private 5v5 lobbies, and automated CS2 result settlement in one English-only platform shell.
            </p>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row">
            <Button type="button" className="px-6 py-4 text-base" onClick={() => navigate('/login')}>
              Launch secure session
              <ArrowRight className="h-4 w-4" />
            </Button>
            <Button type="button" variant="secondary" className="px-6 py-4 text-base" onClick={() => document.getElementById('features')?.scrollIntoView({ behavior: 'smooth' })}>
              View platform surface
            </Button>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <Panel className="bg-white/[0.04]">
              <p className="text-xs uppercase tracking-[0.24em] text-zinc-500">Fees</p>
              <p className="mt-3 text-3xl font-semibold text-white">10%</p>
              <p className="mt-2 text-sm text-zinc-400">Applied per winning player unless VIP is active.</p>
            </Panel>
            <Panel className="bg-white/[0.04]">
              <p className="text-xs uppercase tracking-[0.24em] text-zinc-500">VIP</p>
              <p className="mt-3 text-3xl font-semibold text-white">30 / 300</p>
              <p className="mt-2 text-sm text-zinc-400">USDT monthly or yearly with zero winner fees while active.</p>
            </Panel>
            <Panel className="bg-white/[0.04]">
              <p className="text-xs uppercase tracking-[0.24em] text-zinc-500">Modes</p>
              <p className="mt-3 text-3xl font-semibold text-white">3</p>
              <p className="mt-2 text-sm text-zinc-400">Competitive, Wingman, and FFA with Dust2 through Cache.</p>
            </Panel>
          </div>
        </section>

        <section className="grid gap-4">
          <Panel className="overflow-hidden border-signal-orange/20 bg-[linear-gradient(140deg,rgba(255,120,48,0.18),rgba(10,13,20,0.96))]">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs uppercase tracking-[0.24em] text-zinc-300">Live control surface</p>
                <h2 className="mt-3 text-2xl font-semibold text-white">Wallet, queue, and match state in one place.</h2>
              </div>
              <StatusBadge tone="warning">Preview branch</StatusBadge>
            </div>
            <div className="mt-6 grid gap-3">
              {['KYC gate before stake lock', 'Socket.IO lobby updates', 'Server callback settlement', 'Posts, friends, and DMs'].map((line) => (
                <div key={line} className="rounded-2xl border border-white/10 bg-black/25 px-4 py-3 text-sm text-zinc-200">
                  {line}
                </div>
              ))}
            </div>
          </Panel>

          <Panel className="bg-white/[0.04]">
            <p className="text-xs uppercase tracking-[0.24em] text-zinc-500">Core loops</p>
            <div className="mt-5 space-y-4">
              {[
                'Deposit credit -> queue join -> ready check',
                'Map vote -> server callback -> payout',
                'Post feed -> friend request -> DM thread',
              ].map((item, index) => (
                <div key={item} className="flex items-start gap-4">
                  <div className="flex h-9 w-9 items-center justify-center rounded-2xl bg-signal-cyan/10 text-sm font-semibold text-signal-cyan">
                    {index + 1}
                  </div>
                  <p className="pt-1 text-sm text-zinc-300">{item}</p>
                </div>
              ))}
            </div>
          </Panel>
        </section>
      </main>

      <section id="features" className="relative mx-auto max-w-[1400px] px-6 pb-24 pt-6">
        <div className="mb-8">
          <p className="text-xs uppercase tracking-[0.28em] text-signal-cyan">Platform surface</p>
          <h2 className="mt-3 text-4xl font-semibold text-white">Designed for competitive flow, not brochure pages.</h2>
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          {features.map((feature) => (
            <Panel key={feature.title} className="h-full bg-white/[0.03]">
              <feature.icon className="h-8 w-8 text-signal-orange" />
              <h3 className="mt-5 text-xl font-semibold text-white">{feature.title}</h3>
              <p className="mt-3 text-sm leading-6 text-zinc-400">{feature.description}</p>
            </Panel>
          ))}
        </div>
      </section>
    </div>
  )
}
