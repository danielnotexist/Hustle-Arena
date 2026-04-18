import { Clock3, Lock, MessageSquare, Radio, Server, Users } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import React, { useEffect, useMemo, useRef, useState } from "react";
import anubisMap from "../assets/maps/anubis.svg";
import ancientMap from "../assets/maps/ancient.svg";
import dust2Map from "../assets/maps/dust2.svg";
import { isSupabaseConfigured } from "../lib/env";
import infernoMap from "../assets/maps/inferno.svg";
import mirageMap from "../assets/maps/mirage.svg";
import nukeMap from "../assets/maps/nuke.svg";
import overpassMap from "../assets/maps/overpass.svg";
import {
  castLobbyMapVote,
  completeDemoMatchForTesting,
  createMatchmakingLobby,
  ensureLobbyMapVoteSession,
  fetchUnreadDemoMatchResultNotifications,
  fetchMyActiveLobby,
  fetchMyActiveMatch,
  fetchOpenMatchmakingLobbies,
  fetchRecentMatches,
  joinMatchmakingLobby,
  joinMatchServer,
  kickLobbyMember,
  launchMatchServer,
  leaveMatchmakingLobby,
  markNotificationRead,
  sendLobbyMessage,
  setLobbyMemberReady,
  setLobbyMemberTeamSide,
  syncLobbyAutoVeto,
  syncMapVoteSession,
  type ActiveMatch,
  type LobbyMode,
  type MatchmakingLobby,
  type MatchmakingLobbyMember,
  type RecentMatchSummary,
  type SupportedGameMode,
  type TeamSide,
} from "../lib/supabase/matchmaking";
import { sendFriendRequest } from "../lib/supabase/social";
import { supabase } from "../lib/supabase";
import { playChatMessageSound } from "../lib/sound";
import type { AccountMode } from "./types";
import { KYCForm } from "./landing-auth";
import { cn } from "./shared-ui";

const MAP_LABELS: Record<string, string> = {
  dust2: "Dust II",
  inferno: "Inferno",
  mirage: "Mirage",
  nuke: "Nuke",
  anubis: "Anubis",
  ancient: "Ancient",
  overpass: "Overpass",
};

const MAP_BACKGROUNDS: Record<string, string> = {
  dust2: dust2Map,
  inferno: infernoMap,
  mirage: mirageMap,
  nuke: nukeMap,
  anubis: anubisMap,
  ancient: ancientMap,
  overpass: overpassMap,
};

const STAKE_OPTIONS = ["5", "10", "25", "50", "100", "300", "500", "1000"] as const;
const SQUAD_HUB_CACHE_PREFIX = "hustle_arena_squad_hub";
const QUICK_QUEUE_STATE_STORAGE_KEY = "hustle_arena_quick_queue_state";

const getGameModeOptions = (teamSize: 2 | 5): SupportedGameMode[] =>
  teamSize === 2 ? ["wingman"] : ["competitive", "team_ffa", "ffa"];

const formatMode = (value: string | null | undefined) => {
  const normalized = (value || "competitive").toLowerCase();

  if (normalized === "ffa") {
    return "FFA";
  }

  if (normalized === "team_ffa") {
    return "Team FFA";
  }

  return normalized.replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
};

const getActiveMembers = (lobby: MatchmakingLobby | null) =>
  (lobby?.lobby_members || [])
    .filter((member) => !member.left_at && !member.kicked_at)
    .sort((a, b) => {
      const aJoined = a.joined_at ? new Date(a.joined_at).getTime() : 0;
      const bJoined = b.joined_at ? new Date(b.joined_at).getTime() : 0;
      if (aJoined !== bJoined) {
        return aJoined - bJoined;
      }
      return a.user_id.localeCompare(b.user_id);
    });

const getLobbyVoteSessions = (lobby: MatchmakingLobby | null) =>
  (
    Array.isArray(lobby?.map_vote_sessions)
      ? lobby.map_vote_sessions
      : lobby?.map_vote_sessions
        ? [lobby.map_vote_sessions]
        : []
  ).slice().sort((a, b) => {
    const aActive = a.status === "active" ? 1 : 0;
    const bActive = b.status === "active" ? 1 : 0;
    if (aActive !== bActive) {
      return bActive - aActive;
    }

    const aUpdatedAt = a.updated_at ? new Date(a.updated_at).getTime() : 0;
    const bUpdatedAt = b.updated_at ? new Date(b.updated_at).getTime() : 0;
    if (aUpdatedAt !== bUpdatedAt) {
      return bUpdatedAt - aUpdatedAt;
    }

    if (a.round_number !== b.round_number) {
      return b.round_number - a.round_number;
    }

    return b.id.localeCompare(a.id);
  });

const getCountdown = (turnEndsAt: string | null | undefined, nowMs = Date.now()) => {
  if (!turnEndsAt) return "00:00";
  const seconds = Math.max(0, Math.ceil((new Date(turnEndsAt).getTime() - nowMs) / 1000));
  return `00:${seconds.toString().padStart(2, "0")}`;
};

const getSquadHubLobbyCacheKey = (userId?: string, accountMode?: AccountMode) =>
  `${SQUAD_HUB_CACHE_PREFIX}:lobby:${accountMode || "demo"}:${userId || "guest"}`;

const getSquadHubMatchCacheKey = (userId?: string, accountMode?: AccountMode) =>
  `${SQUAD_HUB_CACHE_PREFIX}:match:${accountMode || "demo"}:${userId || "guest"}`;

const readCachedSquadHubLobby = (userId?: string, accountMode?: AccountMode): MatchmakingLobby | null => {
  if (typeof window === "undefined" || !userId) {
    return null;
  }

  try {
    const raw = window.localStorage.getItem(getSquadHubLobbyCacheKey(userId, accountMode));
    return raw ? (JSON.parse(raw) as MatchmakingLobby) : null;
  } catch (error) {
    console.error("Failed to read cached squad hub lobby:", error);
    return null;
  }
};

const readCachedSquadHubMatch = (userId?: string, accountMode?: AccountMode): ActiveMatch | null => {
  if (typeof window === "undefined" || !userId) {
    return null;
  }

  try {
    const raw = window.localStorage.getItem(getSquadHubMatchCacheKey(userId, accountMode));
    return raw ? (JSON.parse(raw) as ActiveMatch) : null;
  } catch (error) {
    console.error("Failed to read cached squad hub match:", error);
    return null;
  }
};

const getMemberDisplayName = (member: MatchmakingLobbyMember) => {
  const username = member.profiles?.username?.trim();
  if (username) {
    return username;
  }

  const emailName = member.profiles?.email?.split("@")[0]?.trim();
  if (emailName) {
    return emailName;
  }

  return `Player ${member.user_id.slice(0, 8)}`;
};

const getMemberAvatarUrl = (
  member: MatchmakingLobbyMember,
  currentUserId?: string,
  currentUserAvatarUrl?: string | null
) => {
  if (currentUserId && member.user_id === currentUserId && currentUserAvatarUrl) {
    return currentUserAvatarUrl;
  }
  if (member.profiles?.avatar_url) {
    return member.profiles.avatar_url;
  }
  const display = getMemberDisplayName(member);
  return `https://ui-avatars.com/api/?name=${encodeURIComponent(display)}&background=1f2937&color=ffffff&size=96`;
};

const getTeamNameColorClass = (teamSide: TeamSide | null | undefined) => {
  if (teamSide === "T") {
    return "text-[#ff5e7b]";
  }

  if (teamSide === "CT") {
    return "text-[#30d5ff]";
  }

  return "text-slate-400";
};

function TeamBoard({
  title,
  accentClass,
  members,
  capacity,
  currentUserId,
  currentUserAvatarUrl,
  leaderId,
  teamSide,
  isCurrentTeam,
  onMove,
  canKick,
  onKick,
  onAddFriend,
  friendActionByUserId,
  addingFriendIds,
}: {
  title: string;
  accentClass: string;
  members: MatchmakingLobbyMember[];
  capacity: number;
  currentUserId?: string;
  currentUserAvatarUrl?: string | null;
  leaderId?: string;
  teamSide: TeamSide;
  isCurrentTeam: boolean;
  onMove: (side: TeamSide) => Promise<void>;
  canKick?: boolean;
  onKick?: (userId: string) => Promise<void>;
  onAddFriend?: (userId: string) => Promise<void>;
  friendActionByUserId?: Record<string, "none" | "requested" | "friends">;
  addingFriendIds?: Record<string, boolean>;
}) {
  return (
    <button
      type="button"
      onClick={() => void onMove(teamSide)}
      className={cn(
        "rounded-[24px] border p-5 text-left transition-all duration-200 shadow-[0_18px_45px_rgba(0,0,0,0.22)]",
        accentClass,
        isCurrentTeam ? "ring-2 ring-white/80 scale-[1.01]" : "hover:-translate-y-0.5 hover:border-white/70"
      )}
    >
      <div className="mb-4 flex items-center justify-between">
        <div>
          <div className="text-[10px] font-bold uppercase tracking-[0.24em] text-white/75">{title}</div>
          <div className="mt-2 text-xs text-white/50">{isCurrentTeam ? "Your active side" : "Tap to move here"}</div>
        </div>
        <div className="rounded-full border border-white/10 bg-black/20 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.22em] text-white/80">
          {members.length}/{capacity}
        </div>
      </div>
      <div className="space-y-2.5 min-h-[120px]">
        {members.length === 0 && <div className="rounded-2xl border border-dashed border-white/10 bg-black/20 px-4 py-5 text-xs text-esport-text-muted">No players yet</div>}
        {members.map((member) => (
          <div key={member.user_id} className="rounded-2xl border border-white/10 bg-black/25 px-3.5 py-3 flex items-center justify-between gap-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
            <div className="flex min-w-0 items-center gap-2.5">
              <img
                src={getMemberAvatarUrl(member, currentUserId, currentUserAvatarUrl)}
                alt={getMemberDisplayName(member)}
                className="h-9 w-9 rounded-xl border border-white/15 object-cover"
              />
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <div className="truncate text-sm font-bold text-white">{getMemberDisplayName(member)}</div>
                  {member.user_id === leaderId && (
                    <div className="shrink-0 rounded-full border border-amber-300/50 bg-amber-400/20 px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.2em] text-amber-200">
                      Owner
                    </div>
                  )}
                </div>
                <div className={cn(
                  "mt-1 text-[10px] uppercase tracking-[0.2em]",
                  member.is_ready ? "text-emerald-300" : "text-esport-text-muted"
                )}>{member.is_ready ? "Ready" : "Pending"}</div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {onAddFriend && member.user_id !== currentUserId && (() => {
                const relationState = friendActionByUserId?.[member.user_id] || "none";
                const isSending = !!addingFriendIds?.[member.user_id];
                const label = isSending
                  ? "Sending..."
                  : relationState === "friends"
                    ? "Friends"
                    : relationState === "requested"
                      ? "Requested"
                      : "Add Friend";
                const isDisabled = isSending || relationState !== "none";

                return (
                  <span
                    role={isDisabled ? undefined : "button"}
                    tabIndex={isDisabled ? -1 : 0}
                    onClick={(event) => {
                      event.stopPropagation();
                      if (isDisabled) return;
                      void onAddFriend(member.user_id);
                    }}
                    onKeyDown={(event) => {
                      if (isDisabled) return;
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        event.stopPropagation();
                        void onAddFriend(member.user_id);
                      }
                    }}
                    className={cn(
                      "rounded-full border px-2 py-1 text-[10px] uppercase tracking-[0.2em]",
                      isDisabled
                        ? "border-white/15 bg-white/5 text-white/60"
                        : "border-esport-accent/30 bg-esport-accent/10 text-esport-accent"
                    )}
                  >
                    {label}
                  </span>
                );
              })()}
              {canKick && onKick && member.user_id !== currentUserId && (
                <span
                  role="button"
                  tabIndex={0}
                  onClick={(event) => {
                    event.stopPropagation();
                    void onKick(member.user_id);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      event.stopPropagation();
                      void onKick(member.user_id);
                    }
                  }}
                  className="rounded-full border border-esport-danger/40 bg-esport-danger/10 px-2 py-1 text-[10px] uppercase tracking-[0.2em] text-esport-danger"
                >
                  Kick
                </span>
              )}
              {member.user_id === currentUserId && <div className="text-[10px] uppercase tracking-[0.2em] text-white">You</div>}
            </div>
          </div>
        ))}
      </div>
    </button>
  );
}

function MapVetoCard({
  mapCode,
  voteCount,
  selected,
  disabled,
  onVote,
}: {
  mapCode: string;
  voteCount: number;
  selected: boolean;
  disabled: boolean;
  onVote: (mapCode: string) => Promise<void>;
}) {
  return (
    <button
      type="button"
      onClick={() => void onVote(mapCode)}
      disabled={disabled}
      className={cn(
        "group relative h-[200px] w-[165px] shrink-0 snap-start overflow-hidden rounded-2xl border text-left transition-all duration-200",
        selected
          ? "border-esport-accent ring-2 ring-esport-accent shadow-[0_20px_45px_rgba(59,130,246,0.18)]"
          : "border-white/10 hover:-translate-y-1 hover:border-white/30",
        disabled ? "cursor-not-allowed opacity-65" : ""
      )}
      style={{
        backgroundImage: `linear-gradient(180deg, rgba(5,10,20,0.08) 0%, rgba(5,10,20,0.88) 100%), url(${MAP_BACKGROUNDS[mapCode]})`,
        backgroundSize: "cover",
        backgroundPosition: "center",
      }}
    >
      <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/30 to-black/5" />
      <div className="relative flex h-full flex-col justify-between p-4">
        <div className="flex items-start justify-between gap-3">
          <span className="rounded-full border border-white/15 bg-black/35 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.2em] text-white/90">
            Map Pool
          </span>
          {selected && (
            <span className="rounded-full border border-esport-accent/40 bg-esport-accent/15 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.2em] text-esport-accent">
              Your Vote
            </span>
          )}
        </div>

        <div className="space-y-3">
          <div>
            <div className="text-2xl font-display font-bold uppercase tracking-wide text-white">
              {MAP_LABELS[mapCode] || mapCode}
            </div>
            <div className="mt-1 text-[11px] font-bold uppercase tracking-[0.24em] text-white/65">
              {disabled && !selected ? "Waiting for turn" : "Select to veto"}
            </div>
          </div>

          <div className="flex items-center justify-between rounded-xl border border-white/10 bg-black/35 px-3 py-2">
            <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/65">Team clicks</span>
            <span className="text-sm font-bold text-white">{voteCount}</span>
          </div>
        </div>
      </div>
    </button>
  );
}

export function CustomLobbyView({
  addToast,
  openModal,
  user,
  accountMode,
  refreshSession,
  browserOnly = false,
  onLobbyJoined,
  showJoinTransition = false,
  onJoinTransitionDone,
}: {
  addToast: any;
  openModal: any;
  user: any;
  accountMode: AccountMode;
  refreshSession: () => Promise<void>;
  browserOnly?: boolean;
  onLobbyJoined?: () => void;
  showJoinTransition?: boolean;
  onJoinTransitionDone?: () => void;
}) {
  const isKycVerified = user?.kycStatus === "verified" || user?.email?.toLowerCase() === "danielnotexist@gmail.com";
  const requiresKyc = accountMode === "live";
  const initialCachedLobby = readCachedSquadHubLobby(user?.id, accountMode);
  const initialCachedMatch = readCachedSquadHubMatch(user?.id, accountMode);
  const [loading, setLoading] = useState(!initialCachedLobby);
  const [creating, setCreating] = useState(false);
  const [joiningLobbyId, setJoiningLobbyId] = useState<string | null>(null);
  const [activeLobby, setActiveLobby] = useState<MatchmakingLobby | null>(initialCachedLobby);
  const [activeMatch, setActiveMatch] = useState<ActiveMatch | null>(initialCachedMatch);
  const [openLobbies, setOpenLobbies] = useState<MatchmakingLobby[]>([]);
  const [recentMatches, setRecentMatches] = useState<RecentMatchSummary[]>([]);
  const [chatDraft, setChatDraft] = useState("");
  const [selectedWinningSide, setSelectedWinningSide] = useState<"T" | "CT">("T");
  const [selectedWinningRounds, setSelectedWinningRounds] = useState(13);
  const [selectedLosingRounds, setSelectedLosingRounds] = useState(3);
  const [clockTick, setClockTick] = useState(() => Date.now());
  const [matchResultPopup, setMatchResultPopup] = useState<{
    id: number;
    title: string;
    body: string;
    isWinner: boolean;
    amount: number;
    scoreFor?: number;
    scoreAgainst?: number;
  } | null>(null);
  const [showJoiningLobbyState, setShowJoiningLobbyState] = useState(showJoinTransition);
  const [addingFriendIds, setAddingFriendIds] = useState<Record<string, boolean>>({});
  const [friendActionByUserId, setFriendActionByUserId] = useState<Record<string, "none" | "requested" | "friends">>({});
  const [loadedOnce, setLoadedOnce] = useState(!!initialCachedLobby);
  const redirectedLobbyIdRef = useRef<string | null>(null);
  const autoVetoSyncRef = useRef<string | null>(null);
  const mapVoteSyncRef = useRef<string | null>(null);
  const [formState, setFormState] = useState({
    name: "",
    stakeAmount: "5",
    teamSize: 5 as 2 | 5,
    gameMode: "competitive" as SupportedGameMode,
    password: "",
  });

  const loadState = async ({ silent = false }: { silent?: boolean } = {}) => {
    if (!isSupabaseConfigured() || !user?.id) return;
    if (!silent) {
      setLoading(true);
    }
    try {
      const [browserLobbies, myLobby, matches] = await Promise.all([
        fetchOpenMatchmakingLobbies(accountMode as LobbyMode),
        fetchMyActiveLobby(user.id, accountMode as LobbyMode),
        fetchRecentMatches(accountMode as LobbyMode),
      ]);

      setOpenLobbies(browserLobbies.filter((lobby) => lobby.id !== myLobby?.id));
      setActiveLobby(myLobby);
      setRecentMatches(matches);
      setActiveMatch(myLobby ? await fetchMyActiveMatch(myLobby.id) : null);
    } catch (error) {
      console.error("Failed to load lobby state:", error);
      if (!silent) {
        addToast("Failed to load lobby data.", "error");
      }
    } finally {
      if (!silent) {
        setLoading(false);
      }
      setLoadedOnce(true);
    }
  };

  useEffect(() => {
    setShowJoiningLobbyState(showJoinTransition);
  }, [showJoinTransition]);

  useEffect(() => {
    if (!user?.id) {
      setActiveLobby(null);
      setActiveMatch(null);
      setLoading(false);
      setLoadedOnce(false);
      return;
    }

    const cachedLobby = readCachedSquadHubLobby(user.id, accountMode);
    const cachedMatch = readCachedSquadHubMatch(user.id, accountMode);
    setActiveLobby(cachedLobby);
    setActiveMatch(cachedMatch);
    setLoading(!cachedLobby);
    setLoadedOnce(!!cachedLobby);
  }, [user?.id, accountMode]);

  useEffect(() => {
    if (typeof window === "undefined" || !user?.id) {
      return;
    }

    const lobbyKey = getSquadHubLobbyCacheKey(user.id, accountMode);
    const matchKey = getSquadHubMatchCacheKey(user.id, accountMode);

    try {
      if (activeLobby) {
        window.localStorage.setItem(lobbyKey, JSON.stringify(activeLobby));
      } else {
        window.localStorage.removeItem(lobbyKey);
      }

      if (activeMatch) {
        window.localStorage.setItem(matchKey, JSON.stringify(activeMatch));
      } else {
        window.localStorage.removeItem(matchKey);
      }
    } catch (error) {
      console.error("Failed to cache squad hub state:", error);
    }
  }, [activeLobby, activeMatch, accountMode, user?.id]);

  useEffect(() => {
    if (!showJoiningLobbyState) {
      return;
    }

    if (activeLobby) {
      setShowJoiningLobbyState(false);
      onJoinTransitionDone?.();
      return;
    }

    if (loadedOnce && !loading) {
      setShowJoiningLobbyState(false);
      onJoinTransitionDone?.();
    }
  }, [showJoiningLobbyState, activeLobby, loadedOnce, loading, onJoinTransitionDone]);

  useEffect(() => {
    void loadState();
  }, [user?.id, accountMode]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      void loadState({ silent: true });
    }, 1000);
    return () => window.clearInterval(interval);
  }, [user?.id, accountMode]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      setClockTick(Date.now());
    }, 1000);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!user?.id || accountMode !== "demo") {
      setMatchResultPopup(null);
      return;
    }

    let cancelled = false;

    const checkMatchResultPopup = async () => {
      if (cancelled || matchResultPopup) {
        return;
      }

      try {
        const notices = await fetchUnreadDemoMatchResultNotifications(1);
        const nextNotice = notices[0];

        if (!nextNotice || cancelled) {
          return;
        }

        const metadata = (nextNotice.metadata || {}) as Record<string, any>;
        const payoutAmount = Number(metadata.payout_amount ?? 0);
        const safePayoutAmount = Number.isFinite(payoutAmount) ? payoutAmount : 0;
        const amount = Math.abs(safePayoutAmount);
        const isWinner = Boolean(metadata.winner ?? (safePayoutAmount > 0));
        const scoreFor = Number(metadata.score_for ?? 0);
        const scoreAgainst = Number(metadata.score_against ?? 0);

        await markNotificationRead(nextNotice.id);

        if (cancelled) {
          return;
        }

        setMatchResultPopup({
          id: nextNotice.id,
          title: nextNotice.title || (isWinner ? "Congratulations! You won" : "Demo match result"),
          body: nextNotice.body || (isWinner
            ? `Congratulations! you won ${amount.toFixed(2)} USDT`
            : `You lose ${amount.toFixed(2)} USDT staked on this server, better luck next time!`),
          isWinner,
          amount,
          scoreFor: Number.isFinite(scoreFor) ? scoreFor : 0,
          scoreAgainst: Number.isFinite(scoreAgainst) ? scoreAgainst : 0,
        });

        try {
          await refreshSession();
        } catch (refreshError) {
          console.error("Failed to refresh session after match result notification:", refreshError);
        }
      } catch (error) {
        console.error("Failed to check demo match result notification:", error);
      }
    };

    void checkMatchResultPopup();
    const interval = window.setInterval(() => {
      void checkMatchResultPopup();
    }, 1500);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [user?.id, accountMode, refreshSession, matchResultPopup]);

  useEffect(() => {
    setFormState((current) => ({
      ...current,
      stakeAmount: current.stakeAmount || "5",
      gameMode: current.teamSize === 2 ? "wingman" : current.gameMode,
    }));
  }, [accountMode]);

  useEffect(() => {
    if (!browserOnly || !activeLobby?.id) {
      redirectedLobbyIdRef.current = null;
      return;
    }

    if (redirectedLobbyIdRef.current === activeLobby.id) {
      return;
    }

    redirectedLobbyIdRef.current = activeLobby.id;
    onLobbyJoined?.();
  }, [browserOnly, activeLobby?.id, onLobbyJoined]);

  const activeMembers = useMemo(() => getActiveMembers(activeLobby), [activeLobby]);
  const tMembers = activeMembers.filter((member) => member.team_side === "T");
  const ctMembers = activeMembers.filter((member) => member.team_side === "CT");
  const benchMembers = activeMembers.filter((member) => member.team_side === "UNASSIGNED");
  const teamSideByUserId = useMemo(
    () =>
      new Map(
        activeMembers.map((member) => [member.user_id, member.team_side] as const)
      ),
    [activeMembers]
  );
  const myMembership = activeMembers.find((member) => member.user_id === user?.id) || null;
  const isLeader = activeLobby?.leader_id === user?.id;
  const canResolveDemoMatch = accountMode === "demo" && activeMatch?.status === "live" && (isLeader || user?.role === "admin");
  const readyCount = activeMembers.filter((member) => member.is_ready).length;
  const voteSessions = getLobbyVoteSessions(activeLobby);
  const activeVoteSession = voteSessions.find((session) => session.status === "active") || null;
  const myVote = (activeVoteSession?.map_votes || []).find((vote) => vote.user_id === user?.id)?.map_code || null;
  const voteCounts = (activeVoteSession?.map_votes || []).reduce<Record<string, number>>((acc, vote) => {
    acc[vote.map_code] = (acc[vote.map_code] || 0) + 1;
    return acc;
  }, {});
  const canStartVote = !!activeLobby && !activeMatch && !activeLobby.selected_map && tMembers.length === activeLobby.team_size && ctMembers.length === activeLobby.team_size && isLeader;
  const canJoinServer = !!activeMatch && !!activeLobby?.selected_map && !!myMembership && myMembership.team_side !== "UNASSIGNED";
  const hasJoinedServer = !!activeMatch?.match_players?.some((player) => player.user_id === user?.id && player.joined_server);
  const joinedServerCount = (activeMatch?.match_players || []).filter((player) => player.joined_server).length;
  const totalServerPlayers = (activeMatch?.match_players || []).length;
  const isMyVotingTurn = !!activeVoteSession && !!myMembership && myMembership.team_side === activeVoteSession.active_team;
  const countdownLabel = getCountdown(activeVoteSession?.turn_ends_at, clockTick);
  const autoVetoCountdownLabel = getCountdown(activeLobby?.auto_veto_starts_at, clockTick);
  const everyoneReady = activeMembers.length > 0 && readyCount === activeMembers.length;
  const teamsFilled = !!activeLobby && tMembers.length === activeLobby.team_size && ctMembers.length === activeLobby.team_size;
  const shouldShowAutoVetoBar = !!activeLobby && !activeMatch && !activeVoteSession && !activeLobby.selected_map;
  const readyLockActive =
    !!activeLobby &&
    (
      !!activeVoteSession ||
      !!activeLobby.map_voting_active ||
      !!activeLobby.selected_map
    );
  const canKickPlayers = isLeader && activeLobby?.status === "open";
  const lobbyOwnerLabel = useMemo(() => {
    if (!activeLobby) return "-";
    if (activeLobby.leader_id === user?.id) return "You";
    const ownerMember = activeMembers.find((member) => member.user_id === activeLobby.leader_id);
    return ownerMember ? getMemberDisplayName(ownerMember) : `Player ${activeLobby.leader_id.slice(0, 8)}`;
  }, [activeLobby, activeMembers, user?.id]);
  const lobbyOwnerMember = useMemo(
    () => activeMembers.find((member) => member.user_id === activeLobby?.leader_id) || null,
    [activeMembers, activeLobby?.leader_id]
  );
  const lobbyPeerIds = useMemo(
    () =>
      activeMembers
        .map((member) => member.user_id)
        .filter((memberUserId) => !!memberUserId && memberUserId !== user?.id),
    [activeMembers, user?.id]
  );

  useEffect(() => {
    if (
      !activeLobby?.id ||
      !isLeader ||
      !activeLobby.auto_veto_starts_at ||
      !!activeLobby.selected_map ||
      !!activeVoteSession
    ) {
      autoVetoSyncRef.current = null;
      return;
    }

    const countdownKey = `${activeLobby.id}:${activeLobby.auto_veto_starts_at}`;
    if (new Date(activeLobby.auto_veto_starts_at).getTime() > clockTick) {
      autoVetoSyncRef.current = null;
      return;
    }

    if (autoVetoSyncRef.current === countdownKey) {
      return;
    }

    autoVetoSyncRef.current = countdownKey;
    void (async () => {
      try {
        await syncLobbyAutoVeto(activeLobby.id);
        await loadState();
      } catch (error) {
        console.error("Failed to auto-start map veto session:", error);
      }
    })();
  }, [
    activeLobby?.id,
    activeLobby?.auto_veto_starts_at,
    activeLobby?.selected_map,
    activeVoteSession,
    isLeader,
    clockTick,
  ]);

  useEffect(() => {
    if (
      !activeVoteSession?.id ||
      activeVoteSession.status !== "active" ||
      !activeVoteSession.turn_ends_at ||
      !!activeLobby?.selected_map
    ) {
      mapVoteSyncRef.current = null;
      return;
    }

    const countdownKey = `${activeVoteSession.id}:${activeVoteSession.round_number}:${activeVoteSession.turn_ends_at}`;
    if (new Date(activeVoteSession.turn_ends_at).getTime() > clockTick) {
      mapVoteSyncRef.current = null;
      return;
    }

    if (mapVoteSyncRef.current === countdownKey) {
      return;
    }

    mapVoteSyncRef.current = countdownKey;
    void (async () => {
      try {
        await syncMapVoteSession(activeVoteSession.id);
        await loadState({ silent: true });
      } catch (error) {
        console.error("Failed to sync active map vote session:", error);
      }
    })();
  }, [
    activeLobby?.selected_map,
    activeVoteSession?.id,
    activeVoteSession?.round_number,
    activeVoteSession?.status,
    activeVoteSession?.turn_ends_at,
    clockTick,
  ]);

  useEffect(() => {
    const loadFriendActionsForLobby = async () => {
      if (!user?.id || lobbyPeerIds.length === 0) {
        setFriendActionByUserId({});
        return;
      }

      try {
        const [friendsAsOwner, friendsAsPeer, outgoingRequests, incomingRequests] = await Promise.all([
          supabase
            .from("friends")
            .select("friend_id")
            .eq("user_id", user.id)
            .in("friend_id", lobbyPeerIds),
          supabase
            .from("friends")
            .select("user_id")
            .eq("friend_id", user.id)
            .in("user_id", lobbyPeerIds),
          supabase
            .from("friend_requests")
            .select("target_id")
            .eq("requester_id", user.id)
            .eq("status", "pending")
            .in("target_id", lobbyPeerIds),
          supabase
            .from("friend_requests")
            .select("requester_id")
            .eq("target_id", user.id)
            .eq("status", "pending")
            .in("requester_id", lobbyPeerIds),
        ]);

        if (friendsAsOwner.error) throw friendsAsOwner.error;
        if (friendsAsPeer.error) throw friendsAsPeer.error;
        if (outgoingRequests.error) throw outgoingRequests.error;
        if (incomingRequests.error) throw incomingRequests.error;

        const nextState: Record<string, "none" | "requested" | "friends"> = {};
        lobbyPeerIds.forEach((peerId) => {
          nextState[peerId] = "none";
        });

        (outgoingRequests.data || []).forEach((request) => {
          nextState[request.target_id] = "requested";
        });
        (incomingRequests.data || []).forEach((request) => {
          nextState[request.requester_id] = "requested";
        });
        (friendsAsOwner.data || []).forEach((friendship) => {
          nextState[friendship.friend_id] = "friends";
        });
        (friendsAsPeer.data || []).forEach((friendship) => {
          nextState[friendship.user_id] = "friends";
        });

        setFriendActionByUserId(nextState);
      } catch (error) {
        console.error("Failed to load friend action states for lobby members:", error);
      }
    };

    void loadFriendActionsForLobby();
  }, [user?.id, lobbyPeerIds.join("|")]);

  const guardedAction = async (action: () => Promise<void>) => {
    if (requiresKyc && !isKycVerified) {
      addToast("KYC verification is required for live custom lobbies.", "error");
      return;
    }
    await action();
  };

  const handleCreateLobby = async () => {
    await guardedAction(async () => {
      setCreating(true);
      try {
        await createMatchmakingLobby({
          mode: accountMode as LobbyMode,
          kind: "custom",
          name: formState.name || `${accountMode === "demo" ? "Demo" : "Live"} Custom Lobby`,
          teamSize: formState.teamSize,
          gameMode: formState.teamSize === 2 ? "wingman" : formState.gameMode,
          stakeAmount: Number(formState.stakeAmount || 0),
          password: formState.password,
        });
        addToast("Custom lobby created.", "success");
        await loadState();
      } catch (error: any) {
        console.error(error);
        addToast(error?.message || "Failed to create lobby.", "error");
      } finally {
        setCreating(false);
      }
    });
  };

  const handleJoinLobby = async (lobby: MatchmakingLobby) => {
    setJoiningLobbyId(lobby.id);
    try {
      const password = lobby.password_required ? window.prompt("Enter lobby password") || "" : null;
      await joinMatchmakingLobby(lobby.id, password);
      addToast("Joined lobby.", "success");
      onLobbyJoined?.();
      await loadState();
    } catch (error: any) {
      console.error(error);
      addToast(error?.message || "Failed to join lobby.", "error");
    } finally {
      setJoiningLobbyId(null);
    }
  };

  const handleMove = async (side: TeamSide) => {
    if (!activeLobby) return;
    if (myMembership?.team_side === side) return;
    if (myMembership?.is_ready) {
      addToast("You cannot switch teams while READY. Click Unready first.", "error");
      return;
    }
    try {
      await setLobbyMemberTeamSide(activeLobby.id, side);
      await loadState();
    } catch (error: any) {
      console.error(error);
      addToast(error?.message || "Failed to update team side.", "error");
    }
  };

  const handleReadyToggle = async () => {
    if (!activeLobby || !myMembership) return;
    if (myMembership.is_ready && readyLockActive) {
      addToast("Ready is locked once map voting starts.", "error");
      return;
    }
    try {
      await setLobbyMemberReady(activeLobby.id, !myMembership.is_ready);
      await loadState();
    } catch (error: any) {
      console.error(error);
      addToast(error?.message || "Failed to update ready state.", "error");
    }
  };

  const handleSendMessage = async () => {
    if (!activeLobby || !chatDraft.trim()) return;
    try {
      await sendLobbyMessage(activeLobby.id, chatDraft);
      playChatMessageSound();
      setChatDraft("");
      await loadState();
    } catch (error: any) {
      console.error(error);
      addToast(error?.message || "Failed to send lobby chat message.", "error");
    }
  };

  const handleStartVote = async () => {
    if (!activeLobby) return;
    try {
      await ensureLobbyMapVoteSession(activeLobby.id);
      await loadState();
    } catch (error: any) {
      console.error(error);
      addToast(error?.message || "Failed to start map veto.", "error");
    }
  };

  const handleVote = async (mapCode: string) => {
    if (!activeVoteSession) return;
    try {
      await castLobbyMapVote(activeVoteSession.id, mapCode);
      await loadState();
    } catch (error: any) {
      console.error(error);
      addToast(error?.message || "Failed to cast map veto.", "error");
    }
  };

  const handleKickPlayer = async (targetUserId: string) => {
    if (!activeLobby) return;
    try {
      await kickLobbyMember(activeLobby.id, targetUserId);
      await loadState();
      addToast("Player removed from lobby.", "success");
    } catch (error: any) {
      console.error(error);
      addToast(error?.message || "Failed to kick player.", "error");
    }
  };

  const handleAddFriend = async (targetUserId: string) => {
    if (!user?.id || targetUserId === user.id || addingFriendIds[targetUserId]) {
      return;
    }

    setAddingFriendIds((current) => ({ ...current, [targetUserId]: true }));
    try {
      const result = await sendFriendRequest(targetUserId);
      if (result === "already_friends" || result === "friends") {
        setFriendActionByUserId((current) => ({ ...current, [targetUserId]: "friends" }));
        addToast(result === "friends" ? "Friend request matched. You are now friends." : "You are already friends with this player.", "info");
        return;
      }

      setFriendActionByUserId((current) => ({ ...current, [targetUserId]: "requested" }));
      addToast(
        result === "already_requested" ? "Friend request already sent." : "Friend request sent.",
        "success"
      );
    } catch (error: any) {
      console.error(error);
      addToast(error?.message || "Failed to send friend request.", "error");
    } finally {
      setAddingFriendIds((current) => {
        const next = { ...current };
        delete next[targetUserId];
        return next;
      });
    }
  };

  const handleJoinServer = async () => {
    if (!activeMatch) return;
    try {
      const endpoint = await joinMatchServer(activeMatch.id);
      await loadState();
      launchMatchServer(endpoint);
    } catch (error: any) {
      console.error(error);
      addToast(error?.message || "Failed to join server.", "error");
    }
  };

  const handleLeaveLobby = async () => {
    if (!activeLobby) return;
    try {
      await leaveMatchmakingLobby(activeLobby.id);
      setActiveLobby(null);
      setActiveMatch(null);
      setChatDraft("");
      if (typeof window !== "undefined") {
        window.localStorage.removeItem(QUICK_QUEUE_STATE_STORAGE_KEY);
        if (user?.id) {
          window.localStorage.removeItem(getSquadHubLobbyCacheKey(user.id, accountMode));
          window.localStorage.removeItem(getSquadHubMatchCacheKey(user.id, accountMode));
        }
      }
      addToast("Left lobby.", "success");
      await loadState({ silent: true });
      setClockTick(Date.now());
    } catch (error: any) {
      console.error(error);
      addToast(error?.message || "Failed to leave lobby.", "error");
    }
  };

  const handleCompleteDemoMatch = async () => {
    if (!activeMatch) return;
    if (selectedWinningRounds <= selectedLosingRounds) {
      addToast("Winning rounds must be higher than losing rounds.", "error");
      return;
    }
    try {
      await completeDemoMatchForTesting(
        activeMatch.id,
        selectedWinningSide,
        selectedWinningRounds,
        selectedLosingRounds,
      );
      await refreshSession();
      await loadState();
      addToast("Demo match completed.", "success");
    } catch (error: any) {
      console.error(error);
      addToast(error?.message || "Failed to complete demo match.", "error");
    }
  };

  if (requiresKyc && !isKycVerified) {
    return (
      <div className="max-w-5xl mx-auto h-[60vh] flex flex-col items-center justify-center text-center space-y-6">
        <div className="w-24 h-24 bg-esport-danger/10 rounded-full flex items-center justify-center">
          <Lock size={48} className="text-esport-danger" />
        </div>
        <div className="space-y-2">
          <h2 className="text-3xl font-display font-bold uppercase tracking-tight">Battlefield Locked</h2>
          <p className="text-esport-text-muted max-w-md mx-auto">You must complete your KYC verification before you can enter live-stakes matchmaking.</p>
        </div>
        <button onClick={() => openModal("KYC Verification", <KYCForm addToast={addToast} user={user} />)} className="esport-btn-primary px-8 py-4 uppercase tracking-widest text-sm">
          Verify Identity Now
        </button>
      </div>
    );
  }

  if (browserOnly) {
    return (
      <div className="max-w-7xl mx-auto space-y-6">
        <div>
          <h2 className="text-3xl font-display font-bold uppercase tracking-tight">Custom Lobby Browser</h2>
        </div>

        <div className="esport-card overflow-hidden">
          <div className="p-6 border-b border-esport-border">
            <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-esport-accent">
              CS2 {accountMode === "demo" ? "Demo" : "Live"} Server Browser
            </div>
          </div>

          {openLobbies.length === 0 ? (
            <div className="p-10 text-sm text-center text-esport-text-muted">No open custom lobbies right now.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-sm">
                <thead>
                  <tr className="border-b border-esport-border text-left text-[10px] font-bold uppercase tracking-[0.2em] text-esport-text-muted">
                    <th className="px-6 py-4">Lobby</th>
                    <th className="px-6 py-4">Mode</th>
                    <th className="px-6 py-4">Players</th>
                    <th className="px-6 py-4">Stake</th>
                    <th className="px-6 py-4">Access</th>
                    <th className="px-6 py-4 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-esport-border">
                  {openLobbies.map((lobby) => {
                    const count = getActiveMembers(lobby).length;
                    return (
                      <tr key={lobby.id} className="hover:bg-white/5 transition-colors">
                        <td className="px-6 py-4">
                          <div className="font-bold text-white">{lobby.name}</div>
                          <div className="text-[10px] uppercase tracking-[0.18em] text-esport-text-muted mt-1">
                            {formatMode(lobby.game_mode)}
                          </div>
                        </td>
                        <td className="px-6 py-4 text-white">{lobby.team_size}v{lobby.team_size}</td>
                        <td className="px-6 py-4 text-white">{count}/{lobby.max_players}</td>
                        <td className="px-6 py-4 text-white">{Number(lobby.stake_amount).toFixed(2)} USDT</td>
                        <td className="px-6 py-4">
                          {lobby.password_required ? (
                            <span className="badge badge-secondary">Locked</span>
                          ) : (
                            <span className="badge badge-success">Open</span>
                          )}
                        </td>
                        <td className="px-6 py-4 text-right">
                          <button
                            onClick={() => void handleJoinLobby(lobby)}
                            disabled={joiningLobbyId === lobby.id}
                            className="esport-btn-secondary disabled:opacity-50"
                          >
                            {joiningLobbyId === lobby.id ? "Joining..." : "Join"}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div className="rounded-[28px] border border-esport-accent/20 bg-[radial-gradient(circle_at_top_left,rgba(59,130,246,0.16),transparent_32%),linear-gradient(180deg,rgba(17,24,39,0.96),rgba(2,6,23,0.98))] px-6 py-7 shadow-[0_18px_60px_rgba(0,0,0,0.35)]">
        <div className="inline-flex items-center gap-2 rounded-full border border-esport-accent/25 bg-esport-accent/10 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.24em] text-esport-accent">
          <Radio className="h-3.5 w-3.5" />
          Real-time squad control
        </div>
        <h2 className="text-3xl font-display font-bold uppercase tracking-tight">Squad Hub</h2>
        <p className="mt-2 max-w-3xl text-sm text-esport-text-muted">
          Manage your custom lobby, teams, readiness, chat, and match flow from one polished control room.
        </p>
      </div>

      <div className="space-y-6">
          {!activeLobby && showJoiningLobbyState && (
            <div className="esport-card overflow-hidden border-esport-accent/25 bg-[radial-gradient(circle_at_top,rgba(59,130,246,0.15),transparent_45%),linear-gradient(180deg,rgba(17,24,39,0.98),rgba(2,6,23,0.98))] p-7">
              <div className="rounded-3xl border border-esport-accent/30 bg-black/20 p-6 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
                <div className="text-[10px] font-bold uppercase tracking-[0.24em] text-esport-accent">
                  Joining Lobby
                </div>
                <div className="mt-3 flex items-center gap-3">
                  <div className="h-3 w-3 animate-pulse rounded-full bg-esport-accent shadow-[0_0_14px_rgba(59,130,246,0.8)]" />
                  <div className="text-lg font-display font-bold text-white">
                    Connecting you to the custom lobby...
                  </div>
                </div>
                <div className="mt-2 text-sm text-esport-text-muted">
                  Syncing lobby state and team slots in real time.
                </div>
              </div>
            </div>
          )}

          {!activeLobby && !showJoiningLobbyState && (
            <div className="esport-card overflow-hidden border-esport-accent/20 bg-[radial-gradient(circle_at_top_left,rgba(59,130,246,0.14),transparent_34%),linear-gradient(180deg,rgba(17,24,39,0.98),rgba(2,6,23,0.98))] p-6 space-y-5">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-esport-accent">{accountMode === "demo" ? "Demo" : "Live"} Lobby Setup</div>
                  <h3 className="mt-2 text-2xl font-display font-bold uppercase text-white">Build Your Squad Room</h3>
                  <p className="mt-2 max-w-2xl text-sm text-esport-text-muted">
                    Configure the lobby name, stake, format, and access settings before inviting players into your arena.
                  </p>
                </div>
                <div className="grid grid-cols-3 gap-3 text-left">
                  <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3">
                    <div className="text-[10px] uppercase tracking-[0.22em] text-esport-text-muted">Stake</div>
                    <div className="mt-2 text-lg font-bold text-white">{formState.stakeAmount} USDT</div>
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3">
                    <div className="text-[10px] uppercase tracking-[0.22em] text-esport-text-muted">Teams</div>
                    <div className="mt-2 text-lg font-bold text-white">{formState.teamSize}v{formState.teamSize}</div>
                  </div>
                  <div className="rounded-2xl border border-esport-accent/20 bg-esport-accent/[0.08] px-4 py-3">
                    <div className="text-[10px] uppercase tracking-[0.22em] text-esport-text-muted">Mode</div>
                    <div className="mt-2 text-lg font-bold text-esport-accent">{formatMode(formState.gameMode)}</div>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(320px,0.9fr)]">
                <div className="space-y-4">
                  <label className="block rounded-2xl border border-white/10 bg-black/20 p-4">
                    <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-esport-text-muted">Lobby Name</div>
                    <input value={formState.name} onChange={(e) => setFormState((current) => ({ ...current, name: e.target.value }))} className="mt-3 w-full bg-white/5 border border-esport-border rounded-xl px-3 py-3 text-sm focus:outline-none focus:border-esport-accent/60" placeholder="Lobby name" />
                  </label>

                  <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-esport-text-muted">Lobby Format</div>
                        <div className="mt-2 text-sm text-esport-text-muted">
                          Pick the room size and the rule set before players join.
                        </div>
                      </div>
                    </div>
                    <div className="mt-4 grid grid-cols-2 gap-3">
                      {[2, 5].map((size) => {
                        const isActive = formState.teamSize === size;
                        return (
                          <button
                            key={size}
                            type="button"
                            onClick={() =>
                              setFormState((current) => ({
                                ...current,
                                teamSize: size as 2 | 5,
                                gameMode: size === 2 ? "wingman" : "competitive",
                              }))
                            }
                            className={`rounded-2xl border px-4 py-3 text-left transition ${isActive
                              ? "border-esport-accent bg-esport-accent/12 shadow-[0_0_24px_rgba(59,130,246,0.18)]"
                              : "border-white/10 bg-white/[0.03] hover:border-esport-accent/35 hover:bg-esport-accent/[0.05]"
                              }`}
                          >
                            <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-esport-text-muted">Teams</div>
                            <div className={`mt-2 text-xl font-display font-bold ${isActive ? "text-esport-accent" : "text-white"}`}>
                              {size}v{size}
                            </div>
                            <div className="mt-1 text-xs text-esport-text-muted">
                              {size === 2 ? "Fast duels for pairs" : "Full roster competitive room"}
                            </div>
                          </button>
                        );
                      })}
                    </div>

                    <div className="mt-4 grid gap-3 sm:grid-cols-2">
                      {getGameModeOptions(formState.teamSize).map((mode) => {
                        const isActive = formState.gameMode === mode;
                        return (
                          <button
                            key={mode}
                            type="button"
                            onClick={() => setFormState((current) => ({ ...current, gameMode: mode }))}
                            className={`rounded-2xl border px-4 py-3 text-left transition ${isActive
                              ? "border-emerald-400/45 bg-emerald-400/10 shadow-[0_0_18px_rgba(16,185,129,0.15)]"
                              : "border-white/10 bg-white/[0.03] hover:border-emerald-300/30 hover:bg-emerald-400/[0.05]"
                              }`}
                          >
                            <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-esport-text-muted">Mode</div>
                            <div className={`mt-2 text-base font-bold ${isActive ? "text-emerald-300" : "text-white"}`}>
                              {formatMode(mode)}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-esport-text-muted">Entry Stake</div>
                        <div className="mt-2 text-sm text-esport-text-muted">
                          Choose the pool your room will play for.
                        </div>
                      </div>
                      <div className="rounded-full border border-esport-accent/25 bg-esport-accent/10 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.18em] text-esport-accent">
                        {formState.stakeAmount} USDT
                      </div>
                    </div>
                    <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
                      {STAKE_OPTIONS.map((amount) => {
                        const isActive = formState.stakeAmount === amount;
                        return (
                          <button
                            key={amount}
                            type="button"
                            onClick={() => setFormState((current) => ({ ...current, stakeAmount: amount }))}
                            className={`rounded-xl border px-3 py-3 text-left transition ${isActive
                              ? "border-esport-accent bg-esport-accent/12 shadow-[0_0_18px_rgba(59,130,246,0.18)]"
                              : "border-white/10 bg-white/[0.03] hover:border-esport-accent/30 hover:bg-esport-accent/[0.05]"
                              }`}
                          >
                            <div className="text-[9px] font-bold uppercase tracking-[0.22em] text-esport-text-muted">Stake</div>
                            <div className={`mt-1 text-base font-bold ${isActive ? "text-esport-accent" : "text-white"}`}>{amount}</div>
                            <div className="text-[11px] text-esport-text-muted">USDT</div>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                    <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-esport-text-muted">Access Control</div>
                    <input type="password" value={formState.password} onChange={(e) => setFormState((current) => ({ ...current, password: e.target.value }))} className="mt-3 w-full bg-white/5 border border-esport-border rounded-xl px-3 py-3 text-sm focus:outline-none focus:border-esport-accent/60" placeholder="Optional password" />
                    <div className="mt-3 text-xs text-esport-text-muted">
                      Leave blank for an open lobby, or add a password for a private room.
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex justify-center">
                <button onClick={handleCreateLobby} disabled={creating || loading} className="esport-btn-primary min-w-[320px] py-3 disabled:opacity-50 shadow-[0_0_26px_rgba(59,130,246,0.25)]">{creating ? "Creating..." : "Create Custom Lobby"}</button>
              </div>
            </div>
          )}

          {activeLobby && (
            <div className="esport-card overflow-hidden border-esport-accent/20 bg-[radial-gradient(circle_at_top_left,rgba(59,130,246,0.14),transparent_32%),linear-gradient(180deg,rgba(17,24,39,0.98),rgba(2,6,23,0.98))] p-5 space-y-5">
              <div className="flex flex-col lg:flex-row justify-between gap-4">
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-esport-accent">{isLeader ? "My" : "Joined"} {accountMode === "demo" ? "Demo" : "Live"} Custom Lobby</div>
                  <h3 className="text-2xl font-display font-bold uppercase">{activeLobby.name}</h3>
                  <div className="text-xs text-esport-text-muted mt-1">{formatMode(activeLobby.game_mode)} · {activeLobby.team_size}v{activeLobby.team_size} · Stake {Number(activeLobby.stake_amount).toFixed(2)} USDT</div>
                    <div className="mt-2 inline-flex items-center gap-2 rounded-full border border-amber-300/35 bg-amber-400/10 px-2.5 py-1">
                      <img
                        src={lobbyOwnerMember ? getMemberAvatarUrl(lobbyOwnerMember, user?.id, user?.avatarUrl) : `https://ui-avatars.com/api/?name=${encodeURIComponent(lobbyOwnerLabel)}&background=1f2937&color=ffffff&size=64`}
                        alt={lobbyOwnerLabel}
                        className="h-6 w-6 rounded-full border border-amber-200/50 object-cover"
                      />
                    <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-amber-200">Owner</span>
                    <span className="text-sm font-bold text-white">{lobbyOwnerLabel}</span>
                  </div>
                </div>
                <div className="rounded-xl border border-esport-border bg-black/20 px-4 py-3 min-w-[220px]">
                  <div className="text-[10px] uppercase tracking-[0.2em] text-esport-text-muted">Selected map</div>
                  <div className="mt-2 text-lg font-display font-bold text-white">{activeLobby.selected_map ? MAP_LABELS[activeLobby.selected_map] || activeLobby.selected_map : "Pending veto"}</div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]"><div className="text-[10px] uppercase tracking-[0.2em] text-esport-text-muted">Lobby status</div><div className="mt-2 text-sm font-bold text-white">{activeMatch ? activeMatch.status : activeLobby.status}</div></div>
                <div className="rounded-2xl border border-emerald-300/15 bg-emerald-400/[0.05] p-4 shadow-[0_0_25px_rgba(16,185,129,0.06)]"><div className="text-[10px] uppercase tracking-[0.2em] text-esport-text-muted">Ready players</div><div className="mt-2 text-sm font-bold text-esport-success">{readyCount}/{activeMembers.length}</div></div>
                <div className="rounded-2xl border border-esport-accent/20 bg-esport-accent/[0.07] p-4 shadow-[0_0_25px_rgba(59,130,246,0.08)]"><div className="text-[10px] uppercase tracking-[0.2em] text-esport-text-muted">Stake Amount</div><div className="mt-2 text-sm font-bold text-white">{`${Number(activeLobby.stake_amount || 0).toFixed(2)} USDT / player`}</div></div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <TeamBoard title="Terrorists" accentClass="border-[#ff5e7b]/40 bg-[#ff5e7b]/10" members={tMembers} capacity={activeLobby.team_size} currentUserId={user?.id} currentUserAvatarUrl={user?.avatarUrl || null} leaderId={activeLobby.leader_id} teamSide="T" isCurrentTeam={myMembership?.team_side === "T"} onMove={handleMove} canKick={canKickPlayers} onKick={handleKickPlayer} onAddFriend={handleAddFriend} friendActionByUserId={friendActionByUserId} addingFriendIds={addingFriendIds} />
                <TeamBoard title="Counter-Terrorists" accentClass="border-[#30d5ff]/40 bg-[#30d5ff]/10" members={ctMembers} capacity={activeLobby.team_size} currentUserId={user?.id} currentUserAvatarUrl={user?.avatarUrl || null} leaderId={activeLobby.leader_id} teamSide="CT" isCurrentTeam={myMembership?.team_side === "CT"} onMove={handleMove} canKick={canKickPlayers} onKick={handleKickPlayer} onAddFriend={handleAddFriend} friendActionByUserId={friendActionByUserId} addingFriendIds={addingFriendIds} />
              </div>

              <TeamBoard title="Bench / Unassigned" accentClass="border-slate-500/30 bg-slate-500/10" members={benchMembers} capacity={10} currentUserId={user?.id} currentUserAvatarUrl={user?.avatarUrl || null} leaderId={activeLobby.leader_id} teamSide="UNASSIGNED" isCurrentTeam={myMembership?.team_side === "UNASSIGNED"} onMove={handleMove} canKick={canKickPlayers} onKick={handleKickPlayer} onAddFriend={handleAddFriend} friendActionByUserId={friendActionByUserId} addingFriendIds={addingFriendIds} />

              <div className="rounded-[24px] border border-white/10 bg-black/20 p-4">
                <div className="mb-3 text-[10px] uppercase tracking-[0.22em] text-esport-text-muted">Lobby Controls</div>
                <div className="flex flex-wrap gap-2">
                  <button onClick={handleLeaveLobby} className="esport-btn-secondary">{isLeader ? "Close / Leave Lobby" : "Leave Lobby"}</button>
                  <button
                    onClick={handleReadyToggle}
                    disabled={!myMembership || myMembership.team_side === "UNASSIGNED" || (myMembership?.is_ready && readyLockActive)}
                    className="esport-btn-primary disabled:opacity-50"
                  >
                    {myMembership?.is_ready ? (readyLockActive ? "Ready Locked" : "Unready") : "Ready"}
                  </button>
                {shouldShowAutoVetoBar && (
                  <div className={cn(
                    "min-w-[260px] rounded-lg border px-4 py-2.5 text-sm font-bold",
                    activeLobby?.auto_veto_starts_at
                      ? "border-esport-accent/35 bg-esport-accent/10 text-white"
                      : "border-white/10 bg-black/20 text-esport-text-muted"
                  )}>
                    {activeLobby?.auto_veto_starts_at
                      ? `Map Voting starts in ${autoVetoCountdownLabel}`
                      : everyoneReady && teamsFilled
                        ? "Map Voting waiting for countdown sync"
                        : "Map Voting waits for both teams and all players ready"}
                  </div>
                )}
                  {canJoinServer && <button onClick={handleJoinServer} disabled={hasJoinedServer} className="esport-btn-primary disabled:opacity-50">{hasJoinedServer ? "Joined Server" : "Join Server"}</button>}
                </div>
              </div>

              <div className="space-y-4">
                <div className="rounded-[24px] border border-esport-border bg-white/5 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
                  <div className="flex items-center gap-2 mb-3"><MessageSquare className="w-4 h-4 text-esport-accent" /><div className="text-[10px] uppercase tracking-[0.2em] text-esport-text-muted">Lobby chat</div></div>
                  <div className="h-52 rounded-lg border border-white/10 bg-black/20 p-3 overflow-y-auto space-y-2">
                    {(activeLobby.lobby_messages || []).length === 0 && <div className="text-xs text-esport-text-muted">No messages yet.</div>}
                    {(activeLobby.lobby_messages || []).map((message) => (
                      <div key={message.id} className="text-sm">
                        <span className={`font-bold ${getTeamNameColorClass(teamSideByUserId.get(message.user_id))}`}>
                          {message.profiles?.username || "Player"}:
                        </span>{" "}
                        <span className="text-white">{message.message}</span>
                      </div>
                    ))}
                  </div>
                  <div className="mt-3 flex gap-2">
                    <input value={chatDraft} onChange={(e) => setChatDraft(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void handleSendMessage(); } }} className="flex-1 bg-black/30 border border-esport-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-esport-accent/60" placeholder="Type a message..." />
                    <button onClick={handleSendMessage} disabled={!chatDraft.trim()} className="esport-btn-primary disabled:opacity-50">Send</button>
                  </div>
                </div>

                {(activeVoteSession || activeLobby.map_voting_active || activeLobby.auto_veto_starts_at) && (
                  <div className="rounded-[24px] border border-esport-border bg-white/5 p-4 space-y-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
                    <div className="flex items-center justify-between gap-3">
                      <div className="space-y-1">
                        <div className="text-[10px] uppercase tracking-[0.2em] text-esport-text-muted">CS2 map veto</div>
                        {activeVoteSession ? (
                          <div className="text-sm font-bold text-white">
                            {activeVoteSession.active_team} team voting turn <span className="font-mono text-esport-accent">{countdownLabel}</span>
                          </div>
                        ) : activeLobby.auto_veto_starts_at ? (
                          <div className="text-sm font-bold text-white">
                            Map voting starts in <span className="font-mono text-esport-accent">{autoVetoCountdownLabel}</span>
                          </div>
                        ) : (
                          <div className="text-sm font-bold text-esport-text-muted">Waiting for map voting session...</div>
                        )}
                      </div>
                      {activeVoteSession && (
                        <div className={cn(
                          "rounded-full border px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.2em]",
                          isMyVotingTurn
                            ? "border-esport-accent/40 bg-esport-accent/10 text-esport-accent"
                            : "border-white/10 bg-black/20 text-esport-text-muted"
                        )}>
                          {isMyVotingTurn ? "Your team can vote" : "Opposing team locked"}
                        </div>
                      )}
                    </div>

                    {activeVoteSession ? (
                      <>
                        <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                          <div className="flex items-center gap-2">
                            <Clock3 className="w-4 h-4 text-esport-accent" />
                            <div className="text-xs uppercase tracking-[0.2em] text-esport-text-muted">
                              Round {activeVoteSession.round_number} · {activeVoteSession.active_team} team veto window
                            </div>
                          </div>
                          <div className="flex flex-wrap items-center gap-3">
                            {activeVoteSession.last_vetoed_map && (
                              <div className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.18em] text-white/80">
                                Last veto: {MAP_LABELS[activeVoteSession.last_vetoed_map] || activeVoteSession.last_vetoed_map}
                              </div>
                            )}
                            <div className="rounded-full border border-esport-accent/30 bg-esport-accent/10 px-3 py-1.5 font-mono text-sm font-bold text-white">
                              {countdownLabel}
                            </div>
                          </div>
                        </div>

                        <div className="overflow-x-auto custom-scrollbar pb-2">
                          <div className="flex min-w-max gap-3 snap-x snap-mandatory">
                            {activeVoteSession.remaining_maps.map((mapCode) => (
                              <div key={mapCode}>
                                <MapVetoCard
                                  mapCode={mapCode}
                                  voteCount={voteCounts[mapCode] || 0}
                                  selected={myVote === mapCode}
                                  disabled={!isMyVotingTurn}
                                  onVote={handleVote}
                                />
                              </div>
                            ))}
                          </div>
                        </div>
                      </>
                    ) : (
                      <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-5 text-sm text-esport-text-muted">
                        Map voting will appear here automatically as soon as the countdown completes.
                      </div>
                    )}
                  </div>
                )}
              </div>

              {activeMatch && (
                <div className="rounded-[24px] border border-esport-secondary/30 bg-esport-secondary/10 p-4 flex flex-col lg:flex-row gap-4 lg:items-center lg:justify-between shadow-[0_0_30px_rgba(59,130,246,0.08)]">
                  <div>
                    <div className="text-[10px] uppercase tracking-[0.2em] text-esport-text-muted">CS2 dedicated server state</div>
                    <div className="mt-2 text-lg font-bold text-white">{activeMatch.status === "pending" ? "CS2 server staged · waiting for player joins" : "CS2 match live · Lobby removed from browser"}</div>
                    <div className="text-xs text-esport-text-muted mt-1">
                      {activeMatch.status === "pending"
                        ? `${joinedServerCount}/${totalServerPlayers} players joined the server. Once everyone joins, the server session becomes live.`
                        : "Reconnect remains available from the header until the match ends."}
                    </div>
                  </div>
                  <div className="flex flex-col sm:flex-row gap-2">
                    {canJoinServer && <button onClick={handleJoinServer} disabled={hasJoinedServer} className="esport-btn-primary disabled:opacity-50">{hasJoinedServer ? "Joined Server" : "Join Server"}</button>}
                    {canResolveDemoMatch && (
                      <>
                        <select
                          value={selectedWinningSide}
                          onChange={(e) => setSelectedWinningSide(e.target.value as "T" | "CT")}
                          className="bg-black/30 border border-esport-border rounded-lg px-3 py-2 text-sm"
                        >
                          <option value="T">Team T wins</option>
                          <option value="CT">Team CT wins</option>
                        </select>
                        <div className="flex items-center gap-2 rounded-lg border border-esport-border bg-black/20 px-3 py-2">
                          <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-esport-text-muted">Score</span>
                          <input
                            type="number"
                            min={1}
                            max={16}
                            value={selectedWinningRounds}
                            onChange={(e) => setSelectedWinningRounds(Math.max(1, Number(e.target.value || 13)))}
                            className="w-14 bg-transparent text-sm text-white outline-none"
                          />
                          <span className="text-esport-text-muted">-</span>
                          <input
                            type="number"
                            min={0}
                            max={15}
                            value={selectedLosingRounds}
                            onChange={(e) => setSelectedLosingRounds(Math.max(0, Number(e.target.value || 0)))}
                            className="w-14 bg-transparent text-sm text-white outline-none"
                          />
                        </div>
                        <button onClick={handleCompleteDemoMatch} className="esport-btn-primary">Complete Demo Match</button>
                      </>
                    )}
                    {accountMode === "demo" && activeMatch.status === "live" && !canResolveDemoMatch && (
                      <div className="rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-xs text-esport-text-muted">
                        Waiting for lobby organiser to complete the match.
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="esport-card border-white/10 bg-[linear-gradient(180deg,rgba(17,24,39,0.94),rgba(2,6,23,0.96))] p-5 shadow-[0_18px_60px_rgba(0,0,0,0.24)]">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2"><Server className="w-4 h-4 text-esport-accent" /><div className="text-[10px] uppercase tracking-[0.2em] text-esport-text-muted">Recent matches</div></div>
              <div className="rounded-full border border-white/10 bg-black/20 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.2em] text-white/75">
                {recentMatches.length} results
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="text-left text-[10px] uppercase tracking-[0.2em] text-esport-text-muted"><th className="pb-3">Lobby</th><th className="pb-3">Mode</th><th className="pb-3">Map</th><th className="pb-3">Score</th><th className="pb-3">Stake</th></tr></thead>
                <tbody>
                  {recentMatches.length === 0 && <tr><td colSpan={5} className="py-6 text-esport-text-muted">No finished matches yet.</td></tr>}
                  {recentMatches.map((match) => <tr key={match.id} className="border-t border-white/5 hover:bg-white/[0.03] transition-colors"><td className="py-3"><div className="font-bold text-white">{match.name}</div><div className="text-xs text-esport-text-muted">{match.winningSide === "DRAW" ? "Draw" : `Winner: ${match.winningSide}`}</div></td><td className="py-3 text-white">{formatMode(match.gameMode)}</td><td className="py-3 text-white">{MAP_LABELS[match.selectedMap] || match.selectedMap}</td><td className="py-3 text-white">{match.winningScore} - {match.losingScore}</td><td className="py-3 text-white">{match.stakeAmount.toFixed(2)} USDT</td></tr>)}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <AnimatePresence>
          {matchResultPopup && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[120] flex items-center justify-center bg-black/75 backdrop-blur-sm p-4"
            >
              <motion.div
                initial={{ scale: 0.9, y: 14, opacity: 0 }}
                animate={{ scale: 1, y: 0, opacity: 1 }}
                exit={{ scale: 0.94, y: 8, opacity: 0 }}
                transition={{ duration: 0.25 }}
                className={cn(
                  "w-full max-w-xl rounded-2xl border p-7 text-center shadow-[0_28px_70px_rgba(0,0,0,0.45)]",
                  matchResultPopup.isWinner
                    ? "border-emerald-300/35 bg-[radial-gradient(circle_at_top,rgba(16,185,129,0.32),rgba(15,23,42,0.95)_56%)]"
                    : "border-rose-300/35 bg-[radial-gradient(circle_at_top,rgba(244,63,94,0.28),rgba(15,23,42,0.95)_56%)]"
                )}
              >
                <div className="text-[11px] uppercase tracking-[0.26em] text-white/70">
                  Match Result
                </div>
                <h3 className="mt-3 text-3xl font-display font-bold text-white">
                  {matchResultPopup.isWinner ? "VICTORY" : "DEFEAT"}
                </h3>
                <p className="mt-4 text-lg font-bold text-white">{matchResultPopup.body}</p>
                <p className="mt-2 text-sm text-white/80">
                  Stake settled: {matchResultPopup.amount.toFixed(2)} USDT
                </p>
                {typeof matchResultPopup.scoreFor === "number" && typeof matchResultPopup.scoreAgainst === "number" && (
                  <p className="mt-2 text-sm font-bold uppercase tracking-[0.18em] text-white/75">
                    Final score {matchResultPopup.scoreFor} - {matchResultPopup.scoreAgainst}
                  </p>
                )}
                <div className="mt-6 flex justify-end">
                  <button
                    type="button"
                    onClick={() => setMatchResultPopup(null)}
                    className="esport-btn-primary px-8 py-2.5"
                  >
                    Continue
                  </button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
    </div>
  );
}

export function CustomLobbyBrowserView(props: {
  addToast: any;
  openModal: any;
  user: any;
  accountMode: AccountMode;
  refreshSession: () => Promise<void>;
  onLobbyJoined?: () => void;
}) {
  return <CustomLobbyView {...props} browserOnly />;
}
