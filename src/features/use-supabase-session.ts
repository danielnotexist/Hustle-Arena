import { useEffect, useRef, useState } from "react";
import {
  isSupabaseAbortError,
  isSupabaseMissingRowError,
  isSupabaseTransientNetworkError,
  supabase,
} from "../lib/supabase";
import {
  ensureMyPlatformAccount,
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
import type {
  AccountMode,
  PlatformSessionState,
  ProfileData,
  SessionStatus,
  WalletSnapshot,
  UserStats,
} from "./types";
import { DEFAULT_PROFILE_DATA, DEFAULT_STATS, DEFAULT_WALLET } from "./use-legacy-firebase-session";

export function useSupabaseSession(enabled = true): PlatformSessionState {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [user, setUser] = useState<PlatformSessionState["user"]>(null);
  const [sessionStatus, setSessionStatus] = useState<SessionStatus>(enabled ? "loading" : "ready");
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [liveStats, setLiveStats] = useState<UserStats>(DEFAULT_STATS);
  const [demoStats, setDemoStats] = useState<UserStats>({ ...DEFAULT_STATS, rank: "Demo Cadet" });
  const [wallet, setWallet] = useState<WalletSnapshot>(DEFAULT_WALLET);
  const [profileData, setProfileData] = useState<ProfileData>(DEFAULT_PROFILE_DATA);
  const [accountMode, setAccountMode] = useState<AccountMode>("live");
  const hasActiveSessionRef = useRef(false);
  const hydrateSessionInFlightRef = useRef<Promise<void> | null>(null);

  useEffect(() => {
    hasActiveSessionRef.current = Boolean(user);
  }, [user]);

  const resetSessionData = () => {
    setIsLoggedIn(false);
    setIsAdmin(false);
    setUser(null);
    setLiveStats(DEFAULT_STATS);
    setDemoStats({ ...DEFAULT_STATS, rank: "Demo Cadet" });
    setWallet(DEFAULT_WALLET);
    setProfileData(DEFAULT_PROFILE_DATA);
    setAccountMode("live");
  };

  const applySessionData = (
    fullProfile: Awaited<ReturnType<typeof fetchExtendedProfile>>,
    walletRow: Awaited<ReturnType<typeof fetchWallet>>,
  ) => {
    const nextUser = mapSupabaseProfileToArenaUser(fullProfile);
    setIsLoggedIn(true);
    setIsAdmin(nextUser.role === "admin");
    setUser(nextUser);
    setLiveStats(mapSupabaseProfileToStats(fullProfile, walletRow, "live"));
    setDemoStats(mapSupabaseProfileToStats(fullProfile, walletRow, "demo"));
    setWallet(mapWalletSnapshot(walletRow));
    setProfileData(mapSupabaseProfileToProfileData(fullProfile));
    setAccountMode(nextUser.accountMode || "live");
  };

  const withTransientRetry = async <T,>(operation: () => Promise<T>) => {
    try {
      return await operation();
    } catch (error) {
      if (!isSupabaseTransientNetworkError(error)) {
        throw error;
      }
      return operation();
    }
  };

  const loadPlatformAccount = async (userId: string) => {
    const myProfile = await fetchMyProfile();

    if (!myProfile) {
      throw new Error("Missing platform profile bootstrap.");
    }

    try {
      const [fullProfile, walletRow] = await Promise.all([
        fetchExtendedProfile(userId),
        fetchWallet(userId),
      ]);

      return { fullProfile, walletRow };
    } catch (error) {
      if (isSupabaseMissingRowError(error)) {
        throw new Error("Missing platform wallet bootstrap.");
      }
      throw error;
    }
  };

  const loadOrRepairPlatformAccount = async (userId: string) => {
    try {
      return await withTransientRetry(() => loadPlatformAccount(userId));
    } catch (error) {
      const isMissingAccount = isSupabaseMissingRowError(error) || String((error as any)?.code) === "HA_MISSING_PLATFORM_ACCOUNT";
      if (!isMissingAccount) {
        throw error;
      }
    }

    await withTransientRetry(() => ensureMyPlatformAccount());

    return withTransientRetry(() => loadPlatformAccount(userId));
  };

  const hydrateSession = (
    isCancelled?: () => boolean,
    options?: {
      silent?: boolean;
      session?: Awaited<ReturnType<typeof supabase.auth.getSession>>["data"]["session"] | null;
    },
  ) => {
    if (hydrateSessionInFlightRef.current) {
      return hydrateSessionInFlightRef.current;
    }

    const hydrationPromise = (async () => {
      if (!enabled) {
        setSessionStatus("ready");
        setSessionError(null);
        return;
      }

      const cancelled = () => isCancelled?.() ?? false;
      const shouldShowLoadingState = !options?.silent && !hasActiveSessionRef.current;

      if (!cancelled() && shouldShowLoadingState) {
        setSessionStatus("loading");
        setSessionError(null);
      }

      let session = options?.session ?? null;

      if (options?.session === undefined) {
        try {
          const { data: sessionData } = await supabase.auth.getSession();
          session = sessionData.session;
        } catch (error) {
          if (isSupabaseAbortError(error)) {
            return;
          }
          throw error;
        }
      }

      if (!session?.user) {
        if (!cancelled()) {
          resetSessionData();
          setSessionStatus("ready");
          setSessionError(null);
        }
        return;
      }

      try {
        const userId = session.user.id;
        const { fullProfile, walletRow } = await loadOrRepairPlatformAccount(userId);

        if (cancelled()) {
          return;
        }

        applySessionData(fullProfile, walletRow);
        setSessionStatus("ready");
        setSessionError(null);
      } catch (error) {
        if (isSupabaseAbortError(error)) {
          return;
        }
        console.error("Supabase session hydrate error:", error);
        if (!cancelled()) {
          resetSessionData();
          setSessionStatus("failed");
          setSessionError(error instanceof Error ? error.message : "Session restore failed.");
        }
      }
    })();

    hydrateSessionInFlightRef.current = hydrationPromise.finally(() => {
      if (hydrateSessionInFlightRef.current === hydrationPromise) {
        hydrateSessionInFlightRef.current = null;
      }
    });

    return hydrateSessionInFlightRef.current;
  };

  useEffect(() => {
    if (!enabled) {
      setSessionStatus("ready");
      setSessionError(null);
      return;
    }

    let isCancelled = false;

    void hydrateSession(() => isCancelled);

    const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
      void hydrateSession(() => isCancelled, { silent: true, session });
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
    await hydrateSession(undefined, { silent: true });
  };

  return {
    authProvider: "supabase",
    isLoggedIn,
    isAdmin,
    user,
    sessionStatus,
    sessionError,
    stats: accountMode === "demo" ? demoStats : liveStats,
    wallet,
    accountMode,
    visibleBalance: accountMode === "demo" ? wallet.demoBalance : wallet.availableBalance,
    profileData,
    setProfileData,
    switchAccountMode,
    topUpDemoBalance,
    refreshSession: async () => {
      await hydrateSession(undefined, { silent: false });
    },
  };
}
