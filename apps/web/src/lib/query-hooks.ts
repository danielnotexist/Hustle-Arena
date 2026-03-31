import { useQuery } from '@tanstack/react-query'
import type {
  AdminDashboardPayload,
  AppBootstrapPayload,
  DirectMessage,
  KycSubmission,
  LeaderboardEntry,
  MatchmakingSnapshot,
  Post,
  Profile,
  SupportedNetwork,
  TopMatchEntry,
  Wallet,
  WalletAuditLog,
  WalletTransaction,
  WithdrawalRequest,
} from '@hustle-arena/shared-types'
import { apiRequest } from './api'

export interface WalletRouteData {
  wallet: Wallet
  transactions: WalletTransaction[]
  withdrawals: WithdrawalRequest[]
  auditLogs: WalletAuditLog[]
  deposit_addresses: Record<SupportedNetwork, string>
}

export interface CommunityRouteData {
  posts: Post[]
  friends: Profile[]
}

export interface ChatRouteData {
  inbox: DirectMessage[]
  friends: Profile[]
}

export interface LeaderboardRouteData {
  topEarners: LeaderboardEntry[]
  topMatches: TopMatchEntry[]
}

export function useBootstrapQuery() {
  return useQuery({
    queryKey: ['bootstrap'],
    queryFn: () => apiRequest<AppBootstrapPayload>('/bootstrap'),
  })
}

export function useAdminQuery(enabled = true) {
  return useQuery({
    queryKey: ['admin'],
    queryFn: () => apiRequest<AdminDashboardPayload>('/admin'),
    enabled,
  })
}

export function useWalletQuery() {
  return useQuery({
    queryKey: ['wallet'],
    queryFn: () => apiRequest<WalletRouteData>('/wallet'),
  })
}

export function useCommunityQuery() {
  return useQuery({
    queryKey: ['community'],
    queryFn: () => apiRequest<CommunityRouteData>('/community'),
  })
}

export function useChatQuery() {
  return useQuery({
    queryKey: ['chat'],
    queryFn: () => apiRequest<ChatRouteData>('/chat'),
  })
}

export function useLeaderboardQuery() {
  return useQuery({
    queryKey: ['leaderboard'],
    queryFn: () => apiRequest<LeaderboardRouteData>('/leaderboard'),
  })
}

export function useMatchmakingQuery() {
  return useQuery({
    queryKey: ['matchmaking'],
    queryFn: () => apiRequest<MatchmakingSnapshot>('/matchmaking'),
  })
}

export function useKycQuery() {
  return useQuery({
    queryKey: ['kyc'],
    queryFn: () => apiRequest<KycSubmission | null>('/kyc'),
  })
}
