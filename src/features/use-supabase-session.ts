import { useEffect, useState } from "react";
import { isSupabaseAbortError, supabase } from "../lib/supabase";
import {
  fetchExtendedProfile,
  fetchMyProfile,
  fetchWallet,
  mapSupabaseProfileToArenaUser,
  mapSupabaseProfileToProfileData,
  mapSupabaseProfileToStats,
  mapWalletSnapshot,
  setDemoBalance,
  updateAccountMode,
} from "../lib/supabase/profile";
import type { AccountMode, PlatformSessionState, ProfileData, WalletSnapshot, UserStats } from "./types";
import { DEFAULT_PROFILE_DATA, DEFAULT_STATS, DEFAULT_WALLET } from "./use-legacy-firebase-session";

export function useSupabaseSession(enabled = true): PlatformSessionState {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [user, setUser] = useState<PlatformSessionState["user"]>(null);
  const [liveStats, setLiveStats] = useState<UserStats>(DEFAULT_STATS);
  const [demoStats, setDemoStats] = useState<UserStats>({ ...DEFAULT_STATS, rank: "Demo Cadet" });
  const [wallet, setWallet] = useState<WalletSnapshot>(DEFAULT_WALLET);
  const [profileData, setProfileData] = useState<ProfileData>(DEFAULT_PROFILE_DATA);
  const [accountMode, setAccountMode] = useState<AccountMode>("live");

  const hydrateSession = async (isCancelled = false) => {
    if (!enabled) {
      return;
    }

    let session: Awaited<ReturnType<typeof supabase.auth.getSession>>["data"]["session"] | null = null;

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      session = sessionData.session;
    } catch (error) {
      if (isSupabaseAbortError(error)) {
        return;
      }
      throw error;
    }

    if (!session?.user) {
      if (!isCancelled) {
        setIsLoggedIn(false);
        setIsAdmin(false);
        setUser(null);
        setLiveStats(DEFAULT_STATS);
        setDemoStats({ ...DEFAULT_STATS, rank: "Demo Cadet" });
        setWallet(DEFAULT_WALLET);
        setProfileData(DEFAULT_PROFILE_DATA);
        setAccountMode("live");
      }
      return;
    }

    try {
      const userId = session.user.id;
      const myProfile = await fetchMyProfile();
      const fullProfile = myProfile ? await fetchExtendedProfile(userId) : await fetchExtendedProfile(userId);
      const walletRow = await fetchWallet(userId);

      if (isCancelled) {
        return;
      }

      const nextUser = mapSupabaseProfileToArenaUser(fullProfile);
      setIsLoggedIn(true);
      setIsAdmin(nextUser.role === "admin");
      setUser(nextUser);
      setLiveStats(mapSupabaseProfileToStats(fullProfile, walletRow, "live"));
      setDemoStats(mapSupabaseProfileToStats(fullProfile, walletRow, "demo"));
      setWallet(mapWalletSnapshot(walletRow));
      setProfileData(mapSupabaseProfileToProfileData(fullProfile));
      setAccountMode(nextUser.accountMode || "live");
    } catch (error) {
      if (isSupabaseAbortError(error)) {
        return;
      }
      console.error("Supabase session hydrate error:", error);
      if (!isCancelled) {
        setIsLoggedIn(false);
        setIsAdmin(false);
        setUser(null);
      }
    }
  };

  useEffect(() => {
    if (!enabled) {
      return;
    }

    let isCancelled = false;

    void hydrateSession(isCancelled);

    const { data: authListener } = supabase.auth.onAuthStateChange(() => {
      void hydrateSession();
    });

    return () => {
      isCancelled = true;
      authListener.subscription.unsubscribe();
    };
  }, [enabled]);

  const switchAccountMode = async (mode: AccountMode) => {
    if (!user?.id) {
      throw new Error("You must be logged in to switch account modes.");
    }

    await updateAccountMode(user.id, mode);
    setAccountMode(mode);
    setUser((currentUser) => (currentUser ? { ...currentUser, accountMode: mode } : currentUser));
  };

  const topUpDemoBalance = async (amount: number) => {
    if (!user?.id) {
      throw new Error("You must be logged in to update demo balance.");
    }
    const safeAmount = Number(amount);
    if (!Number.isFinite(safeAmount) || safeAmount <= 0) {
      throw new Error("Top-up amount must be greater than zero.");
    }

    await setDemoBalance(user.id, wallet.demoBalance + safeAmount);
    await hydrateSession();
  };

  return {
    authProvider: "supabase",
    isLoggedIn,
    isAdmin,
    user,
    stats: accountMode === "demo" ? demoStats : liveStats,
    wallet,
    accountMode,
    visibleBalance: accountMode === "demo" ? wallet.demoBalance : wallet.availableBalance,
    profileData,
    setProfileData,
    switchAccountMode,
    topUpDemoBalance,
    refreshSession: async () => {
      await hydrateSession();
    },
  };
}
