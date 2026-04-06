import { supabase } from "../supabase";

export type LobbyMode = "demo" | "live";
export type LobbyKind = "public" | "custom";
export type TeamSide = "T" | "CT" | "UNASSIGNED";
export type MatchStatus = "pending" | "live" | "finished" | "interrupted" | "cancelled";
export type SupportedGameMode = "wingman" | "competitive" | "team_ffa" | "ffa";

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
  status: "active" | "completed";
  round_number: number;
  last_vetoed_map?: string | null;
  map_votes?: MapVote[];
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
  dedicated_server_endpoint?: string | null;
  started_at?: string | null;
  ended_at?: string | null;
  match_players?: Array<{
    user_id: string;
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
  join_server_deadline,
  created_at,
  lobby_members(user_id, team_side, is_ready, joined_at, left_at, kicked_at, profiles:user_id(username,email))
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
  join_server_deadline,
  created_at,
  lobby_members(user_id, team_side, is_ready, joined_at, left_at, kicked_at, profiles:user_id(username,email)),
  lobby_messages(id, user_id, message, created_at, profiles:user_id(username)),
  map_vote_sessions(id, lobby_id, active_team, turn_ends_at, turn_seconds, remaining_maps, status, round_number, last_vetoed_map, map_votes(user_id, map_code, updated_at))
`;

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

export async function fetchOpenMatchmakingLobbies(mode: LobbyMode) {
  const { data, error } = await supabase
    .from("lobbies")
    .select(OPEN_LOBBY_SELECT)
    .eq("mode", mode)
    .eq("kind", "custom")
    .eq("status", "open")
    .order("created_at", { ascending: true });

  if (error) {
    throw error;
  }

  return ((data || []) as MatchmakingLobby[]).filter((lobby) =>
    (lobby.lobby_members || []).some((member) => !member.left_at && !member.kicked_at)
  );
}

export async function fetchMyActiveLobby(userId: string, mode: LobbyMode) {
  const { data, error } = await supabase
    .from("lobby_members")
    .select(`lobbies!inner(${ACTIVE_LOBBY_SELECT})`)
    .eq("user_id", userId)
    .is("left_at", null)
    .is("kicked_at", null)
    .eq("lobbies.mode", mode)
    .in("lobbies.status", ["open", "in_progress"])
    .limit(1);

  if (error) {
    throw error;
  }

  const rawLobby = (data?.[0] as { lobbies?: MatchmakingLobby | MatchmakingLobby[] } | undefined)?.lobbies;
  if (Array.isArray(rawLobby)) {
    return rawLobby[0] || null;
  }

  return rawLobby || null;
}

export async function fetchMyActiveMatch(lobbyId: string) {
  const { data, error } = await supabase
    .from("matches")
    .select("id, lobby_id, mode, status, dedicated_server_endpoint, started_at, ended_at, match_players(user_id, team_side, joined_server, is_winner, round_score, kills, deaths, assists, payout_amount, profiles:user_id(username))")
    .eq("lobby_id", lobbyId)
    .in("status", ["pending", "live"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return (data || null) as ActiveMatch | null;
}

export async function fetchRecentMatches(mode: LobbyMode, limit = 6) {
  const { data, error } = await supabase
    .from("matches")
    .select("id, mode, status, started_at, ended_at, lobbies!inner(name, game_mode, selected_map, stake_amount), match_players(team_side, is_winner, round_score)")
    .eq("mode", mode)
    .in("status", ["finished", "cancelled", "interrupted"])
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    throw error;
  }

  return ((data || []) as Array<any>).map((match) => {
    const players = Array.isArray(match.match_players) ? match.match_players : [];
    const tScore = players
      .filter((player) => player.team_side === "T")
      .reduce((sum, player) => sum + Number(player.round_score || 0), 0);
    const ctScore = players
      .filter((player) => player.team_side === "CT")
      .reduce((sum, player) => sum + Number(player.round_score || 0), 0);
    const winningSide: "T" | "CT" | "DRAW" = tScore === ctScore ? "DRAW" : tScore > ctScore ? "T" : "CT";

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

export async function castLobbyMapVote(sessionId: string, mapCode: string) {
  const { error } = await supabase.rpc("cast_lobby_map_vote", {
    p_session_id: sessionId,
    p_map_code: mapCode,
  });

  if (error) {
    throw error;
  }
}

export async function completeDemoMatchForTesting(matchId: string, winningSide: "T" | "CT") {
  const { error } = await supabase.rpc("complete_demo_match_for_testing", {
    p_match_id: matchId,
    p_winning_side: winningSide,
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
