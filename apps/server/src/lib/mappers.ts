import type {
  Comment,
  DirectMessage,
  KycSubmission,
  LeaderboardEntry,
  MatchEvent,
  MatchLobby,
  MatchMapVote,
  MatchQueueEntry,
  MatchPlayerView,
  Post,
  Profile,
  RiskEvent,
  TopMatchEntry,
  WalletAuditLog,
  Wallet,
  WalletTransaction,
  WithdrawalRequest,
} from '@hustle-arena/shared-types';
import { asRow, toBooleanValue, toIsoString, toJsonObject, toNullableString, toNumberValue, toStringArray, toStringValue } from './parsers';

export function mapProfile(row: Record<string, unknown>, email?: string | null): Profile {
  return {
    id: toStringValue(row.id),
    email: email ?? toNullableString(row.email),
    username: toStringValue(row.username),
    display_name: toStringValue(row.display_name, toStringValue(row.username)),
    avatar_url: toNullableString(row.avatar_url),
    bio: toNullableString(row.bio),
    steam_handle: toNullableString(row.steam_handle),
    country_code: toNullableString(row.country_code),
    elo_rating: toNumberValue(row.elo_rating, 1000),
    rank_tier: toNullableString(row.rank_tier),
    kyc_status: (toStringValue(row.kyc_status, 'pending') as Profile['kyc_status']),
    kyc_rejection_reason: toNullableString(row.kyc_rejection_reason),
    is_admin: toBooleanValue(row.is_admin),
    is_vip: toBooleanValue(row.is_vip),
    vip_expires_at: toNullableString(row.vip_expires_at),
    total_matches: toNumberValue(row.total_matches),
    wins: toNumberValue(row.wins),
    losses: toNumberValue(row.losses),
    total_earnings: toNumberValue(row.total_earnings),
    total_volume: toNumberValue(row.total_volume),
    preferred_maps: toStringArray(row.preferred_maps) as Profile['preferred_maps'],
    created_at: toIsoString(row.created_at),
    updated_at: toIsoString(row.updated_at),
  };
}

export function mapWallet(row: Record<string, unknown>): Wallet {
  return {
    user_id: toStringValue(row.user_id),
    balance: toNumberValue(row.balance),
    locked_balance: toNumberValue(row.locked_balance),
    currency: 'USDT',
    updated_at: toIsoString(row.updated_at),
  };
}

export function mapWalletTransaction(row: Record<string, unknown>): WalletTransaction {
  return {
    id: toStringValue(row.id),
    user_id: toStringValue(row.user_id),
    type: toStringValue(row.type) as WalletTransaction['type'],
    amount: toNumberValue(row.amount),
    status: toStringValue(row.status) as WalletTransaction['status'],
    network: (toNullableString(row.network) as WalletTransaction['network']),
    tx_hash: toNullableString(row.tx_hash),
    idempotency_key: toNullableString(row.idempotency_key),
    reference_type: toNullableString(row.reference_type),
    reference_id: toNullableString(row.reference_id),
    balance_before: toNumberValue(row.balance_before),
    balance_after: toNumberValue(row.balance_after),
    locked_before: toNumberValue(row.locked_before),
    locked_after: toNumberValue(row.locked_after),
    notes: toNullableString(row.notes),
    metadata: toJsonObject(row.metadata),
    created_at: toIsoString(row.created_at),
    processed_at: toNullableString(row.processed_at),
  };
}

export function mapWalletAuditLog(row: Record<string, unknown>): WalletAuditLog {
  return {
    id: toStringValue(row.id),
    user_id: toStringValue(row.user_id),
    old_balance: toNumberValue(row.old_balance),
    new_balance: toNumberValue(row.new_balance),
    old_locked_balance: toNumberValue(row.old_locked_balance),
    new_locked_balance: toNumberValue(row.new_locked_balance),
    reason: toNullableString(row.reason),
    reference_id: toNullableString(row.reference_id),
    metadata: toJsonObject(row.metadata),
    created_at: toIsoString(row.created_at),
  };
}

export function mapWithdrawalRequest(row: Record<string, unknown>): WithdrawalRequest {
  return {
    id: toStringValue(row.id),
    user_id: toStringValue(row.user_id),
    amount: toNumberValue(row.amount),
    network: toStringValue(row.network) as WithdrawalRequest['network'],
    wallet_address: toStringValue(row.wallet_address),
    status: toStringValue(row.status) as WithdrawalRequest['status'],
    transaction_id: toNullableString(row.transaction_id),
    rejection_reason: toNullableString(row.rejection_reason),
    created_at: toIsoString(row.created_at),
    updated_at: toIsoString(row.updated_at),
  };
}

export function mapKycSubmission(row: Record<string, unknown>): KycSubmission {
  return {
    id: toStringValue(row.id),
    user_id: toStringValue(row.user_id),
    legal_name: toStringValue(row.legal_name),
    date_of_birth: toStringValue(row.date_of_birth),
    country_code: toStringValue(row.country_code),
    document_type: toStringValue(row.document_type),
    document_number: toStringValue(row.document_number),
    status: toStringValue(row.status) as KycSubmission['status'],
    notes: toNullableString(row.notes),
    reviewed_by: toNullableString(row.reviewed_by),
    reviewed_at: toNullableString(row.reviewed_at),
    created_at: toIsoString(row.created_at),
    updated_at: toIsoString(row.updated_at),
  };
}

export function mapMatch(row: Record<string, unknown>): MatchLobby {
  return {
    id: toStringValue(row.id),
    creator_id: toStringValue(row.creator_id),
    title: toStringValue(row.title, 'Arena Lobby'),
    queue_type: toStringValue(row.queue_type, 'custom') as MatchLobby['queue_type'],
    game_mode: toStringValue(row.game_mode, 'competitive') as MatchLobby['game_mode'],
    wager_amount: toNumberValue(row.wager_amount),
    status: toStringValue(row.status, 'forming') as MatchLobby['status'],
    phase: toStringValue(row.phase, 'team_select') as MatchLobby['phase'],
    region: toStringValue(row.region, 'global'),
    room_code: toNullableString(row.room_code),
    is_private: toBooleanValue(row.is_private),
    lobby_password: toNullableString(row.lobby_password),
    selected_map: (toNullableString(row.selected_map) as MatchLobby['selected_map']),
    map_pool: toStringArray(row.map_pool) as MatchLobby['map_pool'],
    server_ip: toNullableString(row.server_ip),
    server_callback_key: toNullableString(row.server_callback_key),
    winner_team: (toNullableString(row.winner_team) as MatchLobby['winner_team']),
    total_pool: toNumberValue(row.total_pool),
    platform_fee: toNumberValue(row.platform_fee),
    ready_deadline: toNullableString(row.ready_deadline),
    started_at: toNullableString(row.started_at),
    ended_at: toNullableString(row.ended_at),
    created_at: toIsoString(row.created_at),
    updated_at: toIsoString(row.updated_at),
  };
}

export function mapMatchPlayer(row: Record<string, unknown>): MatchPlayerView {
  const profileRow = asRow(row.profile);

  return {
    match_id: toStringValue(row.match_id),
    user_id: toStringValue(row.user_id),
    team: toStringValue(row.team, 'A') as MatchPlayerView['team'],
    slot_index: toNumberValue(row.slot_index),
    is_ready: toBooleanValue(row.is_ready),
    is_captain: toBooleanValue(row.is_captain),
    elo_before: row.elo_before === null ? null : toNumberValue(row.elo_before),
    elo_after: row.elo_after === null ? null : toNumberValue(row.elo_after),
    joined_at: toIsoString(row.joined_at),
    ready_at: toNullableString(row.ready_at),
    profile: Object.keys(profileRow).length
      ? {
          id: toStringValue(profileRow.id),
          username: toStringValue(profileRow.username),
          display_name: toStringValue(profileRow.display_name, toStringValue(profileRow.username)),
          avatar_url: toNullableString(profileRow.avatar_url),
          elo_rating: toNumberValue(profileRow.elo_rating, 1000),
          is_vip: toBooleanValue(profileRow.is_vip),
        }
      : undefined,
  };
}

export function mapVote(row: Record<string, unknown>): MatchMapVote {
  return {
    match_id: toStringValue(row.match_id),
    user_id: toStringValue(row.user_id),
    map_name: toStringValue(row.map_name) as MatchMapVote['map_name'],
    created_at: toIsoString(row.created_at),
  };
}

export function mapQueueEntry(row: Record<string, unknown>): MatchQueueEntry {
  return {
    id: toStringValue(row.id),
    user_id: toStringValue(row.user_id),
    match_mode: toStringValue(row.match_mode, 'competitive') as MatchQueueEntry['match_mode'],
    wager_amount: toNumberValue(row.wager_amount),
    region: toStringValue(row.region, 'global'),
    elo_rating: toNumberValue(row.elo_rating, 1000),
    queued_at: toIsoString(row.queued_at),
  };
}

export function mapEvent(row: Record<string, unknown>): MatchEvent {
  return {
    id: toStringValue(row.id),
    match_id: toStringValue(row.match_id),
    actor_id: toNullableString(row.actor_id),
    event_type: toStringValue(row.event_type) as MatchEvent['event_type'],
    payload: toJsonObject(row.payload),
    created_at: toIsoString(row.created_at),
  };
}

export function mapPost(row: Record<string, unknown>): Post {
  const authorRow = asRow(row.author);

  return {
    id: toStringValue(row.id),
    user_id: toStringValue(row.user_id),
    content: toStringValue(row.content),
    media_urls: toStringArray(row.media_urls),
    created_at: toIsoString(row.created_at),
    updated_at: toIsoString(row.updated_at),
    author: Object.keys(authorRow).length
      ? {
          id: toStringValue(authorRow.id),
          username: toStringValue(authorRow.username),
          display_name: toStringValue(authorRow.display_name, toStringValue(authorRow.username)),
          avatar_url: toNullableString(authorRow.avatar_url),
          elo_rating: toNumberValue(authorRow.elo_rating, 1000),
        }
      : undefined,
  };
}

export function mapComment(row: Record<string, unknown>): Comment {
  return {
    id: toStringValue(row.id),
    post_id: toStringValue(row.post_id),
    user_id: toStringValue(row.user_id),
    content: toStringValue(row.content),
    created_at: toIsoString(row.created_at),
  };
}

export function mapRiskEvent(row: Record<string, unknown>): RiskEvent {
  return {
    id: toStringValue(row.id),
    user_id: toNullableString(row.user_id),
    match_id: toNullableString(row.match_id),
    event_type: toStringValue(row.event_type) as RiskEvent['event_type'],
    severity: toStringValue(row.severity) as RiskEvent['severity'],
    payload: toJsonObject(row.payload),
    created_at: toIsoString(row.created_at),
  };
}

export function mapMessage(row: Record<string, unknown>): DirectMessage {
  return {
    id: toStringValue(row.id),
    sender_id: toStringValue(row.sender_id),
    receiver_id: toStringValue(row.receiver_id),
    match_id: toNullableString(row.match_id),
    content: toStringValue(row.content),
    team_only: toBooleanValue(row.team_only),
    created_at: toIsoString(row.created_at),
  };
}

export function mapLeaderboardEntry(row: Record<string, unknown>): LeaderboardEntry {
  return {
    user_id: toStringValue(row.id),
    username: toStringValue(row.username),
    avatar_url: toNullableString(row.avatar_url),
    value: toNumberValue(row.total_earnings),
    label: 'earnings',
  };
}

export function mapTopMatchEntry(row: Record<string, unknown>): TopMatchEntry {
  return {
    match_id: toStringValue(row.id),
    title: toStringValue(row.title, 'Arena Lobby'),
    wager_amount: toNumberValue(row.wager_amount),
    total_pool: toNumberValue(row.total_pool),
    selected_map: (toNullableString(row.selected_map) as TopMatchEntry['selected_map']),
    created_at: toIsoString(row.created_at),
  };
}
