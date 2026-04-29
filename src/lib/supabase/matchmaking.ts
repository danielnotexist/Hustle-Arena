import { isSupabaseTransientNetworkError, supabase } from "../supabase";
import { hasPlatformApiSession, platformFetch } from "../api";

export type LobbyMode = "demo" | "live";
export type LobbyKind = "public" | "custom";
export type TeamSide = "T" | "CT" | "UNASSIGNED";
export type MatchStatus = "pending" | "live" | "finished" | "interrupted" | "cancelled";
export type SupportedGameMode = "wingman" | "competitive" | "team_ffa" | "ffa";

let quickQueueRpcSupportsGameMode: boolean | null = null;
let quickQueueStatusRpcSupported: boolean | null = null;
let recentMatchesSchemaSupportsScores: boolean | null = null;
let browserLobbiesRpcSupported: boolean | null = null;
let squadHubStateRpcSupported: boolean | null = null;
let activeLobbySummaryRpcSupported: boolean | null = null;

function isMissingMatchScoreSchema(error: any) {
  const message = String(error?.message || "");
  return (
    error?.code === "42703" &&
    (
      message.includes("matches.winning_side") ||
      message.includes("matches.score_t") ||
      message.includes("matches.score_ct")
    )
  );
}

function isMissingRpcFunction(error: any, rpcName: string) {
  const message = String(error?.message || "");
  const details = String(error?.details || "");
  const hint = String(error?.hint || "");

  return (
    error?.code === "PGRST202" ||
    message.includes(rpcName) ||
    details.includes(rpcName) ||
    hint.includes(rpcName)
  );
}

export interface MatchmakingLobbyMember {
  user_id: string;
  team_side: TeamSide;
  is_ready: boolean;
  joined_at: string;
  left_at?: string | null;
  kicked_at?: string | null;
  profiles?: {
    username?: string;
    email?: string;
    avatar_url?: string | null;
  } | null;
}

export interface LobbyMessage {
  id: number;
  user_id: string;
  message: string;
  created_at: string;
  profiles?: {
    username?: string;
  } | null;
}

export interface MapVote {
  user_id: string;
  map_code: string;
  updated_at: string;
}

export interface MapVoteSession {
  id: string;
  lobby_id: string;
  active_team: "T" | "CT";
  turn_ends_at: string | null;
  turn_seconds: number;
  remaining_maps: string[];
  status: "active" | "completed" | "cancelled";
  round_number: number;
  last_vetoed_map?: string | null;
  updated_at?: string | null;
  map_votes?: MapVote[];
}

export interface MatchmakingBrowserCursor {
  createdAt: string;
  lobbyId: string;
}

export interface ActiveLobbySummary {
  id: string;
  mode: LobbyMode;
  kind: LobbyKind;
  status: "open" | "in_progress" | "closed";
  team_size: number;
  game_mode?: SupportedGameMode | null;
  created_at: string;
}

export interface MatchmakingLobbyBrowserSummary {
  id: string;
  mode: LobbyMode;
  kind: LobbyKind;
  name: string;
  leader_id: string;
  leader_username?: string | null;
  leader_avatar_url?: string | null;
  status: "open" | "in_progress" | "closed";
  stake_amount: number;
  team_size: number;
  max_players: number;
  game_mode?: SupportedGameMode | null;
  password_required: boolean;
  selected_map?: string | null;
  map_voting_active?: boolean;
  auto_veto_starts_at?: string | null;
  join_server_deadline?: string | null;
  created_at: string;
  player_count: number;
  ready_count: number;
  t_count: number;
  ct_count: number;
}

export interface MatchmakingLobby {
  id: string;
  mode: LobbyMode;
  kind: LobbyKind;
  name: string;
  leader_id: string;
  status: "open" | "in_progress" | "closed";
  stake_amount: number;
  team_size: number;
  max_players: number;
  game_mode?: SupportedGameMode | null;
  password_required: boolean;
  selected_map?: string | null;
  map_voting_active?: boolean;
  auto_veto_starts_at?: string | null;
  join_server_deadline?: string | null;
  created_at: string;
  lobby_members?: MatchmakingLobbyMember[];
  lobby_messages?: LobbyMessage[];
  map_vote_sessions?: MapVoteSession[] | null;
}

export interface ActiveMatch {
  id: string;
  lobby_id: string;
  mode: LobbyMode;
  status: MatchStatus;
  server_status?: string | null;
  dedicated_server_endpoint?: string | null;
  started_at?: string | null;
  ended_at?: string | null;
  match_players?: Array<{
    user_id: string;
    steam_id64?: string | null;
    steam_verified?: boolean | null;
    team_side: TeamSide;
    joined_server?: boolean | null;
    is_winner?: boolean | null;
    round_score?: number | null;
    kills?: number | null;
    deaths?: number | null;
    assists?: number | null;
    payout_amount?: number | null;
    profiles?: {
      username?: string;
    } | null;
  }>;
}

export interface RecentMatchSummary {
  id: string;
  mode: LobbyMode;
  name: string;
  gameMode: string;
  selectedMap: string;
  stakeAmount: number;
  status: MatchStatus;
  startedAt?: string | null;
  endedAt?: string | null;
  winningSide: "T" | "CT" | "DRAW";
  winningScore: number;
  losingScore: number;
}

export interface UserMatchHistoryItem extends RecentMatchSummary {
  userId: string;
  teamSide: TeamSide;
  isWinner: boolean;
  payoutAmount: number;
}

export interface ReconnectableMatch {
  match_id: string;
  lobby_id: string;
  mode: LobbyMode;
  lobby_name: string;
  game_mode: string | null;
  selected_map: string | null;
  status: MatchStatus;
  dedicated_server_endpoint: string | null;
}

export interface MatchResultNotification {
  id: number;
  title: string;
  body: string;
  metadata?: Record<string, any> | null;
  created_at: string;
}

export interface QuickQueueStatus {
  status: "searching" | "ready_check" | "matched";
  lobby_id: string | null;
  players_joined: number;
  players_needed: number;
  estimated_wait_seconds: number;
  ready_check_id?: string | null;
  accepted_count?: number;
  participant_user_ids?: string[];
  accepted_user_ids?: string[];
}

export interface MyQuickQueueStatus extends QuickQueueStatus {
  team_size: 2 | 5;
  queue_mode: "solo" | "party";
  stake_amount: number;
  game_mode: SupportedGameMode | null;
}

export interface QuickQueuePartyInvite {
  id: number;
  host_user_id: string;
  invitee_user_id: string;
  mode: LobbyMode;
  team_size: 2 | 5;
  stake_amount: number;
  status: "pending" | "accepted" | "declined" | "cancelled" | "expired";
  created_at: string;
  updated_at: string;
  responded_at?: string | null;
}

export interface QuickQueuePartyStakeUpdate {
  id: number;
  host_user_id: string;
  invitee_user_id: string;
  mode: LobbyMode;
  team_size: 2 | 5;
  previous_stake_amount: number;
  new_stake_amount: number;
  status: "pending" | "accepted" | "declined" | "cancelled";
  created_at: string;
  updated_at: string;
  responded_at?: string | null;
}

export interface MatchServerBootstrap {
  game: "counter-strike-2";
  gameKey: "cs2";
  matchId: string;
  lobbyId: string;
  lobbyName: string;
  environment: LobbyMode;
  playlist: SupportedGameMode | string;
  selectedMap: string | null;
  teamSize: number;
  maxPlayers: number;
  stakeAmountUsdt: number;
  passwordRequired: boolean;
  serverPassword: string | null;
  launchPolicy: {
    waitForAllPlayers: boolean;
    autoCloseOnMatchEnd: boolean;
    allowReconnect: boolean;
  };
  telemetry: {
    ingestRoundStats: boolean;
    ingestPlayerStats: boolean;
    ingestMatchOutcome: boolean;
  };
}

interface PublicProfileBasic {
  id: string;
  username: string | null;
  email: string | null;
  avatar_url?: string | null;
}

function normalizeLobby(rawLobby: any): MatchmakingLobby | null {
  if (!rawLobby) {
    return null;
  }

  return {
    ...rawLobby,
    lobby_members: Array.isArray(rawLobby.lobby_members)
      ? rawLobby.lobby_members
      : rawLobby.lobby_members
        ? [rawLobby.lobby_members]
        : [],
    lobby_messages: Array.isArray(rawLobby.lobby_messages)
      ? rawLobby.lobby_messages
      : rawLobby.lobby_messages
        ? [rawLobby.lobby_messages]
        : [],
    map_vote_sessions: Array.isArray(rawLobby.map_vote_sessions)
      ? rawLobby.map_vote_sessions
      : rawLobby.map_vote_sessions
        ? [rawLobby.map_vote_sessions]
        : [],
  } satisfies MatchmakingLobby;
}

function normalizeActiveMatch(rawMatch: any): ActiveMatch | null {
  if (!rawMatch) {
    return null;
  }

  return {
    ...rawMatch,
    match_players: Array.isArray(rawMatch.match_players)
      ? rawMatch.match_players
      : rawMatch.match_players
        ? [rawMatch.match_players]
        : [],
  } satisfies ActiveMatch;
}

const OPEN_LOBBY_SELECT = `
  id,
  mode,
  kind,
  name,
  leader_id,
  status,
  stake_amount,
  team_size,
  max_players,
  game_mode,
  password_required,
  selected_map,
  map_voting_active,
  auto_veto_starts_at,
  join_server_deadline,
  created_at,
  lobby_members(user_id, team_side, is_ready, joined_at, left_at, kicked_at, profiles:user_id(username,email,avatar_url))
`;

const ACTIVE_LOBBY_SELECT = `
  id,
  mode,
  kind,
  name,
  leader_id,
  status,
  stake_amount,
  team_size,
  max_players,
  game_mode,
  password_required,
  selected_map,
  map_voting_active,
  auto_veto_starts_at,
  join_server_deadline,
  created_at,
  lobby_members(user_id, team_side, is_ready, joined_at, left_at, kicked_at, profiles:user_id(username,email,avatar_url)),
  lobby_messages(id, user_id, message, created_at, profiles:user_id(username)),
  map_vote_sessions(id, lobby_id, active_team, turn_ends_at, turn_seconds, remaining_maps, status, round_number, last_vetoed_map, updated_at, map_votes(user_id, map_code, updated_at))
`;

const OPEN_LOBBY_BROWSER_FALLBACK_SELECT = `
  id,
  mode,
  kind,
  name,
  leader_id,
  status,
  stake_amount,
  team_size,
  max_players,
  game_mode,
  password_required,
  selected_map,
  map_voting_active,
  auto_veto_starts_at,
  join_server_deadline,
  created_at,
  lobby_members(user_id, team_side, is_ready, joined_at, left_at, kicked_at)
`;

async function getAuthenticatedUserId() {
  const { data, error } = await supabase.auth.getUser();
  if (error) {
    throw error;
  }

  return data.user?.id || null;
}

function isBeforeCursor(
  lobby: { created_at: string; id: string },
  cursor?: MatchmakingBrowserCursor | null
) {
  if (!cursor) {
    return true;
  }

  if (lobby.created_at < cursor.createdAt) {
    return true;
  }

  return lobby.created_at === cursor.createdAt && lobby.id < cursor.lobbyId;
}

async function fetchOpenMatchmakingLobbiesFallback({
  mode,
  limit,
  search,
  cursor,
}: {
  mode: LobbyMode;
  limit: number;
  search?: string;
  cursor?: MatchmakingBrowserCursor | null;
}) {
  const fetchLimit = Math.min(Math.max(limit, 1), 50);

  let query = supabase
    .from("lobbies")
    .select(OPEN_LOBBY_BROWSER_FALLBACK_SELECT)
    .eq("mode", mode)
    .eq("kind", "custom")
    .eq("status", "open")
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(Math.max(fetchLimit + 12, 64));

  if (search?.trim()) {
    query = query.ilike("name", `%${search.trim()}%`);
  }

  const { data, error } = await query;
  if (error) {
    throw error;
  }

  const filteredRows = ((data || []) as Array<any>).filter((row) => isBeforeCursor(row, cursor));
  const rows = filteredRows.slice(0, fetchLimit + 1);
  const hasMore = rows.length > fetchLimit;
  const lobbies = rows.slice(0, fetchLimit);
  const leaderProfiles = await fetchPublicProfileBasics(lobbies.map((lobby) => lobby.leader_id));
  const summaries = lobbies.map((lobby) => {
    const activeMembers = (Array.isArray(lobby.lobby_members) ? lobby.lobby_members : []).filter(
      (member) => !member.left_at && !member.kicked_at
    );
    const leaderProfile = leaderProfiles.get(lobby.leader_id);

    return {
      id: lobby.id,
      mode: lobby.mode,
      kind: lobby.kind,
      name: lobby.name,
      leader_id: lobby.leader_id,
      leader_username: leaderProfile?.username || leaderProfile?.email?.split("@")[0] || null,
      leader_avatar_url: leaderProfile?.avatar_url || null,
      status: lobby.status,
      stake_amount: Number(lobby.stake_amount || 0),
      team_size: Number(lobby.team_size || 0),
      max_players: Number(lobby.max_players || 0),
      game_mode: lobby.game_mode || null,
      password_required: Boolean(lobby.password_required),
      selected_map: lobby.selected_map || null,
      map_voting_active: Boolean(lobby.map_voting_active),
      auto_veto_starts_at: lobby.auto_veto_starts_at || null,
      join_server_deadline: lobby.join_server_deadline || null,
      created_at: lobby.created_at,
      player_count: activeMembers.length,
      ready_count: activeMembers.filter((member) => member.is_ready).length,
      t_count: activeMembers.filter((member) => member.team_side === "T").length,
      ct_count: activeMembers.filter((member) => member.team_side === "CT").length,
    } satisfies MatchmakingLobbyBrowserSummary;
  });

  const lastLobby = summaries[summaries.length - 1] || null;

  return {
    lobbies: summaries,
    hasMore,
    nextCursor: lastLobby
      ? {
          createdAt: lastLobby.created_at,
          lobbyId: lastLobby.id,
        }
      : null,
  };
}

async function fetchMyActiveLobbySummaryFallback(mode: LobbyMode) {
  const userId = await getAuthenticatedUserId();
  if (!userId) {
    return null;
  }

  const lobby = await fetchMyActiveLobby(userId, mode);
  if (!lobby) {
    return null;
  }

  return {
    id: lobby.id,
    mode: lobby.mode,
    kind: lobby.kind,
    status: lobby.status,
    team_size: lobby.team_size,
    game_mode: lobby.game_mode || null,
    created_at: lobby.created_at,
  } satisfies ActiveLobbySummary;
}

async function fetchMyQuickQueueStatusFallback(mode: LobbyMode) {
  const userId = await getAuthenticatedUserId();
  if (!userId) {
    return null;
  }

  const { data: readyCheckMemberships, error: readyCheckMembershipsError } = await supabase
    .from("quick_queue_ready_check_members")
    .select("ready_check_id")
    .eq("user_id", userId);

  if (readyCheckMembershipsError) {
    throw readyCheckMembershipsError;
  }

  const readyCheckIds = Array.from(
    new Set(((readyCheckMemberships || []) as Array<{ ready_check_id?: string | null }>).map((row) => row.ready_check_id).filter(Boolean))
  ) as string[];

  if (readyCheckIds.length) {
    const { data: readyChecks, error: readyChecksError } = await supabase
      .from("quick_queue_ready_checks")
      .select("id, mode, status, team_size, queue_mode, stake_amount, game_mode, expires_at, created_at")
      .eq("mode", mode)
      .eq("status", "pending")
      .in("id", readyCheckIds)
      .order("created_at", { ascending: false })
      .limit(1);

    if (readyChecksError) {
      throw readyChecksError;
    }

    const readyCheck = Array.isArray(readyChecks) ? readyChecks[0] : null;
    if (readyCheck?.id) {
      const { data: readyCheckMembers, error: readyCheckMembersError } = await supabase
        .from("quick_queue_ready_check_members")
        .select("user_id, accepted_at, created_at")
        .eq("ready_check_id", readyCheck.id)
        .order("created_at", { ascending: true });

      if (readyCheckMembersError) {
        throw readyCheckMembersError;
      }

      const participantUserIds = ((readyCheckMembers || []) as Array<{ user_id: string; accepted_at?: string | null }>)
        .map((row) => row.user_id)
        .filter(Boolean);
      const acceptedUserIds = ((readyCheckMembers || []) as Array<{ user_id: string; accepted_at?: string | null }>)
        .filter((row) => !!row.accepted_at)
        .map((row) => row.user_id);
      const teamSize = Number(readyCheck.team_size || 0) as 2 | 5;

      return {
        status: "ready_check",
        lobby_id: null,
        players_joined: acceptedUserIds.length,
        players_needed: Math.max(teamSize * 2 - acceptedUserIds.length, 0),
        estimated_wait_seconds: Math.max(
          0,
          Math.floor((new Date(String(readyCheck.expires_at || new Date().toISOString())).getTime() - Date.now()) / 1000)
        ),
        ready_check_id: readyCheck.id,
        accepted_count: acceptedUserIds.length,
        participant_user_ids: participantUserIds,
        accepted_user_ids: acceptedUserIds,
        team_size: teamSize,
        queue_mode: readyCheck.queue_mode === "party" ? "party" : "solo",
        stake_amount: Number(readyCheck.stake_amount || 0),
        game_mode: (readyCheck.game_mode || (teamSize === 2 ? "wingman" : "competitive")) as SupportedGameMode,
      } satisfies MyQuickQueueStatus;
    }
  }

  const { data: entryRows, error: entryRowsError } = await supabase
    .from("quick_queue_entries")
    .select("status, matched_lobby_id, team_size, queue_mode, selected_stake_amount, game_mode, updated_at")
    .eq("user_id", userId)
    .eq("mode", mode)
    .in("status", ["searching", "matched"])
    .order("updated_at", { ascending: false })
    .limit(1);

  if (entryRowsError) {
    throw entryRowsError;
  }

  const entry = Array.isArray(entryRows) ? entryRows[0] : null;
  if (!entry) {
    return null;
  }

  let partySize = 1;
  if (entry.queue_mode === "party") {
    let partyHostUserId = userId;
    const stakeAmount = Number(entry.selected_stake_amount || 0);

    const { data: guestPartyRows, error: guestPartyRowsError } = await supabase
      .from("quick_queue_party_invites")
      .select("host_user_id")
      .eq("invitee_user_id", userId)
      .eq("mode", mode)
      .eq("team_size", entry.team_size)
      .eq("stake_amount", stakeAmount)
      .eq("status", "accepted")
      .order("updated_at", { ascending: false })
      .limit(1);

    if (guestPartyRowsError) {
      throw guestPartyRowsError;
    }

    if (Array.isArray(guestPartyRows) && guestPartyRows[0]?.host_user_id) {
      partyHostUserId = guestPartyRows[0].host_user_id;
    }

    const { data: acceptedInviteRows, error: acceptedInviteRowsError } = await supabase
      .from("quick_queue_party_invites")
      .select("invitee_user_id")
      .eq("host_user_id", partyHostUserId)
      .eq("mode", mode)
      .eq("team_size", entry.team_size)
      .eq("stake_amount", stakeAmount)
      .eq("status", "accepted");

    if (acceptedInviteRowsError) {
      throw acceptedInviteRowsError;
    }

    const partyIds = new Set<string>([partyHostUserId]);
    ((acceptedInviteRows || []) as Array<{ invitee_user_id?: string | null }>).forEach((row) => {
      if (row.invitee_user_id) {
        partyIds.add(row.invitee_user_id);
      }
    });
    partySize = Math.max(partyIds.size, 1);
  }

  const matchedLobbyId = entry.matched_lobby_id || null;
  if (entry.status === "matched" && matchedLobbyId) {
    const activeLobby = await fetchMyActiveLobby(userId, mode);
    if (!activeLobby || activeLobby.id !== matchedLobbyId) {
      return null;
    }
  }

  const teamSize = Number(entry.team_size || 0) as 2 | 5;
  return {
    status: entry.status as "searching" | "matched",
    lobby_id: matchedLobbyId,
    players_joined: partySize,
    players_needed: Math.max(teamSize * 2 - partySize, 0),
    estimated_wait_seconds: 8,
    ready_check_id: null,
    accepted_count: 0,
    participant_user_ids: [],
    accepted_user_ids: [],
    team_size: teamSize,
    queue_mode: entry.queue_mode === "party" ? "party" : "solo",
    stake_amount: Number(entry.selected_stake_amount || 0),
    game_mode: (entry.game_mode || (teamSize === 2 ? "wingman" : "competitive")) as SupportedGameMode,
  } satisfies MyQuickQueueStatus;
}

async function fetchMySquadHubStateFallback(mode: LobbyMode) {
  const userId = await getAuthenticatedUserId();
  if (!userId) {
    return {
      lobby: null,
      match: null,
    };
  }

  const lobby = await fetchMyActiveLobby(userId, mode);
  const match = lobby ? await fetchMyActiveMatch(lobby.id) : null;

  return {
    lobby,
    match,
  };
}

async function fetchPublicProfileBasics(userIds: string[]) {
  const uniqueUserIds = Array.from(new Set(userIds.filter(Boolean)));
  if (!uniqueUserIds.length) {
    return new Map<string, PublicProfileBasic>();
  }

  const executeFetch = async () =>
    supabase.rpc("get_public_profile_basics", {
      p_user_ids: uniqueUserIds,
    });

  let { data, error } = await executeFetch();

  const isTransientGatewayFailure =
    !!error &&
    (
      String(error?.message || "").includes("NetworkError when attempting to fetch resource") ||
      String(error?.message || "").includes("Failed to fetch") ||
      String(error?.details || "").includes("NetworkError when attempting to fetch resource") ||
      String(error?.code || "") === "502"
    );

  if (isTransientGatewayFailure) {
    const retry = await executeFetch();
    data = retry.data;
    error = retry.error;
  }

  if (error) {
    if (isTransientGatewayFailure) {
      return new Map<string, PublicProfileBasic>();
    }
    throw error;
  }

  return new Map(
    ((data || []) as PublicProfileBasic[]).map((profile) => [
      profile.id,
      {
        id: profile.id,
        username: profile.username,
        email: profile.email,
        avatar_url: profile.avatar_url || null,
      },
    ])
  );
}

function enrichLobbyProfiles(lobby: MatchmakingLobby | null, profilesById: Map<string, PublicProfileBasic>) {
  if (!lobby) {
    return lobby;
  }

  return {
    ...lobby,
    lobby_members: (lobby.lobby_members || []).map((member) => ({
      ...member,
      profiles: profilesById.get(member.user_id)
        ? {
            username: profilesById.get(member.user_id)?.username || undefined,
            email: profilesById.get(member.user_id)?.email || undefined,
            avatar_url: profilesById.get(member.user_id)?.avatar_url || null,
          }
        : member.profiles || null,
    })),
    lobby_messages: (lobby.lobby_messages || []).map((message) => ({
      ...message,
      profiles: profilesById.get(message.user_id)
        ? {
            username: profilesById.get(message.user_id)?.username || undefined,
          }
        : message.profiles || null,
    })),
  } satisfies MatchmakingLobby;
}

function enrichMatchProfiles(match: ActiveMatch | null, profilesById: Map<string, PublicProfileBasic>) {
  if (!match) {
    return match;
  }

  return {
    ...match,
    match_players: (match.match_players || []).map((player) => ({
      ...player,
      profiles: profilesById.get(player.user_id)
        ? {
            username: profilesById.get(player.user_id)?.username || undefined,
          }
        : player.profiles || null,
    })),
  } satisfies ActiveMatch;
}

export async function createMatchmakingLobby(input: {
  mode: LobbyMode;
  kind: LobbyKind;
  name: string;
  teamSize?: 2 | 5;
  gameMode?: SupportedGameMode;
  stakeAmount?: number;
  selectedMap?: string | null;
  password?: string;
}) {
  const { data, error } = await supabase.rpc("create_matchmaking_lobby", {
    p_mode: input.mode,
    p_kind: input.kind,
    p_name: input.name,
    p_team_size: input.teamSize ?? 5,
    p_game_mode: input.gameMode ?? "competitive",
    p_stake_amount: input.stakeAmount ?? 0,
    p_selected_map: input.selectedMap ?? null,
    p_password: input.password?.trim() || null,
  });

  if (error) {
    throw error;
  }

  return data as string;
}

export async function joinMatchmakingLobby(lobbyId: string, password?: string | null) {
  const { error } = await supabase.rpc("join_matchmaking_lobby", {
    p_lobby_id: lobbyId,
    p_password: password?.trim() || null,
  });

  if (error) {
    throw error;
  }
}

export async function fetchOpenMatchmakingLobbies({
  mode,
  limit = 50,
  search,
  cursor,
}: {
  mode: LobbyMode;
  limit?: number;
  search?: string;
  cursor?: MatchmakingBrowserCursor | null;
}) {
  const fetchLimit = Math.min(Math.max(limit, 1), 50);
  return fetchOpenMatchmakingLobbiesFallback({
    mode,
    limit: fetchLimit,
    search,
    cursor,
  });
}

export async function fetchMySquadHubState(mode: LobbyMode) {
  return fetchMySquadHubStateFallback(mode);
}

export async function fetchMyActiveLobbySummary(mode: LobbyMode) {
  return fetchMyActiveLobbySummaryFallback(mode);
}

export async function fetchMyActiveLobby(userId: string, mode: LobbyMode) {
  const { data, error } = await supabase
    .from("lobby_members")
    .select(`lobbies!inner(${ACTIVE_LOBBY_SELECT})`)
    .eq("user_id", userId)
    .is("left_at", null)
    .is("kicked_at", null)
    .eq("lobbies.mode", mode)
    .in("lobbies.status", ["open", "in_progress"]);

  if (error) {
    throw error;
  }

  const lobbies = ((data || []) as Array<{ lobbies?: MatchmakingLobby | MatchmakingLobby[] }>)
    .flatMap((row) => {
      if (Array.isArray(row.lobbies)) {
        return row.lobbies;
      }
      return row.lobbies ? [row.lobbies] : [];
    })
    .sort((a, b) => {
      const aStatusWeight = a.status === "in_progress" ? 1 : 0;
      const bStatusWeight = b.status === "in_progress" ? 1 : 0;
      if (aStatusWeight !== bStatusWeight) {
        return bStatusWeight - aStatusWeight;
      }

      const aCreatedAt = a.created_at ? new Date(a.created_at).getTime() : 0;
      const bCreatedAt = b.created_at ? new Date(b.created_at).getTime() : 0;
      if (aCreatedAt !== bCreatedAt) {
        return bCreatedAt - aCreatedAt;
      }

      return b.id.localeCompare(a.id);
    });

  const rawLobby = lobbies[0] || null;
  const profilesById = await fetchPublicProfileBasics([
    ...(rawLobby?.lobby_members || []).map((member) => member.user_id),
    ...(rawLobby?.lobby_messages || []).map((message) => message.user_id),
  ]);
  return enrichLobbyProfiles(rawLobby, profilesById);
}

export async function fetchMyActiveMatch(lobbyId: string) {
  const { data, error } = await supabase
    .from("matches")
    .select("id, lobby_id, mode, status, server_status, dedicated_server_endpoint, started_at, ended_at, match_players(user_id, steam_id64, steam_verified, team_side, joined_server, is_winner, round_score, kills, deaths, assists, payout_amount, profiles:user_id(username))")
    .eq("lobby_id", lobbyId)
    .in("status", ["pending", "live"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw error;
  }

  const match = (data || null) as ActiveMatch | null;
  const profilesById = await fetchPublicProfileBasics(
    (match?.match_players || []).map((player) => player.user_id)
  );
  return enrichMatchProfiles(match, profilesById);
}

export async function fetchRecentMatches(mode: LobbyMode, limit = 6) {
  const buildMatchesQuery = (selectClause: string) =>
    supabase
      .from("matches")
      .select(selectClause)
      .eq("mode", mode)
      .in("status", ["finished", "cancelled", "interrupted"])
      .order("created_at", { ascending: false })
      .limit(limit);

  let data: Array<any> | null = null;

  if (recentMatchesSchemaSupportsScores !== false) {
    const modernResult = await buildMatchesQuery(
      "id, mode, status, started_at, ended_at, winning_side, score_t, score_ct, lobbies!inner(name, game_mode, selected_map, stake_amount), match_players(team_side, is_winner, round_score)"
    );

    if (!modernResult.error) {
      recentMatchesSchemaSupportsScores = true;
      data = (modernResult.data || []) as Array<any>;
    } else if (!isMissingMatchScoreSchema(modernResult.error)) {
      throw modernResult.error;
    } else {
      recentMatchesSchemaSupportsScores = false;
    }
  }

  if (!data) {
    const legacyResult = await buildMatchesQuery(
      "id, mode, status, started_at, ended_at, lobbies!inner(name, game_mode, selected_map, stake_amount), match_players(team_side, is_winner, round_score)"
    );

    if (legacyResult.error) {
      throw legacyResult.error;
    }

    data = (legacyResult.data || []) as Array<any>;
  }

  return (data || []).map((match) => {
    const players = Array.isArray(match.match_players) ? match.match_players : [];
    const fallbackTScore = players
      .filter((player) => player.team_side === "T")
      .reduce((sum, player) => sum + Number(player.round_score || 0), 0);
    const fallbackCtScore = players
      .filter((player) => player.team_side === "CT")
      .reduce((sum, player) => sum + Number(player.round_score || 0), 0);
    const tScore = Number.isFinite(Number(match.score_t)) ? Number(match.score_t) : fallbackTScore;
    const ctScore = Number.isFinite(Number(match.score_ct)) ? Number(match.score_ct) : fallbackCtScore;
    const winningSide: "T" | "CT" | "DRAW" =
      match.winning_side === "T" || match.winning_side === "CT"
        ? match.winning_side
        : tScore === ctScore
          ? "DRAW"
          : tScore > ctScore
            ? "T"
            : "CT";

    return {
      id: match.id,
      mode: match.mode,
      name: match.lobbies?.name || "Arena Match",
      gameMode: match.lobbies?.game_mode || "competitive",
      selectedMap: match.lobbies?.selected_map || "-",
      stakeAmount: Number(match.lobbies?.stake_amount || 0),
      status: match.status,
      startedAt: match.started_at,
      endedAt: match.ended_at,
      winningSide,
      winningScore: Math.max(tScore, ctScore),
      losingScore: Math.min(tScore, ctScore),
    } satisfies RecentMatchSummary;
  });
}

export async function startLobbyMatch(lobbyId: string) {
  const { data, error } = await supabase.rpc("start_lobby_match", {
    p_lobby_id: lobbyId,
  });

  if (error) {
    throw error;
  }

  return data as string;
}

export async function joinMatchServer(matchId: string) {
  const { data, error } = await supabase.rpc("player_join_match_server", {
    p_match_id: matchId,
  });

  if (error) {
    throw error;
  }

  return data as string;
}

export async function setLobbyMemberReady(lobbyId: string, isReady: boolean) {
  const { error } = await supabase.rpc("set_lobby_member_ready", {
    p_lobby_id: lobbyId,
    p_is_ready: isReady,
  });

  if (error) {
    throw error;
  }
}

export async function setLobbyMemberTeamSide(lobbyId: string, teamSide: TeamSide) {
  const { error } = await supabase.rpc("set_lobby_member_team_side", {
    p_lobby_id: lobbyId,
    p_team_side: teamSide,
  });

  if (error) {
    throw error;
  }
}

export async function leaveMatchmakingLobby(lobbyId: string) {
  const { error } = await supabase.rpc("leave_matchmaking_lobby", {
    p_lobby_id: lobbyId,
  });

  if (error) {
    throw error;
  }
}

export async function sendLobbyMessage(lobbyId: string, message: string) {
  const { error } = await supabase.rpc("send_lobby_message", {
    p_lobby_id: lobbyId,
    p_message: message,
  });

  if (error) {
    throw error;
  }
}

export async function ensureLobbyMapVoteSession(lobbyId: string) {
  const { data, error } = await supabase.rpc("ensure_lobby_map_vote_session", {
    p_lobby_id: lobbyId,
  });

  if (error) {
    throw error;
  }

  return data as string;
}

export async function syncMapVoteSession(sessionId: string) {
  const { error } = await supabase.rpc("sync_map_vote_session", {
    p_session_id: sessionId,
  });

  if (error) {
    throw error;
  }
}

export async function syncLobbyAutoVeto(lobbyId: string) {
  const { error } = await supabase.rpc("sync_lobby_auto_veto", {
    p_lobby_id: lobbyId,
  });

  if (error) {
    throw error;
  }
}

export async function castLobbyMapVote(sessionId: string, mapCode: string) {
  const { error } = await supabase.rpc("cast_lobby_map_vote", {
    p_session_id: sessionId,
    p_map_code: mapCode,
  });

  if (error) {
    throw error;
  }
}

export async function kickLobbyMember(lobbyId: string, userId: string) {
  const { error } = await supabase.rpc("kick_lobby_member", {
    p_lobby_id: lobbyId,
    p_target_user_id: userId,
  });

  if (error) {
    throw error;
  }
}

export async function completeDemoMatchForTesting(
  matchId: string,
  winningSide: "T" | "CT",
  winningRounds = 13,
  losingRounds = 3,
) {
  const { error } = await supabase.rpc("complete_demo_match_for_testing", {
    p_match_id: matchId,
    p_winning_side: winningSide,
    p_winning_rounds: winningRounds,
    p_losing_rounds: losingRounds,
  });

  if (error) {
    throw error;
  }
}

export async function fetchUnreadDemoMatchResultNotifications(limit = 1) {
  const { data, error } = await supabase
    .from("notifications")
    .select("id, title, body, metadata, created_at")
    .eq("notice_type", "demo_match_completed")
    .eq("is_read", false)
    .contains("metadata", { result_popup: true })
    .order("created_at", { ascending: true })
    .limit(limit);

  if (error) {
    throw error;
  }

  return (data || []) as MatchResultNotification[];
}

export async function markNotificationRead(notificationId: number) {
  if (await hasPlatformApiSession()) {
    try {
      const response = await platformFetch("/api/social/notifications/read", {
        method: "POST",
        body: JSON.stringify({ ids: [notificationId] }),
      });
      if (response.ok) {
        return;
      }
    } catch {
      // Fall back to Supabase below.
    }
  }

  const { error } = await supabase.rpc("mark_notification_read", {
    p_notice_id: notificationId,
  });

  if (error) {
    throw error;
  }
}

export async function fetchMyReconnectableMatch() {
  const { data, error } = await supabase.rpc("get_my_reconnectable_match");

  if (error) {
    throw error;
  }

  const row = Array.isArray(data) ? data[0] : data;
  return (row || null) as ReconnectableMatch | null;
}

export async function fetchMatchServerBootstrap(matchId: string) {
  const { data, error } = await supabase.rpc("get_match_server_bootstrap", {
    p_match_id: matchId,
  });

  if (error) {
    throw error;
  }

  return data as MatchServerBootstrap;
}

export async function markMatchServerAllocated(matchId: string, serverId: string, endpoint: string) {
  const { error } = await supabase.rpc("mark_match_server_allocated", {
    p_match_id: matchId,
    p_server_id: serverId,
    p_server_endpoint: endpoint,
  });

  if (error) {
    throw error;
  }
}

export function launchMatchServer(endpoint: string | null | undefined) {
  if (!endpoint) {
    throw new Error("Dedicated server endpoint is not available yet.");
  }

  window.location.assign(endpoint);
}

export async function recordMatchPlayerStats(input: {
  matchId: string;
  userId: string;
  teamSide: TeamSide;
  kills: number;
  deaths: number;
  assists: number;
  roundScore: number;
  isWinner: boolean;
}) {
  const { error } = await supabase.rpc("admin_record_match_player_stats", {
    p_match_id: input.matchId,
    p_user_id: input.userId,
    p_team_side: input.teamSide,
    p_kills: input.kills,
    p_deaths: input.deaths,
    p_assists: input.assists,
    p_round_score: input.roundScore,
    p_is_winner: input.isWinner,
  });

  if (error) {
    throw error;
  }
}

export async function quickQueueJoinOrMatch(
  mode: LobbyMode,
  teamSize: 2 | 5,
  queueMode: "solo" | "party",
  stakeAmount: number,
  gameMode: SupportedGameMode
) {
  const canUseLegacySignature =
    (teamSize === 2 && gameMode === "wingman") ||
    (teamSize === 5 && gameMode === "competitive");

  const isMissingRpcSignature = (error: any) => {
    const code = String(error?.code || "");
    const message = String(error?.message || "");
    const details = String(error?.details || "");
    const hint = String(error?.hint || "");
    const combined = `${message} ${details} ${hint}`;

    return (
      code === "PGRST202" ||
      combined.includes("Could not find the function public.quick_queue_join_or_match") ||
      combined.includes("Searched for the function public.quick_queue_join_or_match")
    );
  };

  const legacyPayload = {
    p_mode: mode,
    p_team_size: teamSize,
    p_queue_mode: queueMode,
    p_stake_amount: stakeAmount,
  };

  if (quickQueueRpcSupportsGameMode === false && canUseLegacySignature) {
    const legacyResult = await supabase.rpc("quick_queue_join_or_match", legacyPayload);
    if (legacyResult.error) {
      throw legacyResult.error;
    }
    const legacyRow = Array.isArray(legacyResult.data) ? legacyResult.data[0] : legacyResult.data;
    return (legacyRow || null) as QuickQueueStatus | null;
  }

  const payloadWithGameMode = {
    p_mode: mode,
    p_team_size: teamSize,
    p_queue_mode: queueMode,
    p_stake_amount: stakeAmount,
    p_game_mode: gameMode,
  };

  let { data, error } = await supabase.rpc("quick_queue_join_or_match", payloadWithGameMode);

  // Backward-compatible fallback for environments that still run the old RPC signature.
  if (error && isMissingRpcSignature(error) && canUseLegacySignature) {
    quickQueueRpcSupportsGameMode = false;
    const fallback = await supabase.rpc("quick_queue_join_or_match", legacyPayload);
    data = fallback.data;
    error = fallback.error;
  } else if (!error) {
    quickQueueRpcSupportsGameMode = true;
  } else if (error && isMissingRpcSignature(error) && !canUseLegacySignature) {
    throw new Error("This quick queue mode needs the latest Supabase matchmaking migration before it can be used.");
  }

  if (error) {
    throw error;
  }

  const row = Array.isArray(data) ? data[0] : data;
  if (!row) {
    return null;
  }
  return row as QuickQueueStatus;
}

export async function quickQueueAcceptMatch(readyCheckId: string, accept = true) {
  const { data, error } = await supabase.rpc("quick_queue_accept_match", {
    p_ready_check_id: readyCheckId,
    p_accept: accept,
  });

  if (error) {
    throw error;
  }

  const row = Array.isArray(data) ? data[0] : data;
  if (!row) {
    return null;
  }

  return row as QuickQueueStatus;
}

export async function quickQueueCancel(mode: LobbyMode) {
  const { error } = await supabase.rpc("quick_queue_cancel", {
    p_mode: mode,
  });

  if (error) {
    throw error;
  }
}

export async function fetchMyQuickQueueStatus(mode: LobbyMode) {
  if (quickQueueStatusRpcSupported === false) {
    return fetchMyQuickQueueStatusFallback(mode);
  }

  let { data, error } = await supabase.rpc("get_my_quick_queue_status", {
    p_mode: mode,
  });

  if (error && isMissingRpcFunction(error, "get_my_quick_queue_status")) {
    quickQueueStatusRpcSupported = false;
    return fetchMyQuickQueueStatusFallback(mode);
  }

  if (error) {
    throw error;
  }

  quickQueueStatusRpcSupported = true;
  const row = Array.isArray(data) ? data[0] : data;
  return (row || null) as MyQuickQueueStatus | null;
}

export async function fetchQuickQueuePartyInvites(userId: string) {
  if (await hasPlatformApiSession()) {
    try {
      const response = await platformFetch("/api/matchmaking/party-invites");
      if (response.ok) {
        const payload = await response.json();
        return (payload.data || []) as QuickQueuePartyInvite[];
      }
    } catch {
      // Fall back to Supabase below.
    }
  }

  const { data, error } = await supabase
    .from("quick_queue_party_invites")
    .select("id, host_user_id, invitee_user_id, mode, team_size, stake_amount, status, created_at, updated_at, responded_at")
    .or(`host_user_id.eq.${userId},invitee_user_id.eq.${userId}`)
    .order("updated_at", { ascending: false });

  if (error) {
    throw error;
  }

  return (data || []) as QuickQueuePartyInvite[];
}

export async function sendQuickQueuePartyInvite(inviteeUserId: string, mode: LobbyMode, teamSize: 2 | 5, stakeAmount: number) {
  if (await hasPlatformApiSession()) {
    try {
      const response = await platformFetch("/api/matchmaking/party-invites", {
        method: "POST",
        body: JSON.stringify({
          inviteeUserId,
          mode,
          teamSize,
          stakeAmount,
        }),
      });
      if (response.ok) {
        const payload = await response.json();
        return (payload.data || "sent") as string;
      }
    } catch {
      // Fall back to Supabase below.
    }
  }

  const { data, error } = await supabase.rpc("send_quick_queue_party_invite", {
    p_invitee_user_id: inviteeUserId,
    p_mode: mode,
    p_team_size: teamSize,
    p_stake_amount: stakeAmount,
  });

  if (error) {
    throw error;
  }

  return (data || "sent") as string;
}

export async function respondQuickQueuePartyInvite(inviteId: number, action: "accept" | "decline" | "cancel") {
  if (await hasPlatformApiSession()) {
    try {
      const response = await platformFetch(`/api/matchmaking/party-invites/${inviteId}/respond`, {
        method: "POST",
        body: JSON.stringify({ action }),
      });
      if (response.ok) {
        const payload = await response.json();
        return (payload.data || action) as string;
      }
    } catch {
      // Fall back to Supabase below.
    }
  }

  const { data, error } = await supabase.rpc("respond_quick_queue_party_invite", {
    p_invite_id: inviteId,
    p_action: action,
  });

  if (error) {
    throw error;
  }

  return (data || action) as string;
}

export async function fetchUserMatchHistory(userId: string, mode: LobbyMode, limit = 10) {
  const { data, error } = await supabase
    .from("matches")
    .select("id, mode, status, started_at, ended_at, winning_side, score_t, score_ct, lobbies!inner(name, game_mode, selected_map, stake_amount), match_players!inner(user_id, team_side, is_winner, payout_amount, round_score)")
    .eq("mode", mode)
    .eq("match_players.user_id", userId)
    .in("status", ["finished", "cancelled", "interrupted"])
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    throw error;
  }

  return ((data || []) as Array<any>).map((match) => {
    const player = Array.isArray(match.match_players) ? match.match_players[0] : match.match_players;
    const fallbackTScore = Array.isArray(match.match_players)
      ? match.match_players
          .filter((row: any) => row.team_side === "T")
          .reduce((sum: number, row: any) => sum + Number(row.round_score || 0), 0)
      : 0;
    const fallbackCtScore = Array.isArray(match.match_players)
      ? match.match_players
          .filter((row: any) => row.team_side === "CT")
          .reduce((sum: number, row: any) => sum + Number(row.round_score || 0), 0)
      : 0;
    const tScore = Number.isFinite(Number(match.score_t)) ? Number(match.score_t) : fallbackTScore;
    const ctScore = Number.isFinite(Number(match.score_ct)) ? Number(match.score_ct) : fallbackCtScore;
    const winningSide: "T" | "CT" | "DRAW" =
      match.winning_side === "T" || match.winning_side === "CT"
        ? match.winning_side
        : tScore === ctScore
          ? "DRAW"
          : tScore > ctScore
            ? "T"
            : "CT";

    return {
      id: match.id,
      userId,
      mode: match.mode,
      name: match.lobbies?.name || "Arena Match",
      gameMode: match.lobbies?.game_mode || "competitive",
      selectedMap: match.lobbies?.selected_map || "-",
      stakeAmount: Number(match.lobbies?.stake_amount || 0),
      status: match.status,
      startedAt: match.started_at,
      endedAt: match.ended_at,
      winningSide,
      winningScore: Math.max(tScore, ctScore),
      losingScore: Math.min(tScore, ctScore),
      teamSide: (player?.team_side || "UNASSIGNED") as TeamSide,
      isWinner: Boolean(player?.is_winner),
      payoutAmount: Number(player?.payout_amount || 0),
    } satisfies UserMatchHistoryItem;
  });
}

export async function fetchQuickQueuePartyStakeUpdates(userId: string) {
  const executeFetch = async () =>
    supabase
      .from("quick_queue_party_stake_updates")
      .select("id, host_user_id, invitee_user_id, mode, team_size, previous_stake_amount, new_stake_amount, status, created_at, updated_at, responded_at")
      .or(`host_user_id.eq.${userId},invitee_user_id.eq.${userId}`)
      .order("updated_at", { ascending: false });

  let { data, error } = await executeFetch();

  if (isSupabaseTransientNetworkError(error)) {
    const retry = await executeFetch();
    data = retry.data;
    error = retry.error;
  }

  if (error) {
    if (isSupabaseTransientNetworkError(error)) {
      return [] as QuickQueuePartyStakeUpdate[];
    }
    throw error;
  }

  return (data || []) as QuickQueuePartyStakeUpdate[];
}

export async function fetchQuickQueuePartyStakeCap(mode: LobbyMode, teamSize: 2 | 5) {
  const executeFetch = async () =>
    supabase.rpc("get_quick_queue_party_stake_cap", {
      p_mode: mode,
      p_team_size: teamSize,
    });

  let { data, error } = await executeFetch();

  if (isSupabaseTransientNetworkError(error)) {
    const retry = await executeFetch();
    data = retry.data;
    error = retry.error;
  }

  if (error) {
    if (isSupabaseTransientNetworkError(error)) {
      return 0;
    }
    throw error;
  }

  return Number(data || 0);
}

export async function requestQuickQueuePartyStakeUpdate(
  mode: LobbyMode,
  teamSize: 2 | 5,
  previousStakeAmount: number,
  newStakeAmount: number
) {
  const { data, error } = await supabase.rpc("request_quick_queue_party_stake_update", {
    p_mode: mode,
    p_team_size: teamSize,
    p_previous_stake_amount: previousStakeAmount,
    p_new_stake_amount: newStakeAmount,
  });

  if (error) {
    throw error;
  }

  return Number(data || 0);
}

export async function respondQuickQueuePartyStakeUpdate(stakeUpdateId: number, action: "accept" | "decline") {
  const { data, error } = await supabase.rpc("respond_quick_queue_party_stake_update", {
    p_stake_update_id: stakeUpdateId,
    p_action: action,
  });

  if (error) {
    throw error;
  }

  return (data || action) as string;
}
