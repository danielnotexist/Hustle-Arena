import { randomUUID } from 'crypto';
import type {
  CreateLobbyInput,
  MatchLobby,
  MatchLobbyDetails,
  MatchPlayerView,
  MatchResultPayload,
  MatchmakingSnapshot,
  MatchMode,
  MatchQueueEntry,
  MatchTeam,
  Profile,
  QueueJoinInput,
} from '@hustle-arena/shared-types';
import { MAP_POOL, getModePlayerCount } from '@hustle-arena/shared-types';
import { AppError } from '../lib/errors';
import { mapEvent, mapMatch, mapMatchPlayer, mapQueueEntry, mapVote } from '../lib/mappers';
import { asRow, toNumberValue, toStringValue } from '../lib/parsers';
import { serviceRoleClient } from '../lib/supabase';
import { lockStake, releaseStake } from './wallet-service';

const MATCH_SELECT = [
  'id',
  'creator_id',
  'title',
  'queue_type',
  'game_mode',
  'wager_amount',
  'status',
  'phase',
  'region',
  'room_code',
  'is_private',
  'lobby_password',
  'selected_map',
  'map_pool',
  'server_ip',
  'server_callback_key',
  'winner_team',
  'total_pool',
  'platform_fee',
  'ready_deadline',
  'started_at',
  'ended_at',
  'created_at',
  'updated_at',
].join(', ');

const PLAYER_SELECT = `
  match_id,
  user_id,
  team,
  slot_index,
  is_ready,
  is_captain,
  elo_before,
  elo_after,
  joined_at,
  ready_at,
  profile:profiles!match_players_user_id_fkey (
    id,
    username,
    display_name,
    avatar_url,
    elo_rating,
    is_vip
  )
`;

function ensureKycVerified(profile: Profile) {
  if (profile.kyc_status !== 'verified') {
    throw new AppError(403, 'KYC_REQUIRED', 'KYC verification is required for deposits, withdrawals, and play');
  }
}

function sanitizeTitle(input: string) {
  const trimmed = input.trim();
  return trimmed.length > 0 ? trimmed : 'Arena Lobby';
}

function generateRoomCode() {
  return randomUUID().slice(0, 8).toUpperCase();
}

function getTargetTeam(mode: MatchMode, players: MatchPlayerView[]): MatchTeam {
  if (mode === 'ffa') {
    return 'solo';
  }

  const teamACount = players.filter((player) => player.team === 'A').length;
  const teamBCount = players.filter((player) => player.team === 'B').length;
  return teamACount <= teamBCount ? 'A' : 'B';
}

function nextSlot(players: MatchPlayerView[]) {
  return players.length;
}

function pickWinningMap(votes: { map_name: string }[]): string {
  const counts = new Map<string, number>();

  votes.forEach((vote) => {
    counts.set(vote.map_name, (counts.get(vote.map_name) ?? 0) + 1);
  });

  return [...counts.entries()]
    .sort((left, right) => {
      if (right[1] !== left[1]) {
        return right[1] - left[1];
      }

      return left[0].localeCompare(right[0]);
    })[0]?.[0] ?? MAP_POOL[0];
}

type QueueCandidate = MatchQueueEntry & {
  profile: Pick<Profile, 'id' | 'elo_rating'>;
};

function assignBalancedTeams(mode: MatchMode, entries: QueueCandidate[]) {
  if (mode === 'ffa') {
    return entries.map((entry, index) => ({
      user_id: entry.user_id,
      team: 'solo' as const,
      slot_index: index,
      is_captain: index === 0,
      elo_before: entry.profile.elo_rating,
    }));
  }

  const sortedEntries = [...entries].sort((left, right) => right.profile.elo_rating - left.profile.elo_rating);
  let teamATotal = 0;
  let teamBTotal = 0;
  let teamASlots = 0;
  let teamBSlots = 0;

  return sortedEntries.map((entry) => {
    const assignToA = teamASlots <= teamBSlots ? teamATotal <= teamBTotal : false;
    const team = assignToA ? 'A' : 'B';
    const slotIndex = assignToA ? teamASlots : teamBSlots;

    if (assignToA) {
      teamATotal += entry.profile.elo_rating;
      teamASlots += 1;
    } else {
      teamBTotal += entry.profile.elo_rating;
      teamBSlots += 1;
    }

    return {
      user_id: entry.user_id,
      team,
      slot_index: slotIndex,
      is_captain: slotIndex === 0,
      elo_before: entry.profile.elo_rating,
    };
  });
}

async function insertMatchEvent(matchId: string, eventType: string, actorId: string | null, payload: Record<string, unknown>) {
  const { error } = await serviceRoleClient.from('match_events').insert({
    match_id: matchId,
    actor_id: actorId,
    event_type: eventType,
    payload,
  });

  if (error) {
    throw new AppError(500, 'MATCH_EVENT_FAILED', error.message);
  }
}

export async function getLobbyById(matchId: string): Promise<MatchLobby | null> {
  const { data, error } = await serviceRoleClient.from('matches').select(MATCH_SELECT).eq('id', matchId).single();

  if (error) {
    if (error.code === 'PGRST116') {
      return null;
    }

    throw new AppError(500, 'MATCH_FETCH_FAILED', error.message);
  }

  return mapMatch(asRow(data));
}

async function getPlayers(matchId: string): Promise<MatchPlayerView[]> {
  const { data, error } = await serviceRoleClient
    .from('match_players')
    .select(PLAYER_SELECT)
    .eq('match_id', matchId)
    .order('slot_index', { ascending: true });

  if (error) {
    throw new AppError(500, 'MATCH_PLAYERS_FETCH_FAILED', error.message);
  }

  return (data ?? []).map((row) => mapMatchPlayer(asRow(row)));
}

async function getVotes(matchId: string) {
  const { data, error } = await serviceRoleClient
    .from('match_map_votes')
    .select('*')
    .eq('match_id', matchId)
    .order('created_at', { ascending: true });

  if (error) {
    throw new AppError(500, 'MATCH_VOTES_FETCH_FAILED', error.message);
  }

  return (data ?? []).map((row) => mapVote(asRow(row)));
}

async function getEvents(matchId: string) {
  const { data, error } = await serviceRoleClient
    .from('match_events')
    .select('*')
    .eq('match_id', matchId)
    .order('created_at', { ascending: false })
    .limit(20);

  if (error) {
    throw new AppError(500, 'MATCH_EVENTS_FETCH_FAILED', error.message);
  }

  return (data ?? []).map((row) => mapEvent(asRow(row)));
}

export async function getLobbyDetails(matchId: string): Promise<MatchLobbyDetails> {
  const match = await getLobbyById(matchId);

  if (!match) {
    throw new AppError(404, 'MATCH_NOT_FOUND', 'Match could not be found');
  }

  const [players, votes, events] = await Promise.all([getPlayers(matchId), getVotes(matchId), getEvents(matchId)]);

  return {
    match,
    players,
    votes,
    events,
  };
}

export async function getOpenLobbies() {
  const { data, error } = await serviceRoleClient
    .from('matches')
    .select(MATCH_SELECT)
    .in('status', ['forming', 'ready_check', 'map_vote', 'live'])
    .order('created_at', { ascending: false })
    .limit(20);

  if (error) {
    throw new AppError(500, 'MATCHES_FETCH_FAILED', error.message);
  }

  return (data ?? []).map((row) => mapMatch(asRow(row)));
}

export async function getQueueEntries(userId: string) {
  const { data, error } = await serviceRoleClient
    .from('match_queue_entries')
    .select('*')
    .eq('user_id', userId)
    .order('queued_at', { ascending: true });

  if (error) {
    throw new AppError(500, 'QUEUE_FETCH_FAILED', error.message);
  }

  return (data ?? []).map((row) => mapQueueEntry(asRow(row)));
}

export async function getActiveMatchForUser(userId: string): Promise<MatchLobbyDetails | null> {
  const { data, error } = await serviceRoleClient
    .from('match_players')
    .select(`match_id, match:matches!match_players_match_id_fkey (${MATCH_SELECT})`)
    .eq('user_id', userId)
    .order('joined_at', { ascending: false })
    .limit(10);

  if (error) {
    throw new AppError(500, 'ACTIVE_MATCH_FETCH_FAILED', error.message);
  }

  const activeEntry = (data ?? []).find((row) => {
    const matchRow = asRow(asRow(row).match);
    return ['forming', 'ready_check', 'map_vote', 'live'].includes(toStringValue(matchRow.status));
  });

  if (!activeEntry) {
    return null;
  }

  const matchRow = asRow(asRow(activeEntry).match);
  const matchId = toStringValue(matchRow.id);

  if (!matchId) {
    return null;
  }

  return getLobbyDetails(matchId);
}

export async function getMatchmakingSnapshot(userId: string): Promise<MatchmakingSnapshot> {
  const [activeMatch, openLobbies, queueEntries] = await Promise.all([
    getActiveMatchForUser(userId),
    getOpenLobbies(),
    getQueueEntries(userId),
  ]);

  return {
    activeMatch,
    openLobbies,
    queueEntries,
  };
}

export async function createLobby(userId: string, profile: Profile, input: CreateLobbyInput) {
  ensureKycVerified(profile);

  const mapPool = input.map_pool.length > 0 ? input.map_pool : [...MAP_POOL];
  const roomCode = input.is_private ? generateRoomCode() : null;

  const { data, error } = await serviceRoleClient
    .from('matches')
    .insert({
      creator_id: userId,
      title: sanitizeTitle(input.title),
      queue_type: input.queue_type,
      game_mode: input.game_mode,
      wager_amount: input.wager_amount,
      status: 'forming',
      phase: 'team_select',
      region: input.region,
      is_private: input.is_private,
      lobby_password: input.lobby_password ?? null,
      map_pool: mapPool,
      room_code: roomCode,
      server_callback_key: randomUUID(),
      total_pool: input.wager_amount,
      platform_fee: 0,
    })
    .select(MATCH_SELECT)
    .single();

  if (error) {
    throw new AppError(500, 'MATCH_CREATE_FAILED', error.message);
  }

  const match = mapMatch(asRow(data));

  try {
    const { error: playerInsertError } = await serviceRoleClient.from('match_players').insert({
      match_id: match.id,
      user_id: userId,
      team: input.game_mode === 'ffa' ? 'solo' : 'A',
      slot_index: 0,
      is_ready: false,
      is_captain: true,
      elo_before: profile.elo_rating,
    });

    if (playerInsertError) {
      throw new AppError(500, 'MATCH_PLAYER_CREATE_FAILED', playerInsertError.message);
    }

    await lockStake(userId, match.id, input.wager_amount, `match:${match.id}:${userId}:lock`);
    await insertMatchEvent(match.id, 'lobby_created', userId, {
      queue_type: input.queue_type,
      mode: input.game_mode,
      wager_amount: input.wager_amount,
    });
  } catch (error) {
    await serviceRoleClient.from('match_players').delete().eq('match_id', match.id);
    await serviceRoleClient.from('matches').delete().eq('id', match.id);
    throw error;
  }

  return getLobbyDetails(match.id);
}

export async function joinLobby(userId: string, profile: Profile, matchId: string, password?: string) {
  ensureKycVerified(profile);

  const snapshot = await getLobbyDetails(matchId);
  const { match, players } = snapshot;
  const targetPlayers = getModePlayerCount(match.game_mode);

  if (players.some((player) => player.user_id === userId)) {
    return snapshot;
  }

  if (match.status !== 'forming' && match.status !== 'ready_check') {
    throw new AppError(409, 'MATCH_JOIN_CLOSED', 'This lobby is no longer open for joins');
  }

  if (players.length >= targetPlayers) {
    throw new AppError(409, 'MATCH_FULL', 'This lobby is already full');
  }

  if (match.is_private && match.lobby_password && match.lobby_password !== password) {
    throw new AppError(403, 'MATCH_PASSWORD_INVALID', 'Incorrect lobby password');
  }

  const team = getTargetTeam(match.game_mode, players);
  const slotIndex = nextSlot(players);

  const { error: insertError } = await serviceRoleClient.from('match_players').insert({
    match_id: matchId,
    user_id: userId,
    team,
    slot_index: slotIndex,
    is_ready: false,
    is_captain: false,
    elo_before: profile.elo_rating,
  });

  if (insertError) {
    throw new AppError(500, 'MATCH_JOIN_FAILED', insertError.message);
  }

  await lockStake(userId, matchId, match.wager_amount, `match:${matchId}:${userId}:lock`);
  await insertMatchEvent(matchId, 'player_joined', userId, {
    team,
    slot_index: slotIndex,
  });

  return getLobbyDetails(matchId);
}

export async function changeTeam(userId: string, matchId: string, requestedTeam: MatchTeam) {
  const snapshot = await getLobbyDetails(matchId);
  const { match, players } = snapshot;

  if (match.phase !== 'team_select') {
    throw new AppError(409, 'MATCH_PHASE_INVALID', 'Teams can only be changed during team selection');
  }

  if (match.game_mode === 'ffa' && requestedTeam !== 'solo') {
    throw new AppError(400, 'MATCH_TEAM_INVALID', 'FFA lobbies only support the solo team');
  }

  if (match.game_mode !== 'ffa') {
    const requestedCount = players.filter((player) => player.team === requestedTeam).length;
    const maxPerTeam = getModePlayerCount(match.game_mode) / 2;

    if (requestedCount >= maxPerTeam) {
      throw new AppError(409, 'MATCH_TEAM_FULL', 'That team is already full');
    }
  }

  const { error } = await serviceRoleClient
    .from('match_players')
    .update({ team: requestedTeam })
    .eq('match_id', matchId)
    .eq('user_id', userId);

  if (error) {
    throw new AppError(500, 'MATCH_TEAM_UPDATE_FAILED', error.message);
  }

  await insertMatchEvent(matchId, 'team_changed', userId, { team: requestedTeam });

  return getLobbyDetails(matchId);
}

export async function toggleReady(userId: string, matchId: string) {
  const snapshot = await getLobbyDetails(matchId);
  const { match, players } = snapshot;

  if (match.status === 'live' || match.status === 'completed') {
    throw new AppError(409, 'MATCH_READY_INVALID', 'Ready state can no longer be changed');
  }

  const currentPlayer = players.find((player) => player.user_id === userId);

  if (!currentPlayer) {
    throw new AppError(404, 'MATCH_PLAYER_NOT_FOUND', 'You are not in this lobby');
  }

  if (match.phase === 'team_select') {
    await serviceRoleClient.from('matches').update({ phase: 'ready_check', status: 'ready_check' }).eq('id', matchId);
  }

  const nextReadyState = !currentPlayer.is_ready;
  const { error } = await serviceRoleClient
    .from('match_players')
    .update({
      is_ready: nextReadyState,
      ready_at: nextReadyState ? new Date().toISOString() : null,
    })
    .eq('match_id', matchId)
    .eq('user_id', userId);

  if (error) {
    throw new AppError(500, 'MATCH_READY_UPDATE_FAILED', error.message);
  }

  await insertMatchEvent(matchId, 'ready_toggled', userId, { is_ready: nextReadyState });

  const refreshedSnapshot = await getLobbyDetails(matchId);
  const targetPlayers = getModePlayerCount(refreshedSnapshot.match.game_mode);
  const everyoneReady =
    refreshedSnapshot.players.length === targetPlayers &&
    refreshedSnapshot.players.every((player) => player.is_ready);

  if (everyoneReady) {
    await serviceRoleClient.from('matches').update({ phase: 'map_vote', status: 'map_vote' }).eq('id', matchId);
  }

  return getLobbyDetails(matchId);
}

export async function castMapVote(userId: string, matchId: string, mapName: string) {
  const snapshot = await getLobbyDetails(matchId);

  if (snapshot.match.phase !== 'map_vote' && snapshot.match.phase !== 'starting') {
    throw new AppError(409, 'MATCH_MAP_VOTE_INVALID', 'Map voting is not open for this lobby');
  }

  if (!snapshot.match.map_pool.includes(mapName as typeof snapshot.match.map_pool[number])) {
    throw new AppError(400, 'MATCH_MAP_INVALID', 'Selected map is not in the available pool');
  }

  const { error } = await serviceRoleClient.from('match_map_votes').upsert(
    {
      match_id: matchId,
      user_id: userId,
      map_name: mapName,
      created_at: new Date().toISOString(),
    },
    {
      onConflict: 'match_id,user_id',
    },
  );

  if (error) {
    throw new AppError(500, 'MATCH_MAP_VOTE_FAILED', error.message);
  }

  await insertMatchEvent(matchId, 'map_voted', userId, { map_name: mapName });

  const refreshedSnapshot = await getLobbyDetails(matchId);

  if (refreshedSnapshot.votes.length === refreshedSnapshot.players.length) {
    const winningMap = pickWinningMap(refreshedSnapshot.votes);

    await serviceRoleClient
      .from('matches')
      .update({
        selected_map: winningMap,
        phase: 'starting',
      })
      .eq('id', matchId);
  }

  return getLobbyDetails(matchId);
}

export async function startMatch(userId: string, matchId: string) {
  const snapshot = await getLobbyDetails(matchId);

  if (snapshot.match.creator_id !== userId) {
    throw new AppError(403, 'MATCH_START_FORBIDDEN', 'Only the lobby creator can start the match');
  }

  if (!snapshot.match.selected_map) {
    throw new AppError(409, 'MATCH_START_BLOCKED', 'The map vote must be completed before the match can start');
  }

  const { error } = await serviceRoleClient
    .from('matches')
    .update({
      phase: 'live',
      status: 'live',
      started_at: new Date().toISOString(),
    })
    .eq('id', matchId);

  if (error) {
    throw new AppError(500, 'MATCH_START_FAILED', error.message);
  }

  await insertMatchEvent(matchId, 'match_started', userId, { selected_map: snapshot.match.selected_map });
  return getLobbyDetails(matchId);
}

async function fetchQueueCandidates(mode: MatchMode, region: string, wagerAmount: number) {
  const { data, error } = await serviceRoleClient
    .from('match_queue_entries')
    .select(`
      id,
      user_id,
      match_mode,
      wager_amount,
      region,
      elo_rating,
      queued_at,
      profile:profiles!match_queue_entries_user_id_fkey (
        id,
        elo_rating
      )
    `)
    .eq('match_mode', mode)
    .eq('region', region)
    .eq('wager_amount', wagerAmount)
    .order('queued_at', { ascending: true });

  if (error) {
    throw new AppError(500, 'QUEUE_MATCH_FETCH_FAILED', error.message);
  }

  return (data ?? []).map((row) => {
    const parsed = asRow(row);
    const profileRow = asRow(parsed.profile);

    return {
      ...mapQueueEntry(parsed),
      profile: {
        id: toStringValue(profileRow.id),
        elo_rating: toNumberValue(profileRow.elo_rating, 1000),
      },
    };
  }) as QueueCandidate[];
}

async function finalizePublicQueueMatch(mode: MatchMode, region: string, wagerAmount: number, entries: QueueCandidate[]) {
  const { data, error } = await serviceRoleClient
    .from('matches')
    .insert({
      creator_id: entries[0]?.user_id ?? null,
      title: `Public ${mode.toUpperCase()} queue`,
      queue_type: 'public',
      game_mode: mode,
      wager_amount: wagerAmount,
      status: 'forming',
      phase: 'team_select',
      region,
      is_private: false,
      map_pool: [...MAP_POOL],
      room_code: null,
      server_callback_key: randomUUID(),
      total_pool: wagerAmount * entries.length,
      platform_fee: 0,
    })
    .select(MATCH_SELECT)
    .single();

  if (error) {
    throw new AppError(500, 'QUEUE_MATCH_CREATE_FAILED', error.message);
  }

  const match = mapMatch(asRow(data));
  const assignments = assignBalancedTeams(mode, entries);

  const { error: playersError } = await serviceRoleClient.from('match_players').insert(
    assignments.map((assignment) => ({
      match_id: match.id,
      user_id: assignment.user_id,
      team: assignment.team,
      slot_index: assignment.slot_index,
      is_ready: false,
      is_captain: assignment.is_captain,
      elo_before: assignment.elo_before,
    })),
  );

  if (playersError) {
    throw new AppError(500, 'QUEUE_MATCH_PLAYERS_FAILED', playersError.message);
  }

  const { error: deleteError } = await serviceRoleClient.from('match_queue_entries').delete().in(
    'id',
    entries.map((entry) => entry.id),
  );

  if (deleteError) {
    throw new AppError(500, 'QUEUE_CONSUME_FAILED', deleteError.message);
  }

  await insertMatchEvent(match.id, 'lobby_created', null, {
    queue_type: 'public',
    mode,
    wager_amount: wagerAmount,
    region,
  });

  return getLobbyDetails(match.id);
}

async function tryCreateQueueMatch(mode: MatchMode, region: string, wagerAmount: number) {
  const candidates = await fetchQueueCandidates(mode, region, wagerAmount);
  const requiredPlayers = getModePlayerCount(mode);

  if (candidates.length < requiredPlayers) {
    return null;
  }

  const seedElo = candidates[0]?.profile.elo_rating ?? 1000;
  const eloAware = candidates.filter((entry) => Math.abs(entry.profile.elo_rating - seedElo) <= 300);
  const chosenEntries = (eloAware.length >= requiredPlayers ? eloAware : candidates).slice(0, requiredPlayers);

  if (chosenEntries.length < requiredPlayers) {
    return null;
  }

  return finalizePublicQueueMatch(mode, region, wagerAmount, chosenEntries);
}

export async function joinQueue(userId: string, profile: Profile, input: QueueJoinInput) {
  ensureKycVerified(profile);

  const activeMatch = await getActiveMatchForUser(userId);

  if (activeMatch) {
    throw new AppError(409, 'QUEUE_ALREADY_MATCHED', 'You already have an active match');
  }

  const existingQueueEntries = await getQueueEntries(userId);

  if (existingQueueEntries.length > 0) {
    throw new AppError(409, 'QUEUE_ALREADY_JOINED', 'Leave your current queue before joining another');
  }

  const queueEntryId = randomUUID();

  await lockStake(userId, queueEntryId, input.wager_amount, `queue:${queueEntryId}:lock`);

  const { error } = await serviceRoleClient.from('match_queue_entries').insert({
    id: queueEntryId,
    user_id: userId,
    match_mode: input.match_mode,
    wager_amount: input.wager_amount,
    region: input.region,
    elo_rating: profile.elo_rating,
  });

  if (error) {
    await releaseStake(userId, queueEntryId, input.wager_amount, `queue:${queueEntryId}:release`);
    throw new AppError(500, 'QUEUE_JOIN_FAILED', error.message);
  }

  await tryCreateQueueMatch(input.match_mode, input.region, input.wager_amount);
  return getMatchmakingSnapshot(userId);
}

export async function leaveQueue(userId: string) {
  const queueEntries = await getQueueEntries(userId);

  if (queueEntries.length === 0) {
    return;
  }

  for (const entry of queueEntries) {
    await serviceRoleClient.from('match_queue_entries').delete().eq('id', entry.id);
    await releaseStake(userId, entry.id, entry.wager_amount, `queue:${entry.id}:release`);
  }
}

export async function submitMatchResult(payload: MatchResultPayload) {
  const { data, error } = await serviceRoleClient.rpc('settle_match_result', {
    p_match_id: payload.match_id,
    p_winner_team: payload.winner_team,
    p_callback_key: payload.callback_signature,
    p_metadata: {
      stats: payload.stats,
    },
  });

  if (error) {
    throw new AppError(500, 'MATCH_SETTLE_FAILED', error.message);
  }

  const { error: statsError } = await serviceRoleClient.from('match_player_stats').upsert(
    payload.stats.map((stat) => ({
      match_id: payload.match_id,
      user_id: stat.user_id,
      kills: stat.kills,
      deaths: stat.deaths,
      assists: stat.assists,
      adr: stat.adr,
      headshot_pct: stat.headshot_pct,
    })),
  );

  if (statsError) {
    throw new AppError(500, 'MATCH_STATS_FAILED', statsError.message);
  }

  const { error: resultError } = await serviceRoleClient
    .from('match_results')
    .update({ stats: payload.stats })
    .eq('match_id', payload.match_id);

  if (resultError) {
    throw new AppError(500, 'MATCH_RESULT_UPDATE_FAILED', resultError.message);
  }

  return {
    settlement: asRow(data),
    lobby: await getLobbyDetails(payload.match_id),
  };
}
