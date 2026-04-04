import type { Dispatch, SetStateAction } from "react";

export interface UserStats {
  credits: number;
  level: number;
  rank: string;
  winRate: string;
  kdRatio: number;
  headshotPct: string;
  performance?: number[];
}

export interface ProfileData {
  bio: string;
  country: string;
  twitter: string;
  twitch: string;
}

export interface ArenaUser {
  id: string;
  username: string;
  email: string;
  role: string;
  kycStatus: string;
  kycMessage?: string | null;
  accountMode?: AccountMode;
}

export interface WalletSnapshot {
  availableBalance: number;
  lockedBalance: number;
  demoBalance: number;
}

export interface DepositRequestView {
  id: number;
  amountUsdt: number;
  txid: string;
  network: string;
  toWalletAddress: string;
  fromWalletAddress?: string | null;
  note?: string | null;
  status: "pending" | "credited" | "rejected";
  adminNote?: string | null;
  requestedAt: string;
  reviewedAt?: string | null;
}

export interface WithdrawalRequestView {
  id: number;
  amountUsdt: number;
  network: string;
  destinationWalletAddress: string;
  note?: string | null;
  status: "pending" | "approved" | "rejected";
  adminNote?: string | null;
  requestedAt: string;
  reviewedAt?: string | null;
  payoutStatus?: "queued" | "broadcasted" | "confirmed" | "failed" | "cancelled" | null;
  payoutTxid?: string | null;
  payoutFailureReason?: string | null;
}

export interface PayoutJobView {
  id: number;
  withdrawalRequestId: number;
  userId: string;
  username?: string | null;
  email?: string | null;
  amountUsdt: number;
  network: string;
  destinationWalletAddress: string;
  status: "queued" | "broadcasted" | "confirmed" | "failed" | "cancelled";
  txid?: string | null;
  failureReason?: string | null;
  adminNote?: string | null;
  queuedAt: string;
  broadcastedAt?: string | null;
  confirmedAt?: string | null;
  failedAt?: string | null;
}

export type AuthProvider = "firebase" | "supabase";
export type AccountMode = "live" | "demo";

export interface PlatformSessionState {
  authProvider: AuthProvider;
  isLoggedIn: boolean;
  isAdmin: boolean;
  user: ArenaUser | null;
  stats: UserStats;
  wallet: WalletSnapshot;
  accountMode: AccountMode;
  visibleBalance: number;
  profileData: ProfileData;
  setProfileData: Dispatch<SetStateAction<ProfileData>>;
  switchAccountMode: (mode: AccountMode) => Promise<void>;
  topUpDemoBalance: (amount: number) => Promise<void>;
}

export interface Mission {
  id: number;
  title: string;
  reward: number;
  difficulty: string;
  time: string;
}

export interface Toast {
  id: number;
  message: string;
  type: 'success' | 'error' | 'info';
}
