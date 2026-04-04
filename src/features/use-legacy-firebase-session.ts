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
import type { AccountMode, ArenaUser, PlatformSessionState, ProfileData, UserStats, WalletSnapshot } from "./types";

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
    role: userData.role || "user",
    kycStatus: userData.kycStatus || "none",
    accountMode: userData.accountMode || "live",
  };
}

export function useLegacyFirebaseSession(enabled = true): PlatformSessionState {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [user, setUser] = useState<ArenaUser | null>(null);
  const [stats, setStats] = useState<UserStats | null>(null);
  const [wallet, setWallet] = useState<WalletSnapshot>(DEFAULT_WALLET);
  const [profileData, setProfileData] = useState<ProfileData>(DEFAULT_PROFILE_DATA);
  const [accountMode, setAccountMode] = useState<AccountMode>("live");

  useEffect(() => {
    if (!enabled) {
      return;
    }

    let profileUnsubscribe: (() => void) | null = null;

    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (!firebaseUser) {
        setIsLoggedIn(false);
        setIsAdmin(false);
        setUser(null);
        setStats(null);
        setWallet(DEFAULT_WALLET);
        setProfileData(DEFAULT_PROFILE_DATA);
        setAccountMode("live");
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
            setStats(profile.stats || DEFAULT_STATS);
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
            });
          },
          (error) => {
            console.error("Profile snapshot error:", error);
          }
        );
      } catch (error) {
        console.error("Auth state change error:", error);
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
    if (!Number.isFinite(safeAmount) || safeAmount < 0) {
      throw new Error("Demo balance must be a non-negative amount.");
    }

    await setDoc(
      doc(db, "users", user.id),
      {
        demoBalance: safeAmount,
      },
      { merge: true }
    );

    setWallet((currentWallet) => ({
      ...currentWallet,
      demoBalance: safeAmount,
    }));
  };

  return {
    authProvider: "firebase",
    isLoggedIn,
    isAdmin,
    user,
    stats: stats || DEFAULT_STATS,
    wallet,
    accountMode,
    visibleBalance: accountMode === "demo" ? wallet.demoBalance : wallet.availableBalance,
    profileData,
    setProfileData,
    switchAccountMode,
    topUpDemoBalance,
  };
}
