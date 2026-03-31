import { useMatchmakingQuery, useBootstrapQuery } from '../lib/query-hooks'
import { formatDateTime, formatUsdt, kycLabel, transactionLabel } from '../lib/format'
import { Button, EmptyState, ErrorState, MetricCard, Panel, SectionTitle, StatusBadge } from '../components/ui/primitives'

export default function DashboardPage() {
  const bootstrapQuery = useBootstrapQuery()
  const matchmakingQuery = useMatchmakingQuery()

  if (bootstrapQuery.isLoading || matchmakingQuery.isLoading || !bootstrapQuery.data || !matchmakingQuery.data) {
    return <Panel className="text-sm text-zinc-400">Loading dashboard state...</Panel>
  }

  if (bootstrapQuery.isError || matchmakingQuery.isError) {
    return (
      <ErrorState
        title="Dashboard data could not load"
        message="The app shell authenticated, but dashboard queries failed. Check the API routes and refresh."
      />
    )
  }

  const { viewer, wallet, transactions, topEarners, topMatches, communityPosts } = bootstrapQuery.data
  const { activeMatch } = matchmakingQuery.data

  return (
    <div className="space-y-6">
      <SectionTitle
        eyebrow="Overview"
        title="Operational dashboard"
        description="Track KYC readiness, wallet headroom, active match state, and top platform performance from one summary surface."
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Available" value={`${formatUsdt(wallet.balance)} USDT`} detail="Ready for deposits, queue entry, and withdrawals." accent="bg-signal-orange" />
        <MetricCard label="Locked" value={`${formatUsdt(wallet.locked_balance)} USDT`} detail="Currently reserved in queues or lobbies." accent="bg-signal-cyan" />
        <MetricCard label="KYC" value={kycLabel(viewer.kyc_status)} detail="Protected actions enforce verified status." accent="bg-emerald-500" />
        <MetricCard label="Lifetime earnings" value={`${formatUsdt(viewer.total_earnings)} USDT`} detail={`Wins ${viewer.wins} / Losses ${viewer.losses}`} accent="bg-amber-500" />
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
        <Panel className="space-y-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.24em] text-zinc-500">Current match state</p>
              <h3 className="mt-2 text-2xl font-semibold text-white">Active lobby</h3>
            </div>
            {activeMatch ? <StatusBadge tone="brand">{activeMatch.match.phase}</StatusBadge> : null}
          </div>
          {activeMatch ? (
            <div className="grid gap-4 md:grid-cols-2">
              <div className="rounded-[24px] border border-white/10 bg-white/[0.03] p-4">
                <p className="text-sm text-zinc-400">{activeMatch.match.title}</p>
                <p className="mt-2 text-2xl font-semibold text-white">{activeMatch.match.game_mode.toUpperCase()}</p>
                <p className="mt-3 text-sm text-zinc-300">
                  Stake {formatUsdt(activeMatch.match.wager_amount)} USDT
                  <span className="mx-2 text-zinc-600">|</span>
                  Pool {formatUsdt(activeMatch.match.total_pool)} USDT
                </p>
                <p className="mt-3 text-sm text-zinc-400">
                  {activeMatch.match.selected_map ? `Selected map: ${activeMatch.match.selected_map}` : 'Map vote still pending.'}
                </p>
              </div>
              <div className="rounded-[24px] border border-white/10 bg-white/[0.03] p-4">
                <p className="text-sm text-zinc-400">Roster</p>
                <ul className="mt-3 space-y-3">
                  {activeMatch.players.map((player) => (
                    <li key={player.user_id} className="flex items-center justify-between rounded-2xl bg-black/20 px-3 py-2">
                      <span className="text-sm text-zinc-200">{player.profile?.display_name ?? player.user_id}</span>
                      <StatusBadge tone={player.is_ready ? 'success' : 'warning'}>
                        {player.team} · {player.is_ready ? 'Ready' : 'Waiting'}
                      </StatusBadge>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          ) : (
            <EmptyState title="No active match" message="Join the public queue or create a custom lobby to start the match flow." />
          )}
        </Panel>

        <Panel className="space-y-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.24em] text-zinc-500">Recent wallet activity</p>
              <h3 className="mt-2 text-2xl font-semibold text-white">Ledger edge</h3>
            </div>
          </div>
          <div className="space-y-3">
            {transactions.slice(0, 5).map((transaction) => (
              <div key={transaction.id} className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold capitalize text-white">{transactionLabel(transaction.type)}</p>
                    <p className="mt-1 text-xs text-zinc-500">{formatDateTime(transaction.created_at)}</p>
                  </div>
                  <StatusBadge tone={transaction.status === 'completed' ? 'success' : 'warning'}>
                    {transaction.status}
                  </StatusBadge>
                </div>
                <p className="mt-3 text-lg font-semibold text-white">{formatUsdt(transaction.amount)} USDT</p>
              </div>
            ))}
          </div>
        </Panel>
      </div>

      <div className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
        <Panel className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.24em] text-zinc-500">Top earners</p>
              <h3 className="mt-2 text-xl font-semibold text-white">Leaderboard</h3>
            </div>
            <Button type="button" variant="ghost" onClick={() => window.location.assign('/community')}>
              Open community
            </Button>
          </div>
          <div className="space-y-3">
            {topEarners.map((entry, index) => (
              <div key={entry.user_id} className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3">
                <div>
                  <p className="text-sm font-semibold text-white">
                    #{index + 1} {entry.username}
                  </p>
                  <p className="text-xs text-zinc-500">Lifetime platform earnings</p>
                </div>
                <p className="text-sm font-semibold text-signal-cyan">{formatUsdt(entry.value)} USDT</p>
              </div>
            ))}
          </div>
        </Panel>

        <div className="grid gap-4 lg:grid-cols-2">
          <Panel className="space-y-4">
            <p className="text-xs uppercase tracking-[0.24em] text-zinc-500">Top matches</p>
            <div className="space-y-3">
              {topMatches.map((match) => (
                <div key={match.match_id} className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                  <p className="text-sm font-semibold text-white">{match.title}</p>
                  <p className="mt-2 text-sm text-zinc-400">
                    Pool {formatUsdt(match.total_pool)} USDT
                    <span className="mx-2 text-zinc-600">|</span>
                    {match.selected_map ?? 'Map TBD'}
                  </p>
                </div>
              ))}
            </div>
          </Panel>

          <Panel className="space-y-4">
            <p className="text-xs uppercase tracking-[0.24em] text-zinc-500">Community pulse</p>
            <div className="space-y-3">
              {communityPosts.slice(0, 4).map((post) => (
                <div key={post.id} className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold text-white">{post.author?.display_name ?? post.user_id}</p>
                    <p className="text-xs text-zinc-500">{formatDateTime(post.created_at)}</p>
                  </div>
                  <p className="mt-3 text-sm leading-6 text-zinc-300">{post.content}</p>
                </div>
              ))}
            </div>
          </Panel>
        </div>
      </div>
    </div>
  )
}
