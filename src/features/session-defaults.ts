import type { ProfileData, UserStats, WalletSnapshot } from "./types";

export const DEFAULT_STATS: UserStats = {
  credits: 0,
  level: 1,
  rank: "Bronze I",
  winRate: "0%",
  kdRatio: 0,
  headshotPct: "0%",
  performance: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
};

export const DEFAULT_PROFILE_DATA: ProfileData = {
  bio: "Ready to dominate the arena. Tactical shooter veteran.",
  country: "Israel",
  twitter: "",
  twitch: "",
  avatarUrl: "",
  coverUrl: "",
  steamId64: "",
  steamVerified: false,
  steamLinkedAt: null,
  steamLastVerifiedAt: null,
  steamAvatarUrl: null,
  steamMemberSince: null,
  steamProfileUrl: null,
};

export const DEFAULT_WALLET: WalletSnapshot = {
  availableBalance: 0,
  lockedBalance: 0,
  demoBalance: 0,
};
