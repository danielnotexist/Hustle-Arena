import { useEffect, useState } from "react";
import {
  auth,
  db,
  doc,
  getDoc,
  onAuthStateChanged,
  onSnapshot,
  serverTimestamp,
  setDoc,
} from "../firebase";
import type {
  AccountMode,
  ArenaUser,
  PlatformSessionState,
  ProfileData,
  SessionStatus,
  UserStats,
  WalletSnapshot,
} from "./types";

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
};

export const DEFAULT_WALLET: WalletSnapshot = {
  availableBalance: 0,
  lockedBalance: 0,
  demoBalance: 0,
};

function toArenaUser(userData: any): ArenaUser {
  return {
    id: userData.uid || userData.id,
    username: userData.username || userData.displayName || userData.email?.split("@")[0] || "Player",
    email: userData.email || "",
    avatarUrl: userData.photoURL || userData.avatarUrl || null,
    role: userData.role || "user",
    kycStatus: userData.kycStatus || "none",
    accountMode: userData.accountMode || "live",
  };
}

export function useLegacyFirebaseSession(enabled = true): PlatformSessionState {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [user, setUser] = useState<ArenaUser | null>(null);
  const [sessionStatus, setSessionStatus] = useState<SessionStatus>(enabled ? "loading" : "ready");
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [liveStats, setLiveStats] = useState<UserStats>(DEFAULT_STATS);
  const [demoStats, setDemoStats] = useState<UserStats>({ ...DEFAULT_STATS, rank: "Demo Cadet" });
  const [wallet, setWallet] = useState<WalletSnapshot>(DEFAULT_WALLET);
  const [profileData, setProfileData] = useState<ProfileData>(DEFAULT_PROFILE_DATA);
  const [accountMode, setAccountMode] = useState<AccountMode>("live");

  const refreshSession = async () => {
    if (!enabled) {
      setSessionStatus("ready");
      setSessionError(null);
      return;
    }

    setSessionStatus("loading");
    setSessionError(null);

    const firebaseUser = auth.currentUser;
    if (!firebaseUser) {
      setIsLoggedIn(false);
      setIsAdmin(false);
      setUser(null);
      setLiveStats(DEFAULT_STATS);
      setDemoStats({ ...DEFAULT_STATS, rank: "Demo Cadet" });
      setWallet(DEFAULT_WALLET);
      setProfileData(DEFAULT_PROFILE_DATA);
      setAccountMode("live");
      setSessionStatus("ready");
      setSessionError(null);
      return;
    }

    const userDocRef = doc(db, "users", firebaseUser.uid);
    const userDoc = await getDoc(userDocRef);
    if (!userDoc.exists()) {
      setSessionStatus("failed");
      setSessionError("Firebase profile record is missing.");
      return;
    }

    const profile = userDoc.data();
    const nextUser = toArenaUser({ ...firebaseUser, ...profile });
    setIsLoggedIn(true);
    setIsAdmin(nextUser.role === "admin" || nextUser.email?.toLowerCase() === "danielnotexist@gmail.com");
    setUser(nextUser);
    setLiveStats(profile.stats || DEFAULT_STATS);
    setDemoStats(profile.demoStats || { ...DEFAULT_STATS, rank: "Demo Cadet" });
    setWallet({
      availableBalance: profile.stats?.credits || 0,
      lockedBalance: profile.lockedBalance || 0,
      demoBalance: profile.demoBalance || 0,
    });
    setAccountMode(profile.accountMode || "live");
    setProfileData({
      bio: profile.bio || DEFAULT_PROFILE_DATA.bio,
      country: profile.country || DEFAULT_PROFILE_DATA.country,
      twitter: profile.twitter || DEFAULT_PROFILE_DATA.twitter,
      twitch: profile.twitch || DEFAULT_PROFILE_DATA.twitch,
      avatarUrl: profile.avatarUrl || profile.photoURL || DEFAULT_PROFILE_DATA.avatarUrl,
      coverUrl: profile.coverUrl || DEFAULT_PROFILE_DATA.coverUrl,
    });
    setSessionStatus("ready");
    setSessionError(null);
  };

  useEffect(() => {
    if (!enabled) {
      setSessionStatus("ready");
      setSessionError(null);
      return;
    }

    let profileUnsubscribe: (() => void) | null = null;

    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (!firebaseUser) {
        setIsLoggedIn(false);
        setIsAdmin(false);
        setUser(null);
        setLiveStats(DEFAULT_STATS);
        setDemoStats({ ...DEFAULT_STATS, rank: "Demo Cadet" });
        setWallet(DEFAULT_WALLET);
        setProfileData(DEFAULT_PROFILE_DATA);
        setAccountMode("live");
        setSessionStatus("ready");
        setSessionError(null);
        if (profileUnsubscribe) profileUnsubscribe();
        return;
      }

      try {
        const userDocRef = doc(db, "users", firebaseUser.uid);
        const userDoc = await getDoc(userDocRef);

        if (!userDoc.exists()) {
          await setDoc(userDocRef, {
            username: firebaseUser.displayName || firebaseUser.email?.split("@")[0] || "Player",
            email: firebaseUser.email,
            role: firebaseUser.email?.toLowerCase() === "danielnotexist@gmail.com" ? "admin" : "user",
            kycStatus: firebaseUser.email?.toLowerCase() === "danielnotexist@gmail.com" ? "verified" : "none",
            accountMode: "live",
            demoBalance: 0,
            ...DEFAULT_PROFILE_DATA,
            createdAt: serverTimestamp(),
            stats: DEFAULT_STATS,
            demoStats: { ...DEFAULT_STATS, rank: "Demo Cadet" },
          });
        }

        profileUnsubscribe = onSnapshot(
          userDocRef,
          (snapshot) => {
            if (!snapshot.exists()) {
              return;
            }

            const profile = snapshot.data();
            const nextUser = toArenaUser({ ...firebaseUser, ...profile });
            setIsLoggedIn(true);
            setIsAdmin(nextUser.role === "admin" || nextUser.email?.toLowerCase() === "danielnotexist@gmail.com");
            setUser(nextUser);
            setLiveStats(profile.stats || DEFAULT_STATS);
            setDemoStats(profile.demoStats || { ...DEFAULT_STATS, rank: "Demo Cadet" });
            setWallet({
              availableBalance: profile.stats?.credits || 0,
              lockedBalance: profile.lockedBalance || 0,
              demoBalance: profile.demoBalance || 0,
            });
            setAccountMode(profile.accountMode || "live");
            setProfileData({
              bio: profile.bio || DEFAULT_PROFILE_DATA.bio,
              country: profile.country || DEFAULT_PROFILE_DATA.country,
              twitter: profile.twitter || DEFAULT_PROFILE_DATA.twitter,
              twitch: profile.twitch || DEFAULT_PROFILE_DATA.twitch,
              avatarUrl: profile.avatarUrl || profile.photoURL || DEFAULT_PROFILE_DATA.avatarUrl,
              coverUrl: profile.coverUrl || DEFAULT_PROFILE_DATA.coverUrl,
            });
            setSessionStatus("ready");
            setSessionError(null);
          },
          (error) => {
            console.error("Profile snapshot error:", error);
            setSessionStatus("failed");
            setSessionError(error instanceof Error ? error.message : "Firebase profile snapshot failed.");
          }
        );
      } catch (error) {
        console.error("Auth state change error:", error);
        setSessionStatus("failed");
        setSessionError(error instanceof Error ? error.message : "Firebase auth state change failed.");
      }
    });

    return () => {
      unsubscribe();
      if (profileUnsubscribe) profileUnsubscribe();
    };
  }, [enabled]);

  const switchAccountMode = async (mode: AccountMode) => {
    if (!user?.id) {
      throw new Error("You must be logged in to switch account modes.");
    }

    await setDoc(
      doc(db, "users", user.id),
      {
        accountMode: mode,
      },
      { merge: true }
    );

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

    const nextDemoBalance = wallet.demoBalance + safeAmount;

    await setDoc(
      doc(db, "users", user.id),
      {
        demoBalance: nextDemoBalance,
      },
      { merge: true }
    );

    setWallet((currentWallet) => ({
      ...currentWallet,
      demoBalance: nextDemoBalance,
    }));
    setDemoStats((currentStats) => ({
      ...currentStats,
      credits: nextDemoBalance,
    }));
  };

  return {
    authProvider: "firebase",
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
    refreshSession,
  };
}
