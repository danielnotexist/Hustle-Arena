export type KYCStatus = 'not_started' | 'pending' | 'approved' | 'rejected';

export interface Profile {
  id: string;
  username: string;
  avatar_url?: string;
  elo_rating: number;
  kyc_status: KYCStatus;
  is_admin: boolean;
  created_at: string;
}

export interface Wallet {
  user_id: string;
  balance: number;
  locked_balance: number;
  currency: 'USDT';
}

export type TransactionType = 'deposit' | 'withdrawal' | 'wager_lock' | 'wager_win' | 'refund';
export type TransactionStatus = 'pending' | 'completed' | 'failed';

export interface Transaction {
  id: string;
  user_id: string;
  type: TransactionType;
  amount: number;
  status: TransactionStatus;
  tx_hash?: string;
  network?: 'TRC20' | 'BEP20';
  created_at: string;
}

export type MatchStatus = 'waiting' | 'live' | 'completed' | 'cancelled';

export interface Match {
  id: string;
  creator_id: string;
  game_type: 'CS2';
  wager_amount: number;
  status: MatchStatus;
  server_ip?: string;
  winner_team?: 'A' | 'B';
  created_at: string;
}

export interface MatchPlayer {
  match_id: string;
  user_id: string;
  team: 'A' | 'B';
}
