import { motion } from "motion/react";
import {
  Activity,
  ArrowUpRight,
  ChevronRight,
  Crown,
  MessageSquareQuote,
  MonitorPlay,
  Radar,
  Server,
  Sparkles,
  Swords,
  Trophy,
  Users,
} from "lucide-react";
import React, { useEffect, useMemo, useState } from "react";
import { isSupabaseConfigured } from "../lib/env";
import { fetchOpenMatchmakingLobbies, fetchRecentMatches } from "../lib/supabase/matchmaking";
import { fetchPublicApexLeaderboard } from "../lib/supabase/social";
import { supabase } from "../lib/supabase";
import type { AccountMode, UserStats } from "./types";

type DashboardMatchSummary = Awaited<ReturnType<typeof fetchRecentMatches>>[number];
type DashboardOpenLobby = Awaited<ReturnType<typeof fetchOpenMatchmakingLobbies>>[number];
type DashboardLeaderboardEntry = Awaited<ReturnType<typeof fetchPublicApexLeaderboard>>[number];

const MOTD_BY_MODE: Record<AccountMode, { title: string; body: string; badge: string }> = {
  demo: {
    badge: "Demo Control",
    title: "Quick Queue pressure test is live tonight",
    body: "High-stake demo queues, live server activity, and party-ready matchmaking are all hot right now. Use the dashboard to jump straight into the busiest action.",
  },
  live: {
    badge: "Live Arena",
    title: "Prime-time stake matches are heating up",
    body: "Track the richest finished matches, see which servers are filling in real time, and scout the strongest win-rate climbers before you queue.",
  },
};

export function SidebarItem({ icon, label, active, onClick, highlight }: any) {
  return (
    <div
      onClick={onClick}
      className={`sidebar-item ${active ? "active" : ""} ${highlight ? "text-esport-secondary hover:text-esport-secondary" : ""}`}
    >
      <div className="shrink-0">{icon}</div>
      <span className="text-sm font-bold tracking-tight">{label}</span>
      {highlight && <div className="ml-auto w-2 h-2 bg-esport-secondary rounded-full shadow-[0_0_8px_rgba(249,115,22,0.6)]" />}
    </div>
  );
}

export function DashboardView({
  stats,
  accountMode,
  openModal,
  onOpenPublicProfile,
}: {
  stats: UserStats | null;
  accountMode: AccountMode;
  openModal?: (title: string, body: React.ReactNode, options?: any) => void;
  onOpenPublicProfile?: (userId: string) => void | Promise<void>;
}) {
  const [recentMatches, setRecentMatches] = useState<DashboardMatchSummary[]>([]);
  const [liveServers, setLiveServers] = useState<DashboardOpenLobby[]>([]);
  const [leaders, setLeaders] = useState<DashboardLeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const loadDashboard = async () => {
      if (!isSupabaseConfigured()) {
        if (!cancelled) {
          setRecentMatches([]);
          setLiveServers([]);
          setLeaders([]);
          setLoading(false);
        }
        return;
      }

      try {
        const { data: sessionData } = await supabase.auth.getSession();
        if (!sessionData.session?.user) {
          if (!cancelled) {
            setRecentMatches([]);
            setLiveServers([]);
            setLeaders([]);
          }
          return;
        }

        const [matchRows, lobbyRows, leaderRows] = await Promise.all([
          fetchRecentMatches(accountMode, 6),
          fetchOpenMatchmakingLobbies(accountMode),
          fetchPublicApexLeaderboard(5),
        ]);

        if (cancelled) {
          return;
        }

        setRecentMatches(
          [...matchRows].sort((a, b) => Number(b.stakeAmount || 0) - Number(a.stakeAmount || 0)).slice(0, 6)
        );
        setLiveServers(lobbyRows.slice(0, 4));
        setLeaders(leaderRows.slice(0, 5));
      } catch (error) {
        console.error("Failed to load dashboard data:", error);
        if (!cancelled) {
          setRecentMatches([]);
          setLiveServers([]);
          setLeaders([]);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    void loadDashboard();
    const interval = window.setInterval(() => {
      void loadDashboard();
    }, 15000);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [accountMode]);

  const motd = MOTD_BY_MODE[accountMode];
  const highestStake = useMemo(
    () => recentMatches.reduce((max, match) => Math.max(max, Number(match.stakeAmount || 0)), 0),
    [recentMatches]
  );
  const totalLiveSeats = useMemo(
    () =>
      liveServers.reduce((sum, lobby) => {
        const activeMembers = (lobby.lobby_members || []).filter((member) => !member.left_at && !member.kicked_at).length;
        return sum + activeMembers;
      }, 0),
    [liveServers]
  );

  const metricCards = [
    {
      label: "Live Rooms",
      value: liveServers.length.toString(),
      caption: "open right now",
      icon: <Server size={18} />,
      accent: "text-sky-300",
    },
    {
      label: "Top Stake",
      value: `${highestStake || 0} USDT`,
      caption: recentMatches.length ? "latest high roller" : "no finished matches yet",
      icon: <Crown size={18} />,
      accent: "text-amber-300",
    },
    {
      label: "Top Win Rate",
      value: leaders[0]?.win_rate || stats?.winRate || "0%",
      caption: leaders[0]?.username || "no leaderboard data yet",
      icon: <Trophy size={18} />,
      accent: "text-emerald-300",
    },
    {
      label: "Active Seats",
      value: totalLiveSeats.toString(),
      caption: "players inside open rooms",
      icon: <Users size={18} />,
      accent: "text-fuchsia-300",
    },
  ];

  const openMatchModal = (match: DashboardMatchSummary) => {
    openModal?.(
      `${match.name} Stats`,
      <DashboardMatchModal match={match} />,
      { size: "wide" }
    );
  };

  return (
    <div className="space-y-6">
      <section className="relative overflow-hidden rounded-[28px] border border-esport-accent/25 bg-[radial-gradient(circle_at_top_left,rgba(59,130,246,0.22),transparent_34%),linear-gradient(180deg,#111829_0%,#0b1020_100%)] p-6 md:p-8">
        <div className="absolute -right-16 top-0 h-56 w-56 rounded-full bg-esport-accent/10 blur-3xl" />
        <div className="absolute right-6 top-6 hidden lg:flex h-14 items-center gap-2 rounded-full border border-white/10 bg-black/20 px-4 text-xs uppercase tracking-[0.22em] text-esport-text-muted">
          <Radar className="h-4 w-4 text-esport-accent" />
          Arena overview live
        </div>
        <div className="relative grid gap-6 lg:grid-cols-[1.35fr_0.95fr]">
          <div className="space-y-4">
            <div className="inline-flex items-center gap-2 rounded-full border border-esport-accent/30 bg-esport-accent/10 px-4 py-2 text-[11px] font-bold uppercase tracking-[0.24em] text-esport-accent">
              <Sparkles className="h-3.5 w-3.5" />
              {motd.badge}
            </div>
            <div>
              <h2 className="text-4xl font-display font-bold uppercase tracking-tight text-white">Arena Command Deck</h2>
              <p className="mt-3 max-w-3xl text-base leading-relaxed text-esport-text-muted">
                The dashboard is now your live front page: richest recent matches, open rooms, hot servers, and the players controlling the current ladder.
              </p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="rounded-2xl border border-white/10 bg-black/20 p-5">
                <div className="text-[11px] font-bold uppercase tracking-[0.24em] text-esport-text-muted">Message Of The Day</div>
                <div className="mt-3 text-xl font-display font-bold text-white">{motd.title}</div>
                <p className="mt-2 text-sm leading-relaxed text-esport-text-muted">{motd.body}</p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-black/20 p-5">
                <div className="text-[11px] font-bold uppercase tracking-[0.24em] text-esport-text-muted">Quick Actions</div>
                <div className="mt-4 space-y-3">
                  {[
                    "Open the richest finished match and inspect the scoreboard.",
                    "Scout the busiest live rooms before queueing into the same stake.",
                    "Check the highest win-rate players without leaving the home screen.",
                  ].map((action) => (
                    <div key={action} className="flex items-start gap-3 text-sm text-white/90">
                      <div className="mt-1 h-2 w-2 rounded-full bg-esport-accent shadow-[0_0_12px_rgba(59,130,246,0.7)]" />
                      <span>{action}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            {metricCards.map((card, index) => (
              <motion.div
                key={card.label}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.05 * index }}
                className="rounded-2xl border border-white/10 bg-black/20 p-5 backdrop-blur-sm"
              >
                <div className="flex items-center justify-between">
                  <div className={`rounded-xl bg-white/5 p-2 ${card.accent}`}>{card.icon}</div>
                  <ArrowUpRight className="h-4 w-4 text-esport-text-muted" />
                </div>
                <div className="mt-6 text-3xl font-display font-bold text-white">{card.value}</div>
                <div className="mt-1 text-[11px] font-bold uppercase tracking-[0.24em] text-esport-text-muted">{card.label}</div>
                <div className="mt-2 text-sm text-esport-text-muted">{card.caption}</div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-[1.35fr_0.95fr]">
        <section className="esport-card p-6">
          <div className="mb-5 flex items-center justify-between gap-4">
            <div>
              <div className="text-[11px] font-bold uppercase tracking-[0.24em] text-esport-text-muted">High-Stake Recent Matches</div>
              <h3 className="mt-2 text-2xl font-display font-bold uppercase text-white">Click To Inspect Match Stats</h3>
            </div>
            <div className="rounded-full border border-esport-secondary/30 bg-esport-secondary/10 px-4 py-2 text-xs font-bold uppercase tracking-[0.2em] text-esport-secondary">
              richest first
            </div>
          </div>
          <div className="space-y-3">
            {recentMatches.length === 0 ? (
              <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-6 text-sm text-esport-text-muted">
                No finished matches yet.
              </div>
            ) : recentMatches.map((match) => (
              <button
                key={match.id}
                type="button"
                onClick={() => openMatchModal(match)}
                className="group grid w-full gap-4 rounded-2xl border border-white/8 bg-white/[0.03] p-4 text-left transition-all hover:border-esport-accent/40 hover:bg-esport-accent/[0.06] md:grid-cols-[1.3fr_0.8fr_0.55fr]"
              >
                <div className="flex items-start gap-4">
                  <div className="rounded-2xl bg-esport-accent/10 p-3 text-esport-accent">
                    <Swords size={20} />
                  </div>
                  <div>
                    <div className="text-base font-bold text-white group-hover:text-esport-accent transition-colors">{match.name}</div>
                    <div className="mt-1 text-sm text-esport-text-muted">
                      {match.selectedMap} · {String(match.gameMode).toUpperCase()} · Winner {match.winningSide}
                    </div>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-esport-text-muted">Stake</div>
                    <div className="mt-1 text-lg font-display font-bold text-amber-300">{match.stakeAmount} USDT</div>
                  </div>
                  <div>
                    <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-esport-text-muted">Score</div>
                    <div className="mt-1 text-lg font-display font-bold text-white">
                      {match.winningScore} - {match.losingScore}
                    </div>
                  </div>
                </div>
                <div className="flex items-center justify-between md:justify-end">
                  <div className="text-xs uppercase tracking-[0.18em] text-esport-text-muted">{formatRelativeTime(match.endedAt || match.startedAt)}</div>
                  <ChevronRight className="h-5 w-5 text-esport-text-muted transition-transform group-hover:translate-x-1 group-hover:text-white" />
                </div>
              </button>
            ))}
          </div>
        </section>

        <section className="space-y-6">
          <div className="esport-card p-6">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-[11px] font-bold uppercase tracking-[0.24em] text-esport-text-muted">Live Server Rooms</div>
                <h3 className="mt-2 text-2xl font-display font-bold uppercase text-white">Open Tables In Real Time</h3>
              </div>
              <MonitorPlay className="h-5 w-5 text-esport-accent" />
            </div>
            <div className="mt-5 space-y-3">
              {(liveServers.length
                ? liveServers.map((lobby) => ({
                    id: lobby.id,
                    name: lobby.name,
                    map: lobby.selected_map || "Map voting",
                    players: (lobby.lobby_members || []).filter((member) => !member.left_at && !member.kicked_at).length,
                    maxPlayers: lobby.max_players,
                    status: lobby.status === "open" ? "Open" : "In Progress",
                    stake: Number(lobby.stake_amount || 0),
                    modeLabel: `${lobby.team_size}v${lobby.team_size}`,
                  }))
                : []
              ).map((server) => (
                <div key={server.id} className="rounded-2xl border border-white/8 bg-white/[0.03] p-4">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <div className="text-sm font-bold text-white">{server.name}</div>
                      <div className="mt-1 text-xs uppercase tracking-[0.18em] text-esport-text-muted">
                        {server.modeLabel} · {server.map}
                      </div>
                    </div>
                    <div className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.2em] text-emerald-300">
                      {server.status}
                    </div>
                  </div>
                  <div className="mt-4 flex items-center justify-between text-sm">
                    <span className="text-esport-text-muted">{server.players}/{server.maxPlayers} seated</span>
                    <span className="font-bold text-sky-300">{server.stake} USDT</span>
                  </div>
                  <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/5">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-esport-accent to-sky-400"
                      style={{ width: `${Math.min((server.players / Math.max(server.maxPlayers, 1)) * 100, 100)}%` }}
                    />
                  </div>
                </div>
              ))}
              {liveServers.length === 0 && (
                <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-6 text-sm text-esport-text-muted">
                  No open server rooms right now.
                </div>
              )}
            </div>
          </div>

          <div className="esport-card p-6">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-[11px] font-bold uppercase tracking-[0.24em] text-esport-text-muted">Win Rate Leaders</div>
                <h3 className="mt-2 text-2xl font-display font-bold uppercase text-white">Hot Players Right Now</h3>
              </div>
              <Trophy className="h-5 w-5 text-amber-300" />
            </div>
            <div className="mt-5 space-y-3">
              {leaders.map((player, index) => {
                const displayName = player.username || `Player ${player.user_id.slice(0, 8)}`;
                const avatar =
                  player.avatar_url ||
                  `https://ui-avatars.com/api/?name=${encodeURIComponent(displayName)}&background=1f2937&color=ffffff&size=128`;
                return (
                  <button
                    key={`${player.user_id}-${index}`}
                    type="button"
                    onClick={() => {
                      if (player.user_id && onOpenPublicProfile) {
                        void onOpenPublicProfile(player.user_id);
                      }
                    }}
                    className="flex w-full items-center gap-4 rounded-2xl border border-white/8 bg-white/[0.03] p-4 text-left transition-all hover:border-esport-accent/40 hover:bg-esport-accent/[0.06]"
                  >
                    <div className="w-9 text-center text-lg font-display font-bold text-esport-text-muted">#{index + 1}</div>
                    <img src={avatar} alt={displayName} className="h-11 w-11 rounded-2xl border border-white/10 object-cover" />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-bold text-white">{displayName}</div>
                      <div className="mt-1 text-xs uppercase tracking-[0.18em] text-esport-text-muted">{player.rank || "Unranked"}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-lg font-display font-bold text-emerald-300">{player.win_rate || "0%"}</div>
                      <div className="text-[10px] uppercase tracking-[0.18em] text-esport-text-muted">win rate</div>
                    </div>
                  </button>
                );
              })}
              {leaders.length === 0 && (
                <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-6 text-sm text-esport-text-muted">
                  No leaderboard data yet.
                </div>
              )}
            </div>
          </div>
        </section>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.05fr_0.95fr]">
        <section className="esport-card p-6">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-[11px] font-bold uppercase tracking-[0.24em] text-esport-text-muted">Arena Feed</div>
              <h3 className="mt-2 text-2xl font-display font-bold uppercase text-white">What To Watch Next</h3>
            </div>
            <MessageSquareQuote className="h-5 w-5 text-esport-accent" />
          </div>
          <div className="mt-5 rounded-2xl border border-white/8 bg-white/[0.03] p-6 text-sm text-esport-text-muted">
            Arena feed will populate automatically once real matches, rooms, and leaderboard activity start coming in.
          </div>
        </section>

        <section className="esport-card p-6">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-[11px] font-bold uppercase tracking-[0.24em] text-esport-text-muted">Personal Snapshot</div>
              <h3 className="mt-2 text-2xl font-display font-bold uppercase text-white">Keep It Lightweight</h3>
            </div>
            <Activity className="h-5 w-5 text-esport-secondary" />
          </div>
          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            <CompactStat title="Win Rate" value={stats?.winRate || "0%"} />
            <CompactStat title="K/D" value={String(stats?.kdRatio || "0.00")} />
            <CompactStat title="Headshot" value={stats?.headshotPct || "0%"} />
          </div>
          <div className="mt-5 rounded-2xl border border-esport-secondary/20 bg-esport-secondary/10 p-4 text-sm text-esport-text-muted">
            Neural Map stays the deep-dive analytics zone. The dashboard now keeps your personal stats compact so the main page stays focused on live arena activity.
          </div>
        </section>
      </div>

      {loading && (
        <div className="rounded-2xl border border-esport-border bg-white/[0.03] p-4 text-sm text-esport-text-muted">
          Syncing dashboard feeds...
        </div>
      )}
    </div>
  );
}

function CompactStat({ title, value }: { title: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-4">
      <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-esport-text-muted">{title}</div>
      <div className="mt-2 text-2xl font-display font-bold text-white">{value}</div>
    </div>
  );
}

function DashboardMatchModal({ match }: { match: DashboardMatchSummary }) {
  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-4">
        <CompactStat title="Stake" value={`${match.stakeAmount} USDT`} />
        <CompactStat title="Map" value={match.selectedMap || "-"} />
        <CompactStat title="Mode" value={String(match.gameMode).toUpperCase()} />
        <CompactStat title="Winner" value={match.winningSide} />
      </div>
      <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-5">
        <div className="text-[11px] font-bold uppercase tracking-[0.24em] text-esport-text-muted">Final Score</div>
        <div className="mt-3 text-4xl font-display font-bold text-white">
          {match.winningScore} - {match.losingScore}
        </div>
        <div className="mt-3 text-sm text-esport-text-muted">
          Started {formatRelativeTime(match.startedAt)} · Ended {formatRelativeTime(match.endedAt || match.startedAt)}
        </div>
      </div>
      <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-5 text-sm leading-relaxed text-esport-text-muted">
        This match finished in the <span className="font-bold text-white">{match.name}</span> room on <span className="font-bold text-white">{match.selectedMap || "the selected map"}</span>.
        The winning side was <span className="font-bold text-white">{match.winningSide}</span>, and the room ran at a stake of <span className="font-bold text-amber-300">{match.stakeAmount} USDT</span>.
      </div>
    </div>
  );
}

function formatRelativeTime(value?: string | null) {
  if (!value) {
    return "just now";
  }

  const deltaMs = Date.now() - new Date(value).getTime();
  const minutes = Math.max(1, Math.floor(deltaMs / 60000));
  if (minutes < 60) {
    return `${minutes}m ago`;
  }
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return `${hours}h ago`;
  }
  return `${Math.floor(hours / 24)}d ago`;
}
