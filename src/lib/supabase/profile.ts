import type { AccountMode, ArenaUser, ProfileData, UserStats, WalletSnapshot } from "../../features/types";
import { normalizeSelectableCountry } from "../countries";
import { supabase } from "../supabase";
import type { MyProfileRpcRow, SupabaseProfileRecord, SupabaseWalletRecord } from "./types";

export async function fetchMyProfile() {
  const { data, error } = await supabase.rpc("get_my_profile");
  if (error) {
    throw error;
  }

  const row = Array.isArray(data) ? (data[0] as MyProfileRpcRow | undefined) : undefined;
  return row || null;
}

export async function ensureMyPlatformAccount() {
  const { error } = await supabase.rpc("ensure_my_platform_account");
  if (error) {
    throw error;
  }
}

export async function fetchExtendedProfile(userId: string) {
  const { data, error } = await supabase
    .from("profiles")
    .select("id, username, email, avatar_url, cover_url, role, account_mode, demo_stats, level, kyc_status, kyc_message, kyc_updated_at, kyc_documents, kyc_details, bio, country, twitter, twitch, rank, win_rate, kd_ratio, headshot_pct, performance")
    .eq("id", userId)
    .single();

  if (error) {
    throw error;
  }

  return data as SupabaseProfileRecord;
}

export async function fetchWallet(userId: string) {
  const { data, error } = await supabase
    .from("wallets")
    .select("user_id, available_balance, locked_balance, demo_balance")
    .eq("user_id", userId)
    .single();

  if (error) {
    throw error;
  }

  return data as SupabaseWalletRecord;
}

export function mapSupabaseProfileToArenaUser(profile: SupabaseProfileRecord | MyProfileRpcRow): ArenaUser {
  return {
    id: profile.id,
    username: profile.username,
    email: profile.email,
    avatarUrl: ("avatar_url" in profile ? profile.avatar_url : null) || null,
    role: profile.role,
    kycStatus: profile.kyc_status,
    kycMessage: "kyc_message" in profile ? profile.kyc_message || null : null,
    accountMode: profile.account_mode || "live",
  };
}

export function mapSupabaseProfileToProfileData(profile: Partial<SupabaseProfileRecord>): ProfileData {
  return {
    bio: profile.bio || "Ready to dominate the arena. Tactical shooter veteran.",
    country: normalizeSelectableCountry(profile.country),
    twitter: profile.twitter || "",
    twitch: profile.twitch || "",
    avatarUrl: profile.avatar_url || "",
    coverUrl: profile.cover_url || "",
  };
}

export function mapSupabaseProfileToStats(
  profile: Partial<SupabaseProfileRecord>,
  wallet?: Partial<SupabaseWalletRecord>,
  mode: AccountMode = "live",
): UserStats {
  const demoStats = profile.demo_stats || {};
  if (mode === "demo") {
    return {
      credits: wallet?.demo_balance ?? 0,
      level: demoStats.level ?? 1,
      rank: demoStats.rank || "Demo Cadet",
      winRate: demoStats.winRate || "0%",
      kdRatio: demoStats.kdRatio ?? 0,
      headshotPct: demoStats.headshotPct || "0%",
      performance: demoStats.performance || [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    };
  }

  return {
    credits: wallet?.available_balance ?? 0,
    level: profile.level ?? 1,
    rank: profile.rank || "Bronze I",
    winRate: profile.win_rate || "0%",
    kdRatio: profile.kd_ratio ?? 0,
    headshotPct: profile.headshot_pct || "0%",
    performance: profile.performance || [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  };
}

export function mapWalletSnapshot(wallet?: Partial<SupabaseWalletRecord> | Partial<MyProfileRpcRow>): WalletSnapshot {
  return {
    availableBalance: wallet?.available_balance ?? 0,
    lockedBalance: wallet?.locked_balance ?? 0,
    demoBalance: wallet?.demo_balance ?? 0,
  };
}

export async function updateProfileBasics(userId: string, profile: ProfileData) {
  const { error } = await supabase
    .from("profiles")
    .update({
      bio: profile.bio,
      country: normalizeSelectableCountry(profile.country),
      twitter: profile.twitter,
      twitch: profile.twitch,
      avatar_url: profile.avatarUrl?.trim() || null,
      cover_url: profile.coverUrl?.trim() || null,
    })
    .eq("id", userId);

  if (error) {
    throw error;
  }
}

export async function updateAccountMode(userId: string, accountMode: AccountMode) {
  const { error } = await supabase
    .from("profiles")
    .update({
      account_mode: accountMode,
    })
    .eq("id", userId);

  if (error) {
    throw error;
  }
}

export async function setDemoBalance(_userId: string, amount: number) {
  const safeAmount = Number(amount);
  if (!Number.isFinite(safeAmount) || safeAmount < 0) {
    throw new Error("Demo balance must be a non-negative amount.");
  }

  const { error } = await supabase.rpc("set_my_demo_balance", {
    p_amount: safeAmount,
  });

  if (error) {
    throw error;
  }
}

export async function submitKycForReview(
  userId: string,
  documents: Record<string, string>,
  details: Record<string, unknown>
) {
  const { error } = await supabase
    .from("profiles")
    .update({
      kyc_status: "pending",
      kyc_updated_at: new Date().toISOString(),
      kyc_message: null,
      kyc_documents: documents,
      kyc_details: details,
    })
    .eq("id", userId);

  if (error) {
    throw error;
  }
}

export async function fetchAdminProfiles() {
  const [{ data: profiles, error: profilesError }, { data: wallets, error: walletsError }] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, username, email, role, level, kyc_status, kyc_message, kyc_updated_at, kyc_documents, kyc_details, rank, win_rate, kd_ratio, headshot_pct, performance")
      .order("created_at", { ascending: false }),
    supabase
      .from("wallets")
      .select("user_id, available_balance, locked_balance, demo_balance"),
  ]);

  if (profilesError) throw profilesError;
  if (walletsError) throw walletsError;

  const walletByUserId = new Map((wallets || []).map((wallet) => [wallet.user_id, wallet]));

  return (profiles || []).map((profile) => {
    const wallet = walletByUserId.get(profile.id);
    return {
      id: profile.id,
      username: profile.username,
      email: profile.email,
      role: profile.role,
      kycStatus: profile.kyc_status,
      kycMessage: profile.kyc_message,
      kycUpdatedAt: profile.kyc_updated_at,
      kycDocuments: profile.kyc_documents,
      kycDetails: profile.kyc_details,
      stats: {
        credits: wallet?.available_balance ?? 0,
        level: profile.level ?? 1,
        rank: profile.rank || "Bronze I",
        winRate: profile.win_rate || "0%",
        kdRatio: profile.kd_ratio ?? 0,
        headshotPct: profile.headshot_pct || "0%",
        performance: profile.performance || [],
      },
    };
  });
}

export async function updateAdminUserField(userId: string, field: string, value: any) {
  if (field === "stats") {
    const statsUpdate = value || {};
    const [{ error: walletError }, { error: profileError }] = await Promise.all([
      supabase
        .from("wallets")
        .update({
          available_balance: statsUpdate.credits ?? 0,
        })
        .eq("user_id", userId),
      supabase
        .from("profiles")
        .update({
          level: statsUpdate.level ?? 1,
          rank: statsUpdate.rank || "Bronze I",
          win_rate: statsUpdate.winRate || "0%",
          kd_ratio: statsUpdate.kdRatio ?? 0,
          headshot_pct: statsUpdate.headshotPct || "0%",
        })
        .eq("id", userId),
    ]);

    if (walletError) throw walletError;
    if (profileError) throw profileError;
    return;
  }

  const profileFieldMap: Record<string, string> = {
    role: "role",
    kycStatus: "kyc_status",
    kycMessage: "kyc_message",
  };

  const dbField = profileFieldMap[field];
  if (!dbField) {
    throw new Error(`Unsupported admin field update: ${field}`);
  }

  const { error } = await supabase
    .from("profiles")
    .update({ [dbField]: value })
    .eq("id", userId);

  if (error) {
    throw error;
  }
}

export async function updateAdminKycStatus(userId: string, status: "verified" | "rejected", reason?: string | null) {
  const { error } = await supabase
    .from("profiles")
    .update({
      kyc_status: status,
      kyc_updated_at: new Date().toISOString(),
      kyc_message: status === "rejected" ? reason || "KYC rejected." : null,
    })
    .eq("id", userId);

  if (error) {
    throw error;
  }
}
