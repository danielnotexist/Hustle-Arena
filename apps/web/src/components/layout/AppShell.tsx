import { NavLink, Outlet } from 'react-router-dom'
import { MessageSquare, ShieldCheck, Swords, Wallet, LayoutDashboard, LogOut, ChevronRight } from 'lucide-react'
import { useBootstrapQuery } from '../../lib/query-hooks'
import { formatUsdt, kycLabel } from '../../lib/format'
import { useAuth } from '../../providers/AuthProvider'
import { Button, ErrorState, LoadingState, Panel, StatusBadge } from '../ui/primitives'
import { cn } from '../../lib/cn'

const navigation = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/wallet', label: 'Wallet', icon: Wallet },
  { to: '/matchmaking', label: 'Matchmaking', icon: Swords },
  { to: '/community', label: 'Community', icon: ShieldCheck },
  { to: '/chat', label: 'Chat', icon: MessageSquare },
]

export function AppShell() {
  const { signOut } = useAuth()
  const bootstrapQuery = useBootstrapQuery()

  if (bootstrapQuery.isLoading) {
    return <LoadingState label="Loading your command deck..." />
  }

  if (bootstrapQuery.isError || !bootstrapQuery.data) {
    return (
      <div className="p-6">
        <ErrorState
          title="Arena shell failed to load"
          message="The authenticated workspace could not bootstrap. Check the API and Supabase configuration, then refresh."
          action={
            <Button type="button" onClick={() => window.location.reload()}>
              Reload app
            </Button>
          }
        />
      </div>
    )
  }

  const { viewer, wallet } = bootstrapQuery.data

  return (
    <div className="min-h-screen bg-ink-950 text-white">
      <div className="mx-auto flex max-w-[1500px] gap-6 px-4 pb-28 pt-6 lg:px-6 lg:pb-8">
        <aside className="hidden w-[290px] flex-col gap-6 lg:flex">
          <Panel className="space-y-6">
            <div className="space-y-3">
              <p className="text-xs uppercase tracking-[0.28em] text-signal-cyan">Hustle-Arena</p>
              <h1 className="text-3xl font-semibold leading-tight text-white">
                Wagered CS2.
                <br />
                Platform-grade flow.
              </h1>
              <p className="text-sm text-zinc-400">
                Queue, lock stake, clear KYC, and settle off-chain payouts from one command surface.
              </p>
            </div>

            <div className="rounded-[24px] border border-white/10 bg-white/5 p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-zinc-400">Available balance</p>
                  <p className="mt-2 text-2xl font-semibold text-white">{formatUsdt(wallet.balance)} USDT</p>
                </div>
                <StatusBadge tone="brand">{kycLabel(viewer.kyc_status)}</StatusBadge>
              </div>
              <p className="mt-3 text-sm text-zinc-400">
                Locked: <span className="text-zinc-200">{formatUsdt(wallet.locked_balance)} USDT</span>
              </p>
            </div>

            <nav aria-label="Primary navigation" className="space-y-2">
              {navigation.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className={({ isActive }) =>
                    cn(
                      'group flex items-center justify-between rounded-2xl px-4 py-3 text-sm font-medium text-zinc-400 transition hover:bg-white/5 hover:text-white',
                      isActive && 'bg-white/10 text-white',
                    )
                  }
                >
                  {({ isActive }) => (
                    <>
                      <span className="flex items-center gap-3">
                        <item.icon className={cn('h-4 w-4', isActive ? 'text-signal-orange' : 'text-zinc-500')} />
                        {item.label}
                      </span>
                      <ChevronRight className={cn('h-4 w-4 transition', isActive ? 'text-white' : 'text-zinc-600')} />
                    </>
                  )}
                </NavLink>
              ))}
            </nav>
          </Panel>

          <Panel className="space-y-3">
            <p className="text-xs uppercase tracking-[0.24em] text-zinc-500">Profile</p>
            <div>
              <h2 className="text-xl font-semibold text-white">{viewer.display_name}</h2>
              <p className="text-sm text-zinc-400">@{viewer.username}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <StatusBadge tone={viewer.is_vip ? 'success' : 'neutral'}>{viewer.is_vip ? 'VIP active' : 'Standard'}</StatusBadge>
              <StatusBadge tone="neutral">ELO {viewer.elo_rating}</StatusBadge>
            </div>
            <Button type="button" variant="ghost" className="justify-start px-0 text-zinc-300" onClick={() => void signOut()}>
              <LogOut className="h-4 w-4" />
              Sign out
            </Button>
          </Panel>
        </aside>

        <div className="flex-1 space-y-6">
          <header className="rounded-[28px] border border-white/10 bg-[linear-gradient(135deg,rgba(255,120,55,0.18),rgba(37,219,255,0.05),rgba(5,8,14,0.92))] p-5 shadow-[0_35px_80px_rgba(3,5,10,0.45)]">
            <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <p className="text-xs uppercase tracking-[0.28em] text-signal-cyan">Operations hub</p>
                <h2 className="mt-3 text-3xl font-semibold text-white">Control wallet, queue, and community state from one shell.</h2>
                <p className="mt-3 max-w-3xl text-sm text-zinc-200/80">
                  Protected actions enforce KYC, match flow is realtime over Socket.IO, and payout logic is designed around idempotent server callbacks.
                </p>
              </div>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
                  <p className="text-xs uppercase tracking-[0.22em] text-zinc-500">Wins</p>
                  <p className="mt-2 text-2xl font-semibold text-white">{viewer.wins}</p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
                  <p className="text-xs uppercase tracking-[0.22em] text-zinc-500">Matches</p>
                  <p className="mt-2 text-2xl font-semibold text-white">{viewer.total_matches}</p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
                  <p className="text-xs uppercase tracking-[0.22em] text-zinc-500">Earnings</p>
                  <p className="mt-2 text-2xl font-semibold text-white">{formatUsdt(viewer.total_earnings)}</p>
                </div>
              </div>
            </div>
          </header>

          <Outlet />
        </div>
      </div>

      <nav className="fixed inset-x-4 bottom-4 z-50 rounded-[24px] border border-white/10 bg-panel-950/95 p-2 shadow-[0_24px_70px_rgba(5,7,13,0.58)] backdrop-blur lg:hidden">
        <div className="grid grid-cols-5 gap-1">
          {navigation.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                cn(
                  'flex flex-col items-center gap-1 rounded-2xl px-2 py-3 text-[11px] font-medium text-zinc-500 transition',
                  isActive && 'bg-white/10 text-white',
                )
              }
            >
              <item.icon className="h-4 w-4" />
              {item.label}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  )
}
