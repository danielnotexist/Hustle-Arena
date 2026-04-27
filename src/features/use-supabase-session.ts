import { useEffect, useRef, useState } from "react";
import { clearSupabaseLocalSession, isSupabaseAbortError, isSupabaseInvalidRefreshTokenError, supabase } from "../lib/supabase";
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
import { DEFAULT_PROFILE_DATA, DEFAULT_STATS, DEFAULT_WALLET } from "./session-defaults";

const SESSION_REQUEST_TIMEOUT_MS = 12000;

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  let timeoutId: number | null = null;

  const timeoutPromise = new Promise<T>((_, reject) => {
    timeoutId = window.setTimeout(() => {
      reject(new Error(message));
    }, timeoutMs);
  });

  return Promise.race([promise, timeoutPromise]).finally(() => {
    if (timeoutId !== null) {
      window.clearTimeout(timeoutId);
    }
  }) as Promise<T>;
}

export function useSupabaseSession(enabled = true): PlatformSessionState {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [user, setUser] = useState<PlatformSessionState["user"]>(null);
  const [liveStats, setLiveStats] = useState<UserStats>(DEFAULT_STATS);
  const [demoStats, setDemoStats] = useState<UserStats>({ ...DEFAULT_STATS, rank: "Demo Cadet" });
  const [wallet, setWallet] = useState<WalletSnapshot>(DEFAULT_WALLET);
  const [profileData, setProfileData] = useState<ProfileData>(DEFAULT_PROFILE_DATA);
  const [accountMode, setAccountMode] = useState<AccountMode>("live");
  const cancelledRef = useRef(false);
  const hydrateRequestIdRef = useRef(0);

  const resetSessionState = () => {
    setIsLoggedIn(false);
    setIsAdmin(false);
    setUser(null);
    setLiveStats(DEFAULT_STATS);
    setDemoStats({ ...DEFAULT_STATS, rank: "Demo Cadet" });
    setWallet(DEFAULT_WALLET);
    setProfileData(DEFAULT_PROFILE_DATA);
    setAccountMode("live");
  };

  const buildFallbackArenaUser = (
    session: NonNullable<Awaited<ReturnType<typeof supabase.auth.getSession>>["data"]["session"]>
  ): PlatformSessionState["user"] => {
    const metadata = session.user.user_metadata || {};
    const email = session.user.email || "";
    const fallbackUsername =
      (typeof metadata.username === "string" && metadata.username.trim()) ||
      email.split("@")[0]?.trim() ||
      "Player";

    return {
      id: session.user.id,
      username: fallbackUsername,
      email,
      avatarUrl:
        (typeof metadata.avatar_url === "string" && metadata.avatar_url) ||
        (typeof metadata.picture === "string" && metadata.picture) ||
        null,
      role: typeof metadata.role === "string" ? metadata.role : "user",
      kycStatus: typeof metadata.kyc_status === "string" ? metadata.kyc_status : "none",
      kycMessage: null,
      accountMode: metadata.account_mode === "demo" ? "demo" : "live",
      steamId64: typeof metadata.steam_id64 === "string" ? metadata.steam_id64 : null,
      steamVerified: metadata.steam_verified === true,
    };
  };

  const hydrateSession = async () => {
    if (!enabled) {
      return;
    }

    const requestId = ++hydrateRequestIdRef.current;
    const shouldIgnore = () => cancelledRef.current || requestId !== hydrateRequestIdRef.current;
    let session: Awaited<ReturnType<typeof supabase.auth.getSession>>["data"]["session"] | null = null;

    try {
      const { data: sessionData, error: sessionError } = await withTimeout(
        supabase.auth.getSession(),
        SESSION_REQUEST_TIMEOUT_MS,
        "Timed out while reading the current auth session."
      );
      if (sessionError) {
        throw sessionError;
      }
      session = sessionData.session;
    } catch (error) {
      if (isSupabaseAbortError(error)) {
        return;
      }
      if (isSupabaseInvalidRefreshTokenError(error)) {
        await clearSupabaseLocalSession();
        if (!shouldIgnore()) {
          resetSessionState();
        }
        return;
      }
      throw error;
    }

    if (!session?.user) {
      if (!shouldIgnore()) {
        resetSessionState();
      }
      return;
    }

    try {
      const userId = session.user.id;
      const [myProfileResult, fullProfileResult, walletResult] = await Promise.allSettled([
        withTimeout(fetchMyProfile(), SESSION_REQUEST_TIMEOUT_MS, "Timed out while loading the signed-in profile."),
        withTimeout(fetchExtendedProfile(userId), SESSION_REQUEST_TIMEOUT_MS, "Timed out while loading the extended profile."),
        withTimeout(fetchWallet(userId), SESSION_REQUEST_TIMEOUT_MS, "Timed out while loading the wallet."),
      ]);

      if (shouldIgnore()) {
        return;
      }

      const rejectedReasons = [myProfileResult, fullProfileResult, walletResult]
        .filter((result): result is PromiseRejectedResult => result.status === "rejected")
        .map((result) => result.reason);

      const invalidRefreshTokenError = rejectedReasons.find((reason) => isSupabaseInvalidRefreshTokenError(reason));
      if (invalidRefreshTokenError) {
        await clearSupabaseLocalSession();
        if (!shouldIgnore()) {
          resetSessionState();
        }
        return;
      }

      const myProfile = myProfileResult.status === "fulfilled" ? myProfileResult.value : null;
      const fullProfile = fullProfileResult.status === "fulfilled" ? fullProfileResult.value : null;
      const walletRow = walletResult.status === "fulfilled" ? walletResult.value : null;
      const profileSource = fullProfile ?? myProfile;
      const walletSource = walletRow ?? myProfile;
      const nextUser = profileSource
        ? mapSupabaseProfileToArenaUser(profileSource)
        : buildFallbackArenaUser(session);

      if (rejectedReasons.length) {
        console.warn("Supabase session hydrate recovered with partial data:", rejectedReasons);
      }

      setIsLoggedIn(true);
      setIsAdmin(nextUser.role === "admin");
      setUser(nextUser);
      setLiveStats(mapSupabaseProfileToStats(profileSource ?? {}, walletSource ?? undefined, "live"));
      setDemoStats(mapSupabaseProfileToStats(profileSource ?? {}, walletSource ?? undefined, "demo"));
      setWallet(mapWalletSnapshot(walletSource ?? undefined));
      setProfileData(mapSupabaseProfileToProfileData(profileSource ?? {}));
      setAccountMode(nextUser.accountMode || "live");
    } catch (error) {
      if (isSupabaseAbortError(error)) {
        return;
      }
      if (isSupabaseInvalidRefreshTokenError(error)) {
        await clearSupabaseLocalSession();
        if (!shouldIgnore()) {
          resetSessionState();
        }
        return;
      }

      console.warn("Supabase session hydrate fell back to auth session:", error);
      if (!shouldIgnore()) {
        const fallbackUser = buildFallbackArenaUser(session);
        setIsLoggedIn(true);
        setIsAdmin(fallbackUser.role === "admin");
        setUser(fallbackUser);
        setLiveStats(DEFAULT_STATS);
        setDemoStats({ ...DEFAULT_STATS, rank: "Demo Cadet" });
        setWallet(DEFAULT_WALLET);
        setProfileData(DEFAULT_PROFILE_DATA);
        setAccountMode(fallbackUser.accountMode || "live");
      }
    }
  };

  useEffect(() => {
    if (!enabled) {
      return;
    }

    cancelledRef.current = false;

    void hydrateSession();

    const { data: authListener } = supabase.auth.onAuthStateChange(() => {
      void hydrateSession();
    });

    return () => {
      cancelledRef.current = true;
      hydrateRequestIdRef.current += 1;
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
      await withTimeout(
        hydrateSession(),
        SESSION_REQUEST_TIMEOUT_MS + 1000,
        "Timed out while refreshing the arena session."
      );
    },
  };
}
