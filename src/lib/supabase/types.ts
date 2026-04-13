export type HaRole = "user" | "moderator" | "admin";
export type HaKycStatus = "none" | "pending" | "verified" | "rejected";

export interface SupabaseProfileRecord {
  id: string;
  username: string;
  email: string;
  avatar_url?: string | null;
  cover_url?: string | null;
  role: HaRole;
  account_mode?: "live" | "demo";
  demo_stats?: {
    level?: number;
    rank?: string;
    winRate?: string;
    kdRatio?: number;
    headshotPct?: string;
    performance?: number[];
  } | null;
  level: number;
  kyc_status: HaKycStatus;
  kyc_message?: string | null;
  kyc_updated_at?: string | null;
  kyc_documents?: Record<string, string> | null;
  kyc_details?: Record<string, unknown> | null;
  bio?: string | null;
  country?: string | null;
  twitter?: string | null;
  twitch?: string | null;
  rank?: string | null;
  win_rate?: string | null;
  kd_ratio?: number | null;
  headshot_pct?: string | null;
  performance?: number[] | null;
}

export interface SupabaseWalletRecord {
  user_id: string;
  available_balance: number;
  locked_balance: number;
  demo_balance: number;
}

export type DepositRequestStatus = "pending" | "credited" | "rejected";

export interface DepositRequestRecord {
  id: number;
  user_id: string;
  amount_usdt: number;
  txid: string;
  network: string;
  to_wallet_address: string;
  from_wallet_address?: string | null;
  note?: string | null;
  status: DepositRequestStatus;
  admin_note?: string | null;
  requested_at: string;
  reviewed_at?: string | null;
  credited_at?: string | null;
  reviewed_by?: string | null;
}

export type WithdrawalRequestStatus = "pending" | "approved" | "rejected";

export interface WithdrawalRequestRecord {
  id: number;
  user_id: string;
  amount_usdt: number;
  network: string;
  destination_wallet_address: string;
  note?: string | null;
  status: WithdrawalRequestStatus;
  admin_note?: string | null;
  requested_at: string;
  reviewed_at?: string | null;
  approved_at?: string | null;
  reviewed_by?: string | null;
}

export type PayoutJobStatus = "queued" | "broadcasted" | "confirmed" | "failed" | "cancelled";

export interface PayoutJobRecord {
  id: number;
  withdrawal_request_id: number;
  user_id: string;
  amount_usdt: number;
  network: string;
  destination_wallet_address: string;
  status: PayoutJobStatus;
  txid?: string | null;
  failure_reason?: string | null;
  admin_note?: string | null;
  queued_at: string;
  broadcasted_at?: string | null;
  confirmed_at?: string | null;
  failed_at?: string | null;
  cancelled_at?: string | null;
  created_by?: string | null;
  updated_by?: string | null;
}

export interface MyProfileRpcRow {
  id: string;
  username: string;
  email: string;
  avatar_url?: string | null;
  cover_url?: string | null;
  role: HaRole;
  account_mode?: "live" | "demo";
  level: number;
  kyc_status: HaKycStatus;
  is_banned: boolean;
  suspended_until: string | null;
  cooldown_until: string | null;
  available_balance: number | null;
  locked_balance: number | null;
  demo_balance: number | null;
}
