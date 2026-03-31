export const MAP_POOL = [
  'Dust2',
  'Inferno',
  'Nuke',
  'Mirage',
  'Vertigo',
  'Ancient',
  'Cache',
] as const;

export const MATCH_MODES = ['competitive', 'wingman', 'ffa'] as const;
export const QUEUE_TYPES = ['public', 'custom'] as const;
export const MATCH_PHASES = ['team_select', 'ready_check', 'map_vote', 'starting', 'live', 'results'] as const;
export const MATCH_STATUSES = ['forming', 'ready_check', 'map_vote', 'live', 'completed', 'cancelled'] as const;
export const MATCH_TEAMS = ['A', 'B', 'solo'] as const;
export const MATCH_EVENT_TYPES = [
  'lobby_created',
  'player_joined',
  'player_left',
  'team_changed',
  'ready_toggled',
  'map_voted',
  'match_started',
  'match_finished',
  'risk_hook_emitted',
] as const;
export const KYC_STATUSES = ['pending', 'verified', 'rejected'] as const;
export const TRANSACTION_TYPES = [
  'deposit',
  'withdraw_request',
  'withdraw_complete',
  'withdraw_rejected',
  'stake_lock',
  'stake_release',
  'match_payout',
  'vip_purchase',
  'adjustment',
] as const;
export const TRANSACTION_STATUSES = ['pending', 'completed', 'failed', 'cancelled'] as const;
export const SUPPORTED_NETWORKS = ['TRC20', 'BEP20'] as const;
export const FRIENDSHIP_STATUSES = ['pending', 'accepted', 'blocked'] as const;
export const VIP_PLANS = ['monthly', 'yearly'] as const;
export const RISK_EVENT_TYPES = ['anti_cheat', 'fraud_signal', 'wallet_alert', 'ops_review'] as const;
export const RISK_SEVERITIES = ['low', 'medium', 'high'] as const;

export type MapName = (typeof MAP_POOL)[number];
export type MatchMode = (typeof MATCH_MODES)[number];
export type QueueType = (typeof QUEUE_TYPES)[number];
export type MatchPhase = (typeof MATCH_PHASES)[number];
export type MatchStatus = (typeof MATCH_STATUSES)[number];
export type MatchTeam = (typeof MATCH_TEAMS)[number];
export type MatchEventType = (typeof MATCH_EVENT_TYPES)[number];
export type KycStatus = (typeof KYC_STATUSES)[number];
export type TransactionType = (typeof TRANSACTION_TYPES)[number];
export type TransactionStatus = (typeof TRANSACTION_STATUSES)[number];
export type SupportedNetwork = (typeof SUPPORTED_NETWORKS)[number];
export type FriendshipStatus = (typeof FRIENDSHIP_STATUSES)[number];
export type VipPlan = (typeof VIP_PLANS)[number];
export type RiskEventType = (typeof RISK_EVENT_TYPES)[number];
export type RiskSeverity = (typeof RISK_SEVERITIES)[number];

export interface ApiResponse<T> {
  data: T;
  message?: string;
}

export interface ApiErrorShape {
  message: string;
  code?: string;
  details?: Record<string, unknown>;
}

export interface Profile {
  id: string;
  email?: string | null;
  username: string;
  display_name: string;
  avatar_url: string | null;
  bio: string | null;
  steam_handle: string | null;
  country_code: string | null;
  elo_rating: number;
  rank_tier: string | null;
  kyc_status: KycStatus;
  kyc_rejection_reason: string | null;
  is_admin: boolean;
  is_vip: boolean;
  vip_expires_at: string | null;
  total_matches: number;
  wins: number;
  losses: number;
  total_earnings: number;
  total_volume: number;
  preferred_maps: MapName[];
  created_at: string;
  updated_at: string;
}

export interface Wallet {
  user_id: string;
  balance: number;
  locked_balance: number;
  currency: 'USDT';
  updated_at: string;
}

export interface WalletTransaction {
  id: string;
  user_id: string;
  type: TransactionType;
  amount: number;
  status: TransactionStatus;
  network: SupportedNetwork | null;
  tx_hash: string | null;
  idempotency_key: string | null;
  reference_type: string | null;
  reference_id: string | null;
  balance_before: number;
  balance_after: number;
  locked_before: number;
  locked_after: number;
  notes: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  processed_at: string | null;
}

export interface WalletAuditLog {
  id: string;
  user_id: string;
  old_balance: number;
  new_balance: number;
  old_locked_balance: number;
  new_locked_balance: number;
  reason: string | null;
  reference_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface KycSubmission {
  id: string;
  user_id: string;
  legal_name: string;
  date_of_birth: string;
  country_code: string;
  document_type: string;
  document_number: string;
  status: KycStatus;
  notes: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface WithdrawalRequest {
  id: string;
  user_id: string;
  amount: number;
  network: SupportedNetwork;
  wallet_address: string;
  status: 'pending' | 'processing' | 'completed' | 'rejected';
  transaction_id: string | null;
  rejection_reason: string | null;
  created_at: string;
  updated_at: string;
}

export interface VipSubscription {
  id: string;
  user_id: string;
  plan_type: VipPlan;
  amount_paid: number;
  created_at: string;
  expires_at: string;
}

export interface MatchLobby {
  id: string;
  creator_id: string;
  title: string;
  queue_type: QueueType;
  game_mode: MatchMode;
  wager_amount: number;
  status: MatchStatus;
  phase: MatchPhase;
  region: string;
  room_code: string | null;
  is_private: boolean;
  lobby_password: string | null;
  selected_map: MapName | null;
  map_pool: MapName[];
  server_ip: string | null;
  server_callback_key: string | null;
  winner_team: MatchTeam | null;
  total_pool: number;
  platform_fee: number;
  ready_deadline: string | null;
  started_at: string | null;
  ended_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface MatchQueueEntry {
  id: string;
  user_id: string;
  match_mode: MatchMode;
  wager_amount: number;
  region: string;
  elo_rating: number;
  queued_at: string;
}

export interface MatchPlayer {
  match_id: string;
  user_id: string;
  team: MatchTeam;
  slot_index: number;
  is_ready: boolean;
  is_captain: boolean;
  elo_before: number | null;
  elo_after: number | null;
  joined_at: string;
  ready_at: string | null;
}

export interface MatchPlayerView extends MatchPlayer {
  profile?: Pick<Profile, 'id' | 'username' | 'display_name' | 'avatar_url' | 'elo_rating' | 'is_vip'>;
}

export interface MatchMapVote {
  match_id: string;
  user_id: string;
  map_name: MapName;
  created_at: string;
}

export interface MatchEvent {
  id: string;
  match_id: string;
  actor_id: string | null;
  event_type: MatchEventType;
  payload: Record<string, unknown>;
  created_at: string;
}

export interface MatchLobbyDetails {
  match: MatchLobby;
  players: MatchPlayerView[];
  votes: MatchMapVote[];
  events: MatchEvent[];
}

export interface MatchStatLine {
  user_id: string;
  kills: number;
  deaths: number;
  assists: number;
  adr: number;
  headshot_pct: number;
}

export interface MatchResultPayload {
  match_id: string;
  winner_team: Exclude<MatchTeam, 'solo'>;
  stats: MatchStatLine[];
  callback_signature: string;
}

export interface LeaderboardEntry {
  user_id: string;
  username: string;
  avatar_url: string | null;
  value: number;
  label: string;
}

export interface TopMatchEntry {
  match_id: string;
  title: string;
  wager_amount: number;
  total_pool: number;
  selected_map: MapName | null;
  created_at: string;
}

export interface Post {
  id: string;
  user_id: string;
  content: string;
  media_urls: string[];
  created_at: string;
  updated_at: string;
  author?: Pick<Profile, 'id' | 'username' | 'display_name' | 'avatar_url' | 'elo_rating'>;
}

export interface Comment {
  id: string;
  post_id: string;
  user_id: string;
  content: string;
  created_at: string;
}

export interface Friendship {
  user_id: string;
  friend_id: string;
  status: FriendshipStatus;
  created_at: string;
}

export interface DirectMessage {
  id: string;
  sender_id: string;
  receiver_id: string;
  match_id: string | null;
  content: string;
  team_only: boolean;
  created_at: string;
}

export interface RiskEvent {
  id: string;
  user_id: string | null;
  match_id: string | null;
  event_type: RiskEventType;
  severity: RiskSeverity;
  payload: Record<string, unknown>;
  created_at: string;
}

export interface DashboardSnapshot {
  profile: Profile;
  wallet: Wallet;
  activeMatches: MatchLobby[];
  transactions: WalletTransaction[];
  topEarners: LeaderboardEntry[];
  topMatches: TopMatchEntry[];
}

export interface AppBootstrapPayload {
  viewer: Profile;
  wallet: Wallet;
  transactions: WalletTransaction[];
  activeMatches: MatchLobby[];
  communityPosts: Post[];
  friends: Profile[];
  inbox: DirectMessage[];
  topEarners: LeaderboardEntry[];
  topMatches: TopMatchEntry[];
}

export interface MatchmakingSnapshot {
  activeMatch: MatchLobbyDetails | null;
  openLobbies: MatchLobby[];
  queueEntries: MatchQueueEntry[];
}

export interface CreatePostInput {
  content: string;
  media_urls?: string[];
}

export interface DepositInput {
  amount: number;
  network: SupportedNetwork;
  tx_hash?: string;
  idempotency_key: string;
}

export interface WithdrawalInput {
  amount: number;
  network: SupportedNetwork;
  wallet_address: string;
  idempotency_key: string;
}

export interface VipPurchaseInput {
  plan_type: VipPlan;
  idempotency_key: string;
}

export interface KycSubmissionInput {
  legal_name: string;
  date_of_birth: string;
  country_code: string;
  document_type: string;
  document_number: string;
}

export interface CreateLobbyInput {
  title: string;
  queue_type: QueueType;
  game_mode: MatchMode;
  wager_amount: number;
  region: string;
  is_private: boolean;
  lobby_password?: string;
  map_pool: MapName[];
}

export interface QueueJoinInput {
  match_mode: MatchMode;
  wager_amount: number;
  region: string;
}

export interface SendMessageInput {
  receiver_id?: string;
  match_id?: string;
  content: string;
  team_only?: boolean;
}

export interface FriendRequestInput {
  friend_id: string;
}

export const VIP_PRICES: Record<VipPlan, number> = {
  monthly: 30,
  yearly: 300,
};

export function getModePlayerCount(mode: MatchMode): number {
  if (mode === 'competitive') {
    return 10;
  }

  if (mode === 'wingman') {
    return 4;
  }

  return 8;
}

export function isVipActive(vipExpiresAt: string | null | undefined, now = new Date()): boolean {
  if (!vipExpiresAt) {
    return false;
  }

  return new Date(vipExpiresAt).getTime() > now.getTime();
}

export function calculateWinnerPayout(input: {
  stake: number;
  players: number;
  winners: number;
  vipActive: boolean;
}): {
  gross: number;
  fee: number;
  net: number;
} {
  const gross = (input.stake * input.players) / input.winners;
  const fee = input.vipActive ? 0 : gross * 0.1;

  return {
    gross,
    fee,
    net: gross - fee,
  };
}
