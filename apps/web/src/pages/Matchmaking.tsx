import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { MatchPlayerView, MatchTeam } from '@hustle-arena/shared-types'
import { apiRequest } from '../lib/api'
import { useMatchmakingQuery } from '../lib/query-hooks'
import { formatUsdt } from '../lib/format'
import { useSocket } from '../providers/SocketProvider'
import { Button, EmptyState, ErrorState, Input, Panel, SectionTitle, Select, StatusBadge } from '../components/ui/primitives'
import { cn } from '../lib/cn'

const modes = [
  { label: 'Competitive', value: 'competitive' },
  { label: 'Wingman', value: 'wingman' },
  { label: 'FFA', value: 'ffa' },
] as const

const MAP_POOL = ['Dust2', 'Inferno', 'Nuke', 'Mirage', 'Vertigo', 'Ancient', 'Cache'] as const

function TeamColumn({ title, players }: { title: string; players: MatchPlayerView[] }) {
  return (
    <div className="space-y-3 rounded-[24px] border border-white/10 bg-white/[0.03] p-4">
      <div className="flex items-center justify-between">
        <h4 className="text-lg font-semibold text-white">{title}</h4>
        <p className="text-xs uppercase tracking-[0.2em] text-zinc-500">{players.length} players</p>
      </div>
      <div className="space-y-2">
        {players.map((player) => (
          <div key={player.user_id} className="flex items-center justify-between rounded-2xl bg-black/20 px-3 py-2">
            <div>
              <p className="text-sm font-medium text-white">{player.profile?.display_name ?? player.user_id}</p>
              <p className="text-xs text-zinc-500">ELO {player.profile?.elo_rating ?? player.elo_before ?? 1000}</p>
            </div>
            <StatusBadge tone={player.is_ready ? 'success' : 'warning'}>{player.is_ready ? 'Ready' : 'Waiting'}</StatusBadge>
          </div>
        ))}
      </div>
    </div>
  )
}

export default function MatchmakingPage() {
  const queryClient = useQueryClient()
  const socket = useSocket()
  const matchmakingQuery = useMatchmakingQuery()
  const [feedback, setFeedback] = useState<string | null>(null)
  const [queueForm, setQueueForm] = useState({ match_mode: 'competitive', wager_amount: 10, region: 'global' })
  const [lobbyForm, setLobbyForm] = useState({
    title: 'Prime Lobby',
    queue_type: 'custom',
    game_mode: 'competitive',
    wager_amount: 10,
    region: 'global',
    is_private: false,
    lobby_password: '',
    map_pool: ['Dust2', 'Mirage', 'Inferno'],
  })

  const activeMatch = matchmakingQuery.data?.activeMatch ?? null
  const teams = useMemo(() => {
    if (!activeMatch) {
      return { A: [], B: [], solo: [] } as Record<MatchTeam, MatchPlayerView[]>
    }

    return {
      A: activeMatch.players.filter((player) => player.team === 'A'),
      B: activeMatch.players.filter((player) => player.team === 'B'),
      solo: activeMatch.players.filter((player) => player.team === 'solo'),
    }
  }, [activeMatch])

  useEffect(() => {
    if (!socket || !activeMatch) {
      return
    }

    socket.emit('match:subscribe', activeMatch.match.id)

    return () => {
      socket.emit('match:unsubscribe', activeMatch.match.id)
    }
  }, [activeMatch, socket])

  const invalidateMatchmaking = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['matchmaking'] }),
      queryClient.invalidateQueries({ queryKey: ['bootstrap'] }),
      queryClient.invalidateQueries({ queryKey: ['wallet'] }),
    ])
  }

  const queueMutation = useMutation({
    mutationFn: () =>
      apiRequest('/matchmaking/queue', {
        method: 'POST',
        body: JSON.stringify(queueForm),
      }),
    onSuccess: async () => {
      setFeedback('Queue request accepted.')
      await invalidateMatchmaking()
    },
  })

  const leaveQueueMutation = useMutation({
    mutationFn: () =>
      apiRequest('/matchmaking/queue', {
        method: 'DELETE',
      }),
    onSuccess: async () => {
      setFeedback('Queue entry removed and stake released.')
      await invalidateMatchmaking()
    },
  })

  const createLobbyMutation = useMutation({
    mutationFn: () =>
      apiRequest('/matchmaking/lobbies', {
        method: 'POST',
        body: JSON.stringify(lobbyForm),
      }),
    onSuccess: async () => {
      setFeedback('Custom lobby created.')
      await invalidateMatchmaking()
    },
  })

  const lobbyActionMutation = useMutation({
    mutationFn: ({
      path,
      body,
    }: {
      path: string
      body?: Record<string, unknown>
    }) =>
      apiRequest(path, {
        method: 'POST',
        body: JSON.stringify(body ?? {}),
      }),
    onSuccess: async () => {
      await invalidateMatchmaking()
    },
  })

  if (matchmakingQuery.isLoading || !matchmakingQuery.data) {
    return <Panel className="text-sm text-zinc-400">Loading matchmaking state...</Panel>
  }

  if (matchmakingQuery.isError) {
    return (
      <ErrorState
        title="Matchmaking state failed to load"
        message="Queue, lobby, or realtime endpoints are not responding correctly. Check the API service and refresh."
      />
    )
  }

  const { openLobbies, queueEntries } = matchmakingQuery.data
  const queueLocked = queueEntries.length > 0

  return (
    <div className="space-y-6">
      <SectionTitle
        eyebrow="Matchmaking"
        title="Queue and lobby orchestration"
        description="Public queueing is ELO aware and stake aware. Custom lobbies handle team select, ready check, map voting, and server start."
      />

      {feedback ? <Panel className="border-signal-cyan/20 bg-signal-cyan/10 py-4 text-sm text-signal-cyan">{feedback}</Panel> : null}

      <div className="grid gap-4 xl:grid-cols-2">
        <Panel className="space-y-4">
          <div>
            <p className="text-xs uppercase tracking-[0.24em] text-zinc-500">Public auto queue</p>
            <h3 className="mt-2 text-2xl font-semibold text-white">Find a stake-matched lobby</h3>
          </div>
          <form
            className="grid gap-3"
            onSubmit={(event) => {
              event.preventDefault()
              queueMutation.mutate()
            }}
          >
            <Select value={queueForm.match_mode} onChange={(event) => setQueueForm((current) => ({ ...current, match_mode: event.target.value }))}>
              {modes.map((mode) => (
                <option key={mode.value} value={mode.value}>
                  {mode.label}
                </option>
              ))}
            </Select>
            <div className="grid gap-3 sm:grid-cols-2">
              <Input
                type="number"
                min={1}
                step="0.01"
                value={queueForm.wager_amount}
                onChange={(event) => setQueueForm((current) => ({ ...current, wager_amount: Number(event.target.value) }))}
              />
              <Input value={queueForm.region} onChange={(event) => setQueueForm((current) => ({ ...current, region: event.target.value }))} />
            </div>
            <div className="flex gap-3">
              <Button type="submit" disabled={queueLocked || queueMutation.isPending}>
                {queueMutation.isPending ? 'Joining queue...' : 'Join public queue'}
              </Button>
              {queueLocked ? (
                <Button type="button" variant="secondary" disabled={leaveQueueMutation.isPending} onClick={() => leaveQueueMutation.mutate()}>
                  Leave queue
                </Button>
              ) : null}
            </div>
          </form>
          {queueEntries.length > 0 ? (
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-sm text-zinc-300">
              {queueEntries.map((entry) => (
                <p key={entry.id}>
                  Queued for {entry.match_mode.toUpperCase()} at {formatUsdt(entry.wager_amount)} USDT in {entry.region}.
                </p>
              ))}
            </div>
          ) : null}
        </Panel>

        <Panel className="space-y-4">
          <div>
            <p className="text-xs uppercase tracking-[0.24em] text-zinc-500">Custom lobby</p>
            <h3 className="mt-2 text-2xl font-semibold text-white">Build a controlled 5v5 room</h3>
          </div>
          <form
            className="grid gap-3"
            onSubmit={(event) => {
              event.preventDefault()
              createLobbyMutation.mutate()
            }}
          >
            <Input value={lobbyForm.title} onChange={(event) => setLobbyForm((current) => ({ ...current, title: event.target.value }))} />
            <div className="grid gap-3 sm:grid-cols-2">
              <Select value={lobbyForm.game_mode} onChange={(event) => setLobbyForm((current) => ({ ...current, game_mode: event.target.value }))}>
                {modes.map((mode) => (
                  <option key={mode.value} value={mode.value}>
                    {mode.label}
                  </option>
                ))}
              </Select>
              <Input
                type="number"
                min={1}
                step="0.01"
                value={lobbyForm.wager_amount}
                onChange={(event) => setLobbyForm((current) => ({ ...current, wager_amount: Number(event.target.value) }))}
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Input value={lobbyForm.region} onChange={(event) => setLobbyForm((current) => ({ ...current, region: event.target.value }))} />
              <label className="flex items-center gap-3 rounded-2xl border border-white/10 bg-panel-900/80 px-4 py-3 text-sm text-zinc-300">
                <input
                  type="checkbox"
                  checked={lobbyForm.is_private}
                  onChange={(event) => setLobbyForm((current) => ({ ...current, is_private: event.target.checked }))}
                />
                Private lobby
              </label>
            </div>
            {lobbyForm.is_private ? (
              <Input
                placeholder="Lobby password"
                value={lobbyForm.lobby_password}
                onChange={(event) => setLobbyForm((current) => ({ ...current, lobby_password: event.target.value }))}
              />
            ) : null}
            <div className="flex flex-wrap gap-2">
              {MAP_POOL.map((mapName) => {
                const selected = lobbyForm.map_pool.includes(mapName)

                return (
                  <button
                    key={mapName}
                    type="button"
                    className={cn(
                      'rounded-full border px-3 py-1 text-xs uppercase tracking-[0.18em] transition',
                      selected ? 'border-signal-orange bg-signal-orange/10 text-signal-orange' : 'border-white/10 text-zinc-400 hover:border-white/30',
                    )}
                    onClick={() =>
                      setLobbyForm((current) => ({
                        ...current,
                        map_pool: selected ? current.map_pool.filter((map) => map !== mapName) : [...current.map_pool, mapName],
                      }))
                    }
                  >
                    {mapName}
                  </button>
                )
              })}
            </div>
            <Button type="submit" disabled={createLobbyMutation.isPending}>
              {createLobbyMutation.isPending ? 'Creating lobby...' : 'Create custom lobby'}
            </Button>
          </form>
        </Panel>
      </div>

      {activeMatch ? (
        <Panel className="space-y-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.24em] text-zinc-500">Live lobby control</p>
              <h3 className="mt-2 text-2xl font-semibold text-white">{activeMatch.match.title}</h3>
              <p className="mt-2 text-sm text-zinc-400">
                {activeMatch.match.game_mode.toUpperCase()} · {formatUsdt(activeMatch.match.wager_amount)} USDT stake · {activeMatch.match.phase}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <StatusBadge tone="brand">{activeMatch.match.queue_type}</StatusBadge>
              <StatusBadge tone={activeMatch.match.status === 'live' ? 'success' : 'warning'}>{activeMatch.match.status}</StatusBadge>
              {activeMatch.match.selected_map ? <StatusBadge tone="neutral">{activeMatch.match.selected_map}</StatusBadge> : null}
            </div>
          </div>

          {activeMatch.match.game_mode === 'ffa' ? (
            <TeamColumn title="FFA roster" players={teams.solo} />
          ) : (
            <div className="grid gap-4 xl:grid-cols-2">
              <TeamColumn title="Team A" players={teams.A} />
              <TeamColumn title="Team B" players={teams.B} />
            </div>
          )}

          <div className="flex flex-wrap gap-3">
            {activeMatch.match.game_mode !== 'ffa' ? (
              <>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => lobbyActionMutation.mutate({ path: `/matchmaking/lobbies/${activeMatch.match.id}/team`, body: { team: 'A' } })}
                >
                  Move to Team A
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => lobbyActionMutation.mutate({ path: `/matchmaking/lobbies/${activeMatch.match.id}/team`, body: { team: 'B' } })}
                >
                  Move to Team B
                </Button>
              </>
            ) : null}
            <Button type="button" onClick={() => lobbyActionMutation.mutate({ path: `/matchmaking/lobbies/${activeMatch.match.id}/ready` })}>
              Toggle ready
            </Button>
            {activeMatch.match.phase === 'map_vote' || activeMatch.match.phase === 'starting'
              ? MAP_POOL.map((mapName) => (
                  <Button
                    key={mapName}
                    type="button"
                    variant="ghost"
                    className={cn(!activeMatch.match.map_pool.includes(mapName) && 'hidden')}
                    onClick={() => lobbyActionMutation.mutate({ path: `/matchmaking/lobbies/${activeMatch.match.id}/vote`, body: { map_name: mapName } })}
                  >
                    Vote {mapName}
                  </Button>
                ))
              : null}
            {activeMatch.match.phase === 'starting' ? (
              <Button type="button" onClick={() => lobbyActionMutation.mutate({ path: `/matchmaking/lobbies/${activeMatch.match.id}/start` })}>
                Start match
              </Button>
            ) : null}
          </div>
        </Panel>
      ) : null}

      <Panel className="space-y-4">
        <p className="text-xs uppercase tracking-[0.24em] text-zinc-500">Open lobbies</p>
        {openLobbies.length > 0 ? (
          <div className="grid gap-4 md:grid-cols-2">
            {openLobbies.map((lobby) => (
              <div key={lobby.id} className="rounded-[24px] border border-white/10 bg-white/[0.03] p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-lg font-semibold text-white">{lobby.title}</h3>
                    <p className="mt-1 text-sm text-zinc-400">
                      {lobby.game_mode.toUpperCase()} · {formatUsdt(lobby.wager_amount)} USDT
                    </p>
                  </div>
                  <StatusBadge tone={lobby.is_private ? 'warning' : 'neutral'}>{lobby.is_private ? 'Private' : 'Public'}</StatusBadge>
                </div>
                <div className="mt-4 flex items-center justify-between">
                  <p className="text-sm text-zinc-500">{lobby.region}</p>
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => {
                      const password = lobby.is_private ? window.prompt('Enter lobby password') ?? '' : undefined
                      lobbyActionMutation.mutate({ path: `/matchmaking/lobbies/${lobby.id}/join`, body: { password } })
                    }}
                  >
                    Join lobby
                  </Button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState title="No live lobbies" message="Create a custom room or join the public queue to seed the next match." />
        )}
      </Panel>
    </div>
  )
}
