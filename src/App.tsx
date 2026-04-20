/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { motion, AnimatePresence } from "motion/react";
import { 
  Search, 
  Users, 
  Trophy, 
  Activity, 
  PlayCircle, 
  Zap, 
  Shield, 
  Target, 
  ShoppingBag, 
  Crown, 
  Bell, 
  MessageSquare, 
  Settings,
  Plus,
  Star,
  Sword,
  X,
  CheckCircle2,
  AlertCircle,
  LayoutDashboard,
  LogOut,
  ShieldAlert,
  Wallet,
} from "lucide-react";
import React, { useEffect, useRef, useState } from "react";
import hustleArenaLogo from "./assets/hustle-arena-logo.png";
import { auth, signOut } from "./firebase";
import { isSupabaseConfigured } from "./lib/env";
import { isSupabaseAbortError, supabase } from "./lib/supabase";
import {
  fetchMyActiveLobbySummary,
  fetchMyReconnectableMatch,
  fetchQuickQueuePartyInvites,
  launchMatchServer,
  markNotificationRead,
  respondQuickQueuePartyInvite,
  type QuickQueuePartyInvite,
  type ReconnectableMatch,
} from "./lib/supabase/matchmaking";
import {
  fetchMyNotifications,
  fetchPublicProfileBasics,
  fetchPublicProfileDetails,
  type AppNotification,
  type PublicProfileDetails,
} from "./lib/supabase/social";
import { playChatMessageSound, playNotificationSound } from "./lib/sound";
import type { Toast } from "./features/types";
import {
  AdminPanel,
  ArenaTVView,
  ApexListView,
  AuthForm,
  BattlefieldView,
  CustomLobbyBrowserView,
  DashboardView,
  DepositPage,
  HustlePrimeView,
  KYCForm,
  LandingPage,
  MissionsView,
  NeuralMapView,
  ForumsView,
  SocialView,
  SidebarItem,
  SquadHubView,
  SyndicatesView,
  PublicProfileView,
  UserProfileView,
  VaultView,
} from "./features/app-sections";
import { usePlatformSession } from "./features/use-platform-session";

const DASHBOARD_TAB = "Dashboard";
const ACTIVE_TAB_STORAGE_KEY = "hustle_arena_active_tab";
const VALID_TABS = new Set([
  "Dashboard",
  "Admin",
  "Wallet",
  "Profile",
  "Battlefield Matchmaking",
  "Custom Lobby Browser",
  "Squad Hub",
  "Social",
  "Apex List",
  "Neural Map",
  "Missions",
  "Vault",
  "Forums",
  "Arena TV",
  "Arena Guard",
  "Hustle Prime",
]);

// --- Main App Component ---
export default function App() {
  const shouldUseSupabase = isSupabaseConfigured();
  const [view, setView] = useState<"landing" | "dashboard" | "admin">(
    shouldUseSupabase ? "dashboard" : "landing"
  );
  const [activeTab, setActiveTab] = useState(() => {
    if (typeof window === "undefined") return DASHBOARD_TAB;
    const storedTab = window.localStorage.getItem(ACTIVE_TAB_STORAGE_KEY);
    return storedTab && VALID_TABS.has(storedTab) ? storedTab : DASHBOARD_TAB;
  });
  const [battlefieldMenuOpen, setBattlefieldMenuOpen] = useState(false);
  const [joiningLobbyTransition, setJoiningLobbyTransition] = useState(false);
  const [publicProfileState, setPublicProfileState] = useState<{
    userId: string;
    profile: PublicProfileDetails;
    displayName: string;
    avatarUrl: string;
    coverUrl: string;
  } | null>(null);
  const [profileInitialTab, setProfileInitialTab] = useState<"overview" | "matches" | "highlights" | "settings">("overview");
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalContent, setModalContent] = useState<{
    title: string,
    body: React.ReactNode,
    options?: {
      size?: "default" | "wide" | "full";
      showHeader?: boolean;
      showFooter?: boolean;
      bodyPadding?: "default" | "none";
    }
  } | null>(null);
  const [reconnectMatch, setReconnectMatch] = useState<ReconnectableMatch | null>(null);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [globalPartyInvites, setGlobalPartyInvites] = useState<QuickQueuePartyInvite[]>([]);
  const [globalPartyInviteProfiles, setGlobalPartyInviteProfiles] = useState<Record<string, { username: string; avatarUrl: string | null }>>({});
  const [globalPartyInviteActionId, setGlobalPartyInviteActionId] = useState<number | null>(null);
  const [globalOnlineUserIds, setGlobalOnlineUserIds] = useState<string[]>([]);
  const [socialRefreshNonce, setSocialRefreshNonce] = useState(0);
  const [socialFocusFriendId, setSocialFocusFriendId] = useState<string | null>(null);
  const [authBootstrapComplete, setAuthBootstrapComplete] = useState(!shouldUseSupabase);
  const [hasSupabaseSession, setHasSupabaseSession] = useState<boolean | null>(
    shouldUseSupabase ? null : false
  );
  const [sessionRecoveryAction, setSessionRecoveryAction] = useState<"retry" | "logout" | null>(null);
  const {
    authProvider,
    isLoggedIn,
    isAdmin,
    user,
    sessionStatus,
    sessionError,
    stats,
    wallet,
    accountMode,
    visibleBalance,
    profileData,
    setProfileData,
    switchAccountMode,
    topUpDemoBalance,
    refreshSession,
  } = usePlatformSession();
  const previousUserIdRef = useRef<string | null>(null);
  const previousUnreadNotificationCountRef = useRef(0);
  const seenNotificationIdsRef = useRef<Set<number>>(new Set());
  const globalPresenceChannelRef = useRef<any>(null);
  const disableLastActiveHeartbeatRef = useRef(false);

  useEffect(() => {
    if (!shouldUseSupabase) {
      setAuthBootstrapComplete(true);
      setHasSupabaseSession(false);
      return;
    }

    let isCancelled = false;
    void supabase.auth
      .getSession()
      .then(({ data }) => {
        if (!isCancelled) {
          setHasSupabaseSession(!!data.session?.user);
          setAuthBootstrapComplete(true);
        }
      })
      .catch((error: unknown) => {
        if (isSupabaseAbortError(error)) {
          return;
        }
        if (!isCancelled) {
          setAuthBootstrapComplete(true);
        }
      });

    const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!isCancelled) {
        setHasSupabaseSession(!!session?.user);
      }
    });

    return () => {
      isCancelled = true;
      authListener.subscription.unsubscribe();
    };
  }, [shouldUseSupabase]);

  const addToast = (message: string, type: 'success' | 'error' | 'info' = 'info') => {
    const id = Date.now();
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 3000);
  };

  const openModal = (
    title: string,
    body: React.ReactNode,
    options?: {
      size?: "default" | "wide" | "full";
      showHeader?: boolean;
      showFooter?: boolean;
      bodyPadding?: "default" | "none";
    }
  ) => {
    console.log("Opening modal:", title);
    setModalContent({ title, body, options });
    setIsModalOpen(true);
  };

  const primaryNavigationItems = [
    { id: "Squad Hub", icon: <Users size={20} />, label: "Squad Hub" },
    { id: "Apex List", icon: <Trophy size={20} />, label: "Apex List" },
    { id: "Neural Map", icon: <Activity size={20} />, label: "Neural Map" },
    { id: "Arena TV", icon: <PlayCircle size={20} />, label: "Arena TV" },
    { id: "Forums", icon: <Zap size={20} />, label: "Forums" },
    { id: "Wallet", icon: <Wallet size={20} />, label: "Wallet", highlight: true },
  ];

  const socialItems = [
    { id: "Social", icon: <MessageSquare size={20} />, label: "Social" },
  ];

  const collectiveItems = [
    { id: "Arena Guard", icon: <Shield size={20} />, label: "Arena Guard" },
    { id: "Missions", icon: <Target size={20} />, label: "Missions" },
    { id: "Vault", icon: <ShoppingBag size={20} />, label: "Vault" },
    { id: "Hustle Prime", icon: <Crown size={20} />, label: "Hustle Prime", highlight: true },
  ];

  const battlefieldTabs = ["Battlefield Matchmaking", "Custom Lobby Browser"];
  const isBattlefieldTab = battlefieldTabs.includes(activeTab);
  const showAuthBootstrapScreen = shouldUseSupabase
    ? !authBootstrapComplete || hasSupabaseSession === null || sessionStatus === "loading"
    : !authBootstrapComplete;
  const showSessionRecoveryScreen =
    shouldUseSupabase && hasSupabaseSession === true && sessionStatus === "failed";

  useEffect(() => {
    if (user) {
      setView("dashboard");
      if (previousUserIdRef.current && previousUserIdRef.current !== user.id) {
        addToast(`Welcome back, ${user.username}!`, "success");
      }
      previousUserIdRef.current = user.id;
      setIsModalOpen(false);
      return;
    }

    if (!authBootstrapComplete) {
      return;
    }

    if (shouldUseSupabase) {
      if (hasSupabaseSession === null || sessionStatus === "loading") {
        return;
      }
      if (hasSupabaseSession === false && !user) {
        previousUserIdRef.current = null;
        setView("landing");
      } else if (hasSupabaseSession === true || user) {
        setView("dashboard");
      }
      return;
    }

    previousUserIdRef.current = null;
    setView("landing");
  }, [user, authBootstrapComplete, shouldUseSupabase, hasSupabaseSession, sessionStatus]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    window.localStorage.setItem(ACTIVE_TAB_STORAGE_KEY, activeTab);
  }, [activeTab]);

  useEffect(() => {
    if (!isAdmin && activeTab === "Admin") {
      setActiveTab(DASHBOARD_TAB);
    }
  }, [isAdmin, activeTab]);

  useEffect(() => {
    if (!user || !isSupabaseConfigured()) {
      setReconnectMatch(null);
      return;
    }

    let isCancelled = false;

    const loadReconnectableMatch = async () => {
      try {
        const match = await fetchMyReconnectableMatch();
        if (!isCancelled) {
          setReconnectMatch(match);
        }
      } catch (error) {
        console.error("Failed to load reconnectable match:", error);
        if (!isCancelled) {
          setReconnectMatch(null);
        }
      }
    };

    void loadReconnectableMatch();
    const interval = window.setInterval(() => {
      void loadReconnectableMatch();
    }, 5000);

    return () => {
      isCancelled = true;
      window.clearInterval(interval);
    };
  }, [user?.id]);

  useEffect(() => {
    if (activeTab !== "Custom Lobby Browser" || !user?.id || !isSupabaseConfigured()) {
      return;
    }

    let isCancelled = false;

    const redirectIntoJoinedLobby = async () => {
      try {
        const activeLobby = await fetchMyActiveLobbySummary(accountMode);
        if (!isCancelled && activeLobby) {
          setActiveTab("Squad Hub");
        }
      } catch (error) {
        console.error("Failed to detect joined custom lobby:", error);
      }
    };

    void redirectIntoJoinedLobby();
    const interval = window.setInterval(() => {
      void redirectIntoJoinedLobby();
    }, 3000);

    return () => {
      isCancelled = true;
      window.clearInterval(interval);
    };
  }, [activeTab, user?.id, accountMode]);

  useEffect(() => {
    if (activeTab !== "Squad Hub" && joiningLobbyTransition) {
      setJoiningLobbyTransition(false);
    }
  }, [activeTab, joiningLobbyTransition]);

  useEffect(() => {
    if (!user?.id || !isSupabaseConfigured()) {
      setNotifications([]);
      setGlobalPartyInvites([]);
      setGlobalPartyInviteProfiles({});
      previousUnreadNotificationCountRef.current = 0;
      seenNotificationIdsRef.current = new Set();
      return;
    }

    let cancelled = false;

    const loadNotifications = async () => {
      try {
        const rows = await fetchMyNotifications(20);
        if (!cancelled) {
          const unreadCount = rows.filter((notice) => !notice.is_read).length;
          const currentIds = new Set(rows.map((notice) => notice.id));
          const newUnreadNotices = rows.filter(
            (notice) => !notice.is_read && !seenNotificationIdsRef.current.has(notice.id)
          );

          if (seenNotificationIdsRef.current.size > 0) {
            newUnreadNotices.forEach((notice) => {
              if (notice.notice_type === "lobby_closed_by_leader") {
                return;
              }

              if (notice.notice_type === "direct_message") {
                playChatMessageSound();
              } else {
                playNotificationSound();
              }

              addToast(
                notice.body || notice.title || "You have a new notification.",
                notice.notice_type === "party_invite_removed" ? "info" : "success"
              );
            });
          }

          seenNotificationIdsRef.current = currentIds;
          previousUnreadNotificationCountRef.current = unreadCount;
          setNotifications(rows);
        }
      } catch (error) {
        console.error("Failed to load notifications:", error);
      }
    };

    void loadNotifications();
    const interval = window.setInterval(() => {
      void loadNotifications();
    }, 4000);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [user?.id]);

  useEffect(() => {
    if (!user?.id || !isSupabaseConfigured()) {
      setGlobalPartyInvites([]);
      return;
    }

    let cancelled = false;

    const loadGlobalPartyInvites = async () => {
      try {
        const rows = await fetchQuickQueuePartyInvites(user.id);
        if (!cancelled) {
          setGlobalPartyInvites(rows.filter((invite) => invite.invitee_user_id === user.id && invite.status === "pending"));
        }
      } catch (error) {
        console.error("Failed to load global party invites:", error);
      }
    };

    void loadGlobalPartyInvites();
    const interval = window.setInterval(() => {
      void loadGlobalPartyInvites();
    }, 2000);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [user?.id]);

  useEffect(() => {
    const hostIds: string[] = Array.from(new Set(globalPartyInvites.map((invite) => invite.host_user_id)));
    if (!hostIds.length) {
      setGlobalPartyInviteProfiles({});
      return;
    }

    const loadProfiles = async () => {
      try {
        const profileMap = await fetchPublicProfileBasics(hostIds);
        const next: Record<string, { username: string; avatarUrl: string | null }> = {};
        hostIds.forEach((id) => {
          const profile = profileMap.get(id);
          next[id] = {
            username: profile?.username?.trim() || profile?.email?.split("@")[0]?.trim() || `Player ${id.slice(0, 8)}`,
            avatarUrl: profile?.avatar_url || null,
          };
        });
        setGlobalPartyInviteProfiles(next);
      } catch (error) {
        console.error("Failed to load global party invite profiles:", error);
      }
    };

    void loadProfiles();
  }, [globalPartyInvites]);

  useEffect(() => {
    if (!user?.id || !isSupabaseConfigured()) {
      setGlobalOnlineUserIds([]);
      if (globalPresenceChannelRef.current) {
        supabase.removeChannel(globalPresenceChannelRef.current);
        globalPresenceChannelRef.current = null;
      }
      return;
    }

    if (globalPresenceChannelRef.current) {
      supabase.removeChannel(globalPresenceChannelRef.current);
      globalPresenceChannelRef.current = null;
    }

    let cancelled = false;
    let heartbeatInterval: number | null = null;

    const trackPresence = async (channel: any) => {
      try {
        if (!disableLastActiveHeartbeatRef.current) {
          const { error } = await supabase
            .from("profiles")
            .update({ last_active_at: new Date().toISOString() })
            .eq("id", user.id);

          if (error) {
            disableLastActiveHeartbeatRef.current = true;
            console.error("Failed to update last_active_at heartbeat:", error);
          }
        }
        await channel.track({
          user_id: user.id,
          username: user.username || user.email?.split("@")[0] || "Player",
          online_at: new Date().toISOString(),
        });
      } catch (error) {
        console.error("Failed to track global presence:", error);
      }
    };

    const channel = supabase.channel("site-online-presence", {
      config: { presence: { key: user.id } },
    });

    channel
      .on("presence", { event: "sync" }, () => {
        if (cancelled) return;
        const state = channel.presenceState();
        const ids = new Set<string>();
        Object.values(state)
          .flat()
          .forEach((entry: any) => {
            if (entry?.user_id && entry.user_id !== user.id) {
              ids.add(entry.user_id);
            }
          });
        setGlobalOnlineUserIds(Array.from(ids));
      })
      .subscribe(async (status: string) => {
        if (cancelled) return;
        if (status === "SUBSCRIBED") {
          await trackPresence(channel);
          heartbeatInterval = window.setInterval(() => {
            void trackPresence(channel);
          }, 20000);
        }
      });

    globalPresenceChannelRef.current = channel;

    return () => {
      cancelled = true;
      if (heartbeatInterval) {
        window.clearInterval(heartbeatInterval);
      }
      if (globalPresenceChannelRef.current) {
        supabase.removeChannel(globalPresenceChannelRef.current);
        globalPresenceChannelRef.current = null;
      }
    };
  }, [user?.email, user?.id, user?.username]);

  const handleLogout = async () => {
    try {
      if (authProvider === "supabase" || shouldUseSupabase) {
        const { error } = await supabase.auth.signOut();
        if (error) {
          throw error;
        }
        setHasSupabaseSession(false);
      } else {
        await signOut(auth);
      }

      setPublicProfileState(null);
      setProfileInitialTab("overview");
      setNotificationsOpen(false);
      addToast("Logged out successfully", "info");
    } catch (error: any) {
      console.error("Logout failed:", error);
      addToast(error?.message || "Failed to log out.", "error");
    }
  };

  const handleSessionRecoveryRetry = async () => {
    setSessionRecoveryAction("retry");
    try {
      if (shouldUseSupabase) {
        const { data, error } = await Promise.race([
          supabase.auth.refreshSession(),
          new Promise<never>((_, reject) => {
            window.setTimeout(() => reject(new Error("Timed out while retrying the login session.")), 12000);
          }),
        ]);
        if (error) {
          throw error;
        }
        setHasSupabaseSession(!!data.session?.user);
      }

      await refreshSession();

      if (shouldUseSupabase) {
        const { data, error } = await Promise.race([
          supabase.auth.getSession(),
          new Promise<never>((_, reject) => {
            window.setTimeout(() => reject(new Error("Timed out while confirming the restored session.")), 12000);
          }),
        ]);
        if (error) {
          throw error;
        }
        setHasSupabaseSession(!!data.session?.user);
        if (!data.session?.user) {
          setView("landing");
        }
      }
    } catch (error: any) {
      console.error("Session recovery retry failed:", error);
      addToast(error?.message || "Failed to restore the session.", "error");
    } finally {
      setSessionRecoveryAction(null);
    }
  };

  const handleSessionRecoveryLogout = async () => {
    setSessionRecoveryAction("logout");
    try {
      if (shouldUseSupabase) {
        const { error } = await supabase.auth.signOut({ scope: "local" });
        if (error) {
          console.error("Session recovery sign-out warning:", error);
        }
      } else {
        await signOut(auth);
      }
    } catch (error) {
      console.error("Session recovery logout failed:", error);
    } finally {
      setHasSupabaseSession(false);
      setAuthBootstrapComplete(true);
      setPublicProfileState(null);
      setProfileInitialTab("overview");
      setNotificationsOpen(false);
      setReconnectMatch(null);
      setGlobalPartyInvites([]);
      setGlobalPartyInviteProfiles({});
      setGlobalOnlineUserIds([]);
      setSocialFocusFriendId(null);
      setView("landing");
      setActiveTab(DASHBOARD_TAB);
      setSessionRecoveryAction(null);
      addToast("Signed out. Please sign in again.", "info");
    }
  };

  const openPublicProfilePage = async (userId: string) => {
    try {
      const profile = await fetchPublicProfileDetails(userId);
      if (!profile) {
        addToast("Profile not found.", "error");
        return;
      }

      const displayName =
        profile.username?.trim() ||
        profile.email?.split("@")[0]?.trim() ||
        `Player ${userId.slice(0, 8)}`;
      const avatarUrl =
        profile.avatar_url ||
        `https://ui-avatars.com/api/?name=${encodeURIComponent(displayName)}&background=1f2937&color=ffffff&size=256`;
      const coverUrl =
        profile.cover_url ||
        hustleArenaLogo;

      setPublicProfileState({
        userId,
        profile,
        displayName,
        avatarUrl,
        coverUrl,
      });
      setActiveTab("Profile");
    } catch (error) {
      console.error("Failed to open public profile page:", error);
      addToast("Failed to open profile.", "error");
    }
  };

  const unreadNotificationsCount = notifications.filter(
    (notice) => !notice.is_read && notice.notice_type !== "direct_message"
  ).length;
  const unreadMessagesCount = notifications.filter(
    (notice) => !notice.is_read && notice.notice_type === "direct_message"
  ).length;
  const generalNotifications = notifications.filter((notice) => notice.notice_type !== "direct_message");
  const primaryGlobalPartyInvite = globalPartyInvites[0] || null;
  const primaryLobbyClosedNotice =
    notifications.find((notice) => !notice.is_read && notice.notice_type === "lobby_closed_by_leader") || null;

  const openMessagesInbox = async () => {
    const directMessageNotifications = notifications.filter((notice) => notice.notice_type === "direct_message");
    const unreadDirectMessageIds = directMessageNotifications.filter((notice) => !notice.is_read).map((notice) => notice.id);
    const latestDirectMessage = directMessageNotifications[0] || null;
    const senderId =
      (latestDirectMessage?.metadata?.sender_id as string | undefined) ||
      (typeof latestDirectMessage?.link_target === "string" && latestDirectMessage.link_target.includes("friend=")
        ? latestDirectMessage.link_target.split("friend=")[1]?.split("&")[0] || null
        : null);

    if (unreadDirectMessageIds.length) {
      try {
        await Promise.all(unreadDirectMessageIds.map((id) => markNotificationRead(id)));
        setNotifications((current) =>
          current.map((notice) =>
            unreadDirectMessageIds.includes(notice.id) ? { ...notice, is_read: true } : notice
          )
        );
      } catch (error) {
        console.error("Failed to mark direct-message notifications as read:", error);
      }
    }

    setNotificationsOpen(false);
    setPublicProfileState(null);
    setSocialFocusFriendId(senderId || null);
    setActiveTab("Social");
    setSocialRefreshNonce((current) => current + 1);
  };

  const clearGeneralNotifications = async () => {
    const unreadGeneralIds = generalNotifications.filter((notice) => !notice.is_read).map((notice) => notice.id);
    if (!unreadGeneralIds.length) {
      return;
    }

    try {
      await Promise.all(unreadGeneralIds.map((id) => markNotificationRead(id)));
      setNotifications((current) =>
        current.map((notice) =>
          unreadGeneralIds.includes(notice.id) ? { ...notice, is_read: true } : notice
        )
      );
      addToast("All notifications cleared.", "success");
    } catch (error) {
      console.error("Failed to clear notifications:", error);
      addToast("Failed to clear notifications.", "error");
    }
  };

  const respondToGlobalPartyInvite = async (inviteId: number, action: "accept" | "decline") => {
    setGlobalPartyInviteActionId(inviteId);
    try {
      await respondQuickQueuePartyInvite(inviteId, action);
      setGlobalPartyInvites((current) => current.filter((invite) => invite.id !== inviteId));
      setPublicProfileState(null);
      setBattlefieldMenuOpen(true);
      setActiveTab("Battlefield Matchmaking");
      addToast(action === "accept" ? "Party invite accepted." : "Party invite declined.", action === "accept" ? "success" : "info");
    } catch (error: any) {
      console.error("Failed to respond to global party invite:", error);
      addToast(error?.message || "Failed to respond to party invite.", "error");
    } finally {
      setGlobalPartyInviteActionId(null);
    }
  };

  const openDirectMessageWithFriend = (friendId: string) => {
    setNotificationsOpen(false);
    setPublicProfileState(null);
    setSocialFocusFriendId(friendId);
    setActiveTab("Social");
    setSocialRefreshNonce((current) => current + 1);
  };

  const acknowledgeLobbyClosedNotice = async (noticeId: number) => {
    try {
      await markNotificationRead(noticeId);
      setNotifications((current) =>
        current.map((notice) =>
          notice.id === noticeId ? { ...notice, is_read: true } : notice
        )
      );
    } catch (error) {
      console.error("Failed to mark lobby-close notification as read:", error);
      addToast("Failed to dismiss this notification.", "error");
    }
  };

  const handleNotificationClick = async (notice: AppNotification) => {
    try {
      if (!notice.is_read) {
        await markNotificationRead(notice.id);
        setNotifications((current) =>
          current.map((entry) =>
            entry.id === notice.id ? { ...entry, is_read: true } : entry
          )
        );
      }
    } catch (error) {
      console.error("Failed to mark notification as read:", error);
    }

    if (notice.link_target === "/social" || notice.notice_type === "friend_request" || notice.notice_type === "direct_message") {
      setPublicProfileState(null);
      setSocialFocusFriendId((notice.metadata?.sender_id as string | undefined) || null);
      setActiveTab("Social");
      setSocialRefreshNonce((current) => current + 1);
    } else if (
      notice.link_target === "/battlefield" ||
      notice.notice_type === "party_invite" ||
      notice.notice_type === "party_invite_response" ||
      notice.notice_type === "party_invite_removed"
    ) {
      setPublicProfileState(null);
      setBattlefieldMenuOpen(true);
      setActiveTab("Battlefield Matchmaking");
    } else if (notice.notice_type === "lobby_closed_by_leader") {
      setPublicProfileState(null);
      setBattlefieldMenuOpen(true);
      setActiveTab("Squad Hub");
    } else if (notice.link_target === "/squad-hub") {
      setActiveTab("Squad Hub");
    }
    setNotificationsOpen(false);
  };

  return (
    <div className="min-h-screen bg-esport-bg text-white font-sans">
      {showAuthBootstrapScreen ? (
        <div className="min-h-screen flex items-center justify-center px-6">
          <div className="w-full max-w-xl rounded-[28px] border border-esport-accent/20 bg-[radial-gradient(circle_at_top,rgba(59,130,246,0.14),transparent_38%),linear-gradient(180deg,rgba(15,23,42,0.96),rgba(2,6,23,0.98))] p-10 text-center shadow-[0_30px_120px_rgba(0,0,0,0.45)]">
            <img
              src={hustleArenaLogo}
              alt="Hustle Arena"
              className="mx-auto h-20 w-20 rounded-3xl object-cover shadow-[0_12px_40px_rgba(59,130,246,0.15)]"
            />
            <div className="mt-6 inline-flex items-center gap-2 rounded-full border border-esport-accent/30 bg-esport-accent/10 px-4 py-2 text-[11px] font-bold uppercase tracking-[0.24em] text-esport-accent">
              <Bell size={14} />
              Restoring Session
            </div>
            <h2 className="mt-6 text-3xl font-display font-bold uppercase tracking-wide text-white">
              Reconnecting You To The Arena
            </h2>
            <p className="mt-3 text-sm leading-6 text-esport-text-muted">
              Your profile, wallet, and active arena state are loading now.
            </p>
          </div>
        </div>
      ) : showSessionRecoveryScreen ? (
        <div className="min-h-screen flex items-center justify-center px-6">
          <div className="w-full max-w-2xl rounded-[32px] border border-amber-300/25 bg-[radial-gradient(circle_at_top,rgba(251,191,36,0.12),transparent_36%),linear-gradient(180deg,rgba(15,23,42,0.97),rgba(2,6,23,0.99))] p-10 text-center shadow-[0_30px_120px_rgba(0,0,0,0.48)]">
            <img
              src={hustleArenaLogo}
              alt="Hustle Arena"
              className="mx-auto h-20 w-20 rounded-3xl object-cover shadow-[0_12px_40px_rgba(251,191,36,0.12)]"
            />
            <div className="mt-6 inline-flex items-center gap-2 rounded-full border border-amber-300/30 bg-amber-400/10 px-4 py-2 text-[11px] font-bold uppercase tracking-[0.24em] text-amber-200">
              <AlertCircle size={14} />
              Session Recovery
            </div>
            <h2 className="mt-6 text-3xl font-display font-bold uppercase tracking-wide text-white">
              We Found Your Login But Couldn&apos;t Rebuild Your Arena Session
            </h2>
            <p className="mt-3 text-sm leading-6 text-esport-text-muted">
              We already tried to repair your platform profile and wallet bootstrap automatically, but the
              session still could not be restored. You can retry once, or sign out cleanly and sign back in.
            </p>
            {sessionError && (
              <p className="mt-4 rounded-2xl border border-amber-300/15 bg-black/20 px-4 py-3 text-xs leading-5 text-amber-100/85">
                Latest restore error: {sessionError}
              </p>
            )}
            <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center">
              <button
                type="button"
                onClick={() => void handleSessionRecoveryRetry()}
                disabled={sessionRecoveryAction !== null}
                className="esport-btn-primary min-w-[220px] py-3 disabled:opacity-60"
              >
                {sessionRecoveryAction === "retry" ? "Retrying..." : "Retry Session Restore"}
              </button>
              <button
                type="button"
                onClick={() => void handleSessionRecoveryLogout()}
                disabled={sessionRecoveryAction !== null}
                className="esport-btn-secondary min-w-[220px] py-3 border-amber-300/25 text-amber-200 hover:bg-amber-400/10 disabled:opacity-60"
              >
                {sessionRecoveryAction === "logout" ? "Signing Out..." : "Sign Out Cleanly"}
              </button>
            </div>
          </div>
        </div>
      ) : (
      view === "landing" ? (
        <LandingPage onLogin={() => openModal("Access Arena", <AuthForm onLogin={() => undefined} />)} />
      ) : (
        <div className="flex h-screen overflow-hidden">
          {/* Sidebar */}
          <aside className="w-64 bg-esport-sidebar flex flex-col border-r border-esport-border z-40 shrink-0">
            <div className="p-6">
              <div className="flex items-center gap-3 group cursor-pointer" onClick={() => setView("dashboard")}>
                <div className="flex items-center gap-3 h-12">
                  <img
                    src={hustleArenaLogo}
                    alt="Hustle Arena"
                    className="h-full w-12 rounded-lg object-cover border border-esport-border"
                  />
                  <span className="font-display font-bold text-xl tracking-wider text-white">Hustle-Arena</span>
                </div>
              </div>
            </div>

            <nav className="flex-1 overflow-y-auto custom-scrollbar px-3 space-y-8 py-4">
              {isAdmin && (
                <div>
                  <div className="px-4 mb-3 text-[10px] font-bold text-esport-secondary uppercase tracking-[0.2em]">Administration</div>
                  <div className="space-y-1">
                    <SidebarItem 
                      icon={<Shield size={20} />} 
                      label="Admin Panel" 
                      active={activeTab === "Admin"} 
                      onClick={() => setActiveTab("Admin")} 
                      highlight
                    />
                  </div>
                </div>
              )}

              <div>
                <div className="px-4 mb-3 text-[10px] font-bold text-esport-text-muted uppercase tracking-[0.2em]">Navigation</div>
                <div className="space-y-1">
                  <SidebarItem
                    icon={<LayoutDashboard size={20} />}
                    label="Dashboard"
                    active={activeTab === "Dashboard"}
                    onClick={() => setActiveTab("Dashboard")}
                  />
                  <SidebarItem
                    icon={<Sword size={20} />}
                    label="Battlefield"
                    active={isBattlefieldTab}
                    onClick={() => {
                      setBattlefieldMenuOpen((current) => {
                        const next = !current;
                        if (!current && !isBattlefieldTab) {
                          setActiveTab("Battlefield Matchmaking");
                        }
                        return next;
                      });
                    }}
                  />
                  {(battlefieldMenuOpen || isBattlefieldTab) && (
                    <div className="ml-6 space-y-1 border-l border-esport-border pl-3">
                      <button
                        onClick={() => {
                          setBattlefieldMenuOpen(true);
                          setActiveTab("Battlefield Matchmaking");
                        }}
                        className={`w-full rounded-lg px-3 py-2 text-left text-xs font-bold uppercase tracking-[0.18em] transition-all ${
                          activeTab === "Battlefield Matchmaking"
                            ? "bg-esport-accent/10 text-esport-accent"
                            : "text-esport-text-muted hover:bg-white/5 hover:text-white"
                        }`}
                      >
                        Matchmaking
                      </button>
                      <button
                        onClick={() => {
                          setBattlefieldMenuOpen(true);
                          setActiveTab("Custom Lobby Browser");
                        }}
                        className={`w-full rounded-lg px-3 py-2 text-left text-xs font-bold uppercase tracking-[0.18em] transition-all ${
                          activeTab === "Custom Lobby Browser"
                            ? "bg-esport-accent/10 text-esport-accent"
                            : "text-esport-text-muted hover:bg-white/5 hover:text-white"
                        }`}
                      >
                        Custom Lobby Browser
                      </button>
                    </div>
                  )}
                  {primaryNavigationItems.map(item => (
                    <SidebarItem 
                      key={item.id} 
                      {...item} 
                      active={activeTab === item.id} 
                      onClick={() => setActiveTab(item.id)} 
                    />
                  ))}
                </div>
              </div>

              <div>
                <div className="px-4 mb-3 text-[10px] font-bold text-esport-text-muted uppercase tracking-[0.2em]">Social</div>
                <div className="space-y-1">
                  {socialItems.map(item => (
                    <SidebarItem
                      key={item.id}
                      {...item}
                      active={activeTab === item.id}
                      onClick={() => setActiveTab(item.id)}
                    />
                  ))}
                </div>
              </div>

              <div>
                <div className="px-4 mb-3 text-[10px] font-bold text-esport-text-muted uppercase tracking-[0.2em]">Collective</div>
                <div className="space-y-1">
                  {collectiveItems.map(item => (
                    <SidebarItem 
                      key={item.id} 
                      {...item} 
                      active={activeTab === item.id} 
                      onClick={() => setActiveTab(item.id)} 
                    />
                  ))}
                </div>
              </div>
            </nav>

            <div className="p-4 border-t border-esport-border bg-black/20">
              <div className="relative flex items-center gap-3 rounded-xl px-2.5 pb-2.5 pt-3 pr-20 hover:bg-white/5 cursor-pointer group transition-all" onClick={() => { setPublicProfileState(null); setProfileInitialTab("overview"); setActiveTab("Profile"); }}>
                <div className="relative">
                  <img
                    src={profileData?.avatarUrl || `https://ui-avatars.com/api/?name=${encodeURIComponent(user?.username || "Player")}&background=random`}
                    className="w-10 h-10 rounded-full border-2 border-esport-accent group-hover:border-white transition-colors object-cover"
                  />
                  <div className="absolute -bottom-1 -right-1 w-4 h-4 bg-esport-success border-2 border-esport-sidebar rounded-full" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-bold truncate">{user?.username || "CyberGhost_99"}</div>
                  <div className="flex items-center gap-2">
                  <div className="text-[10px] text-esport-accent font-bold uppercase tracking-wider">Level {stats?.level || 0}</div>
                  <div className={`text-[8px] px-1.5 py-0.5 border rounded uppercase font-bold ${accountMode === "demo" ? "bg-esport-secondary/20 text-esport-secondary border-esport-secondary/30" : "bg-esport-success/20 text-esport-success border-esport-success/30"}`}>
                    {accountMode}
                  </div>
                  {!isAdmin && (
                      <button 
                        onClick={() => openModal("KYC Verification", <KYCForm addToast={addToast} user={user} />)}
                        className={`text-[8px] px-1.5 py-0.5 border rounded uppercase font-bold transition-all ${
                          user?.kycStatus === 'verified' ? 'bg-esport-success/20 text-esport-success border-esport-success/30' :
                          user?.kycStatus === 'pending' ? 'bg-esport-accent/20 text-esport-accent border-esport-accent/30' :
                          user?.kycStatus === 'rejected' ? 'bg-esport-danger/20 text-esport-danger border-esport-danger/30' :
                          'bg-esport-secondary/20 text-esport-secondary border-esport-secondary/30 hover:bg-esport-secondary hover:text-white'
                        }`}
                      >
                        {user?.kycStatus === 'verified' ? 'Verified' : 
                         user?.kycStatus === 'pending' ? 'Pending' : 
                         user?.kycStatus === 'rejected' ? 'Rejected' : 
                         'Verify KYC'}
                      </button>
                    )}
                  </div>
                </div>
                <div className="absolute right-0 top-0 flex items-center gap-1 rounded-xl border border-white/10 bg-black/40 p-1 shadow-[0_8px_24px_rgba(0,0,0,0.28)]">
                  <button
                    type="button"
                    aria-label="Open profile settings"
                    onClick={(event) => {
                      event.stopPropagation();
                      setPublicProfileState(null);
                      setProfileInitialTab("settings");
                      setActiveTab("Profile");
                    }}
                    className="rounded-lg p-1 text-esport-text-muted transition-colors hover:bg-white/5 hover:text-white"
                  >
                    <Settings size={15} />
                  </button>
                  <button
                    type="button"
                    aria-label="Log out"
                    onClick={(event) => {
                      event.stopPropagation();
                      void handleLogout();
                    }}
                    className="rounded-lg p-1 text-esport-text-muted transition-colors hover:bg-rose-400/10 hover:text-esport-danger"
                  >
                    <LogOut size={15} />
                  </button>
                </div>
              </div>
            </div>
          </aside>

          {/* Main Content */}
          <main className="flex-1 flex flex-col overflow-hidden relative">
            <header className="glass-header h-16 flex items-center justify-between px-8 shrink-0">
              <div className="flex items-center gap-8">
                <h2 className="text-xl font-display font-bold uppercase tracking-tight">{activeTab}</h2>
                <div className="hidden md:flex items-center gap-2 bg-white/5 border border-esport-border rounded-lg px-3 py-1.5 group focus-within:border-esport-accent/50 transition-all">
                  <input
                    type="text"
                    name="fake-username"
                    autoComplete="username"
                    tabIndex={-1}
                    aria-hidden="true"
                    className="pointer-events-none absolute h-0 w-0 opacity-0"
                  />
                  <input
                    type="password"
                    name="fake-password"
                    autoComplete="current-password"
                    tabIndex={-1}
                    aria-hidden="true"
                    className="pointer-events-none absolute h-0 w-0 opacity-0"
                  />
                  <Search size={16} className="text-esport-text-muted group-focus-within:text-esport-accent" />
                  <input
                    type="search"
                    id="global-arena-search"
                    name="arena-query"
                    aria-label="Search tournaments and players"
                    placeholder="Search tournaments, players..."
                    autoComplete="new-password"
                    autoCorrect="off"
                    autoCapitalize="none"
                    spellCheck={false}
                    enterKeyHint="search"
                    data-form-type="other"
                    readOnly
                    onFocus={(event) => {
                      event.currentTarget.removeAttribute("readonly");
                    }}
                    onPointerDown={(event) => {
                      event.currentTarget.removeAttribute("readonly");
                    }}
                    className="bg-transparent border-none outline-none text-sm w-64"
                  />
                </div>
              </div>

              <div className="flex items-center gap-4">
                {reconnectMatch && (
                  <button
                    onClick={() => {
                      setBattlefieldMenuOpen(true);
                      setActiveTab("Battlefield Matchmaking");
                      try {
                        launchMatchServer(reconnectMatch.dedicated_server_endpoint);
                      } catch (error: any) {
                        addToast(error?.message || "Reconnect endpoint is not available yet.", "error");
                      }
                    }}
                    className="flex items-center gap-2 px-4 py-1.5 bg-esport-accent/10 border border-esport-accent/30 rounded-full text-xs font-bold uppercase tracking-wider text-esport-accent hover:bg-esport-accent/20 transition-colors"
                  >
                    <PlayCircle size={14} />
                    Reconnect To Match
                  </button>
                )}
                <div className="flex items-center gap-3 px-4 py-1.5 bg-white/5 border border-esport-border rounded-full hover:bg-white/10 transition-colors cursor-pointer">
                  <div className="w-5 h-5 bg-esport-secondary rounded-full flex items-center justify-center">
                    <Star size={12} className="text-white fill-white" />
                  </div>
                  <span className="text-xs font-bold">
                    {accountMode === "demo" ? "Demo Balance" : "Live Balance"} {visibleBalance.toLocaleString()} USDT
                  </span>
                  <Plus size={14} className="text-esport-text-muted" />
                </div>
                
                <div className="relative">
                  <button
                    onClick={() => setNotificationsOpen((current) => !current)}
                    className="relative p-2 text-esport-text-muted hover:text-white transition-colors"
                  >
                    <Bell size={20} />
                    {unreadNotificationsCount > 0 && (
                      <span className="absolute top-1 right-1 min-w-[16px] h-4 px-1 bg-esport-danger text-[10px] font-bold text-white rounded-full flex items-center justify-center ring-2 ring-esport-bg">
                        {unreadNotificationsCount > 9 ? "9+" : unreadNotificationsCount}
                      </span>
                    )}
                  </button>
                  {notificationsOpen && (
                    <div className="absolute right-0 mt-2 w-[360px] max-h-[420px] overflow-y-auto custom-scrollbar rounded-xl border border-esport-border bg-[#12151e]/95 backdrop-blur-md shadow-2xl z-50">
                      <div className="px-4 py-3 border-b border-esport-border flex items-center justify-between">
                        <div className="text-xs font-bold uppercase tracking-[0.2em] text-esport-text-muted">Notifications</div>
                        <div className="flex items-center gap-2">
                          {unreadNotificationsCount > 0 && (
                            <button
                              onClick={() => void clearGeneralNotifications()}
                              className="rounded-full border border-esport-accent/30 bg-esport-accent/10 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-esport-accent hover:bg-esport-accent/15"
                            >
                              Clear all
                            </button>
                          )}
                          <button
                            onClick={() => setNotificationsOpen(false)}
                            className="p-1 text-esport-text-muted hover:text-white"
                          >
                            <X size={14} />
                          </button>
                        </div>
                      </div>
                      <div className="divide-y divide-white/5">
                        {generalNotifications.length === 0 && (
                          <div className="px-4 py-6 text-sm text-esport-text-muted">No notifications yet.</div>
                        )}
                        {generalNotifications.map((notice) => (
                          <button
                            key={notice.id}
                            onClick={() => void handleNotificationClick(notice)}
                            className={`w-full text-left px-4 py-3 transition-colors hover:bg-white/5 ${notice.is_read ? "opacity-70" : ""}`}
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div>
                                <div className="text-sm font-bold text-white">{notice.title}</div>
                                <div className="text-xs text-esport-text-muted mt-1">{notice.body}</div>
                              </div>
                              {!notice.is_read && <span className="mt-1 h-2 w-2 rounded-full bg-esport-accent shrink-0" />}
                            </div>
                            <div className="mt-2 text-[10px] uppercase tracking-[0.15em] text-esport-text-muted">
                              {new Date(notice.created_at).toLocaleString()}
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
                
                <button
                  onClick={() => void openMessagesInbox()}
                  className="relative p-2 text-esport-text-muted hover:text-white transition-colors"
                >
                  <MessageSquare size={20} />
                  {unreadMessagesCount > 0 && (
                    <span className="absolute top-1 right-1 min-w-[16px] h-4 px-1 bg-esport-accent text-[10px] font-bold text-esport-bg rounded-full flex items-center justify-center ring-2 ring-esport-bg">
                      {unreadMessagesCount > 9 ? "9+" : unreadMessagesCount}
                    </span>
                  )}
                </button>
              </div>
            </header>

            <div className="flex-1 overflow-y-auto custom-scrollbar relative">
              {isLoggedIn && !isAdmin && accountMode === "live" && user?.email?.toLowerCase() !== "danielnotexist@gmail.com" && user?.kycStatus !== 'verified' && (
                <div className="sticky top-0 z-[30] bg-esport-accent/10 border-b border-esport-accent/30 backdrop-blur-md p-3 flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-esport-accent/20 rounded-full flex items-center justify-center">
                      <ShieldAlert size={16} className="text-esport-accent" />
                    </div>
                    <div>
                      <div className="text-xs font-bold uppercase tracking-wider text-white">KYC Verification Required</div>
                      <p className="text-[10px] text-esport-text-muted">Verify your identity to unlock live-stakes matchmaking and other premium features. Demo mode stays available without KYC.</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    {user?.kycStatus === 'pending' && (
                      <span className="text-[10px] font-bold text-esport-accent uppercase tracking-widest bg-esport-accent/10 px-3 py-1 rounded-full border border-esport-accent/30">
                        Review Pending
                      </span>
                    )}
                    <button 
                      onClick={() => openModal("KYC Verification", <KYCForm addToast={addToast} user={user} />)}
                      className="px-4 py-1.5 bg-esport-accent text-esport-bg text-[10px] font-bold uppercase tracking-widest rounded-lg hover:scale-105 transition-all shadow-[0_0_15px_rgba(0,243,255,0.3)]"
                    >
                      {user?.kycStatus === 'rejected' ? 'Re-verify Now' : user?.kycStatus === 'pending' ? 'Update Info' : 'Verify Now'}
                    </button>
                  </div>
                </div>
              )}
              <div className="max-w-[1400px] mx-auto p-8">
                <AnimatePresence mode="wait">
                  <motion.div
                    key={activeTab}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    transition={{ duration: 0.2 }}
                  >
                    {activeTab === "Admin" && isAdmin && <AdminPanel addToast={addToast} />}
                    {activeTab === "Wallet" && <DepositPage addToast={addToast} user={user} accountMode={accountMode} visibleBalance={visibleBalance} />}
                    {activeTab === "Profile" && (
                      publicProfileState ? (
                        <PublicProfileView
                          profile={publicProfileState.profile}
                          displayName={publicProfileState.displayName}
                          avatarUrl={publicProfileState.avatarUrl}
                          coverUrl={publicProfileState.coverUrl}
                          accountMode={accountMode}
                          currentUser={user}
                          addToast={addToast}
                          onOpenPublicProfile={openPublicProfilePage}
                        />
                      ) : (
                        <UserProfileView
                          user={user}
                          stats={stats}
                          wallet={wallet}
                          accountMode={accountMode}
                          profileData={profileData}
                          setProfileData={setProfileData}
                          switchAccountMode={switchAccountMode}
                          topUpDemoBalance={topUpDemoBalance}
                          addToast={addToast}
                          openModal={openModal}
                          initialTab={profileInitialTab}
                        />
                      )
                    )}
                    {activeTab === "Battlefield Matchmaking" && (
                      <BattlefieldView
                        addToast={addToast}
                        openModal={openModal}
                        user={user}
                        accountMode={accountMode}
                        visibleBalance={visibleBalance}
                        onOpenDirectMessage={openDirectMessageWithFriend}
                        refreshSession={refreshSession}
                        onMatchReady={() => {
                          setBattlefieldMenuOpen(true);
                          setActiveTab("Squad Hub");
                        }}
                      />
                    )}
                    {activeTab === "Custom Lobby Browser" && <CustomLobbyBrowserView addToast={addToast} openModal={openModal} user={user} accountMode={accountMode} refreshSession={refreshSession} onLobbyJoined={() => { setJoiningLobbyTransition(true); setActiveTab("Squad Hub"); }} />}
                    {activeTab === "Squad Hub" && <SquadHubView addToast={addToast} user={user} accountMode={accountMode} openModal={openModal} refreshSession={refreshSession} showJoinTransition={joiningLobbyTransition} onJoinTransitionDone={() => setJoiningLobbyTransition(false)} />}
                    {activeTab === "Social" && <SocialView addToast={addToast} user={user} accountMode={accountMode} openModal={openModal} refreshSession={refreshSession} onOpenPublicProfile={openPublicProfilePage} refreshKey={socialRefreshNonce} onlineUserIds={globalOnlineUserIds} focusFriendId={socialFocusFriendId} onFocusFriendHandled={() => setSocialFocusFriendId(null)} />}
                    {activeTab === "Apex List" && <ApexListView onOpenPublicProfile={openPublicProfilePage} />}
                    {activeTab === "Neural Map" && <NeuralMapView stats={stats} />}
                    {activeTab === "Missions" && <MissionsView addToast={addToast} />}
                    {activeTab === "Vault" && <VaultView addToast={addToast} />}
                    {activeTab === "Forums" && <ForumsView />}
                    {activeTab === "Arena TV" && <ArenaTVView isAdmin={isAdmin} user={user} />}
                    {activeTab === "Arena Guard" && <SyndicatesView addToast={addToast} />}
                    {activeTab === "Hustle Prime" && <HustlePrimeView />}
                    {activeTab === "Dashboard" && (
                      <DashboardView
                        stats={stats}
                        accountMode={accountMode}
                        openModal={openModal}
                        onOpenPublicProfile={openPublicProfilePage}
                      />
                    )}
                  </motion.div>
                </AnimatePresence>
              </div>
            </div>
          </main>
        </div>
      ))}

      <AnimatePresence>
        {primaryLobbyClosedNotice && (
          <div className="fixed inset-0 z-[106] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/75 backdrop-blur-md"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.92, y: 18 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.94, y: 12 }}
              className="relative z-10 w-full max-w-3xl overflow-hidden rounded-[32px] border border-esport-accent/30 bg-[radial-gradient(circle_at_top,rgba(59,130,246,0.18),transparent_34%),linear-gradient(180deg,rgba(15,23,42,0.98),rgba(2,6,23,0.99))] p-8 shadow-[0_30px_120px_rgba(0,0,0,0.55)]"
            >
              <div className="mx-auto inline-flex items-center gap-2 rounded-full border border-esport-accent/30 bg-esport-accent/10 px-4 py-2 text-[11px] font-bold uppercase tracking-[0.24em] text-esport-accent">
                <Bell size={14} />
                Session Update
              </div>
              <div className="mt-6 flex flex-col items-center text-center">
                <img
                  src={hustleArenaLogo}
                  alt="Hustle Arena"
                  className="h-24 w-24 rounded-3xl border-4 border-white/10 object-cover shadow-[0_0_35px_rgba(59,130,246,0.18)]"
                />
                <h3 className="mt-6 text-4xl font-display font-bold uppercase tracking-wide text-white">
                  This Session Was Closed By The Party Leader
                </h3>
                <p className="mt-3 max-w-2xl text-base text-esport-text-muted">
                  Your previous squad lobby is no longer active. You can create a new lobby or join another party.
                </p>
              </div>

              <div className="mt-8 grid gap-3 sm:grid-cols-1">
                <button
                  type="button"
                  onClick={() => {
                    void acknowledgeLobbyClosedNotice(primaryLobbyClosedNotice.id);
                    setPublicProfileState(null);
                    setBattlefieldMenuOpen(true);
                    setActiveTab("Squad Hub");
                  }}
                  className="rounded-2xl bg-esport-success px-6 py-4 text-lg font-bold uppercase tracking-[0.18em] text-black transition-transform hover:scale-[1.01]"
                >
                  Understood
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {!primaryLobbyClosedNotice && primaryGlobalPartyInvite && (
          <div className="fixed inset-0 z-[105] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/75 backdrop-blur-md"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.92, y: 18 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.94, y: 12 }}
              className="relative z-10 w-full max-w-3xl overflow-hidden rounded-[32px] border border-esport-accent/30 bg-[radial-gradient(circle_at_top,rgba(59,130,246,0.18),transparent_34%),linear-gradient(180deg,rgba(15,23,42,0.98),rgba(2,6,23,0.99))] p-8 shadow-[0_30px_120px_rgba(0,0,0,0.55)]"
            >
              <div className="mx-auto inline-flex items-center gap-2 rounded-full border border-esport-accent/30 bg-esport-accent/10 px-4 py-2 text-[11px] font-bold uppercase tracking-[0.24em] text-esport-accent">
                <Bell size={14} />
                Party Invite Received
              </div>
              <div className="mt-6 flex flex-col items-center text-center">
                <img
                  src={globalPartyInviteProfiles[primaryGlobalPartyInvite.host_user_id]?.avatarUrl || `https://ui-avatars.com/api/?name=${encodeURIComponent(globalPartyInviteProfiles[primaryGlobalPartyInvite.host_user_id]?.username || "Player")}&background=1f2937&color=ffffff&size=160`}
                  alt={globalPartyInviteProfiles[primaryGlobalPartyInvite.host_user_id]?.username || "Player"}
                  className="h-24 w-24 rounded-3xl border-4 border-white/10 object-cover shadow-[0_0_35px_rgba(59,130,246,0.18)]"
                />
                <h3 className="mt-6 text-4xl font-display font-bold uppercase tracking-wide text-white">
                  {globalPartyInviteProfiles[primaryGlobalPartyInvite.host_user_id]?.username || "A teammate"} invited you
                </h3>
                <p className="mt-3 max-w-2xl text-base text-esport-text-muted">
                  Join this party now and head straight into Battlefield matchmaking with your squad.
                </p>
                <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
                  <div className="rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-[11px] font-bold uppercase tracking-[0.2em] text-white">
                    {primaryGlobalPartyInvite.team_size}v{primaryGlobalPartyInvite.team_size}
                  </div>
                  <div className="rounded-full border border-esport-accent/30 bg-esport-accent/10 px-4 py-2 text-[11px] font-bold uppercase tracking-[0.2em] text-esport-accent">
                    {Number(primaryGlobalPartyInvite.stake_amount)} USDT
                  </div>
                  <div className="rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-[11px] font-bold uppercase tracking-[0.2em] text-white">
                    {primaryGlobalPartyInvite.mode}
                  </div>
                </div>
              </div>

              <div className="mt-8 grid gap-3 sm:grid-cols-2">
                <button
                  type="button"
                  disabled={globalPartyInviteActionId === primaryGlobalPartyInvite.id}
                  onClick={() => void respondToGlobalPartyInvite(primaryGlobalPartyInvite.id, "accept")}
                  className="rounded-2xl bg-esport-success px-6 py-4 text-lg font-bold uppercase tracking-[0.18em] text-black transition-transform hover:scale-[1.01] disabled:opacity-50"
                >
                  Accept Invite
                </button>
                <button
                  type="button"
                  disabled={globalPartyInviteActionId === primaryGlobalPartyInvite.id}
                  onClick={() => void respondToGlobalPartyInvite(primaryGlobalPartyInvite.id, "decline")}
                  className="rounded-2xl border border-esport-danger/35 bg-esport-danger/10 px-6 py-4 text-lg font-bold uppercase tracking-[0.18em] text-rose-200 transition-colors hover:border-esport-danger/60 disabled:opacity-50"
                >
                  Decline
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Toast System */}
      <div className="fixed bottom-8 right-8 z-[100] flex flex-col gap-3">
        <AnimatePresence>
          {toasts.map(toast => (
            <motion.div
              key={toast.id}
              initial={{ opacity: 0, x: 50, scale: 0.9 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9, transition: { duration: 0.2 } }}
              className={`flex items-center gap-3 p-4 rounded-xl shadow-2xl border min-w-[300px] ${
                toast.type === 'success' ? 'bg-esport-success/10 border-esport-success/50 text-esport-success' :
                toast.type === 'error' ? 'bg-esport-danger/10 border-esport-danger/50 text-esport-danger' :
                'bg-esport-accent/10 border-esport-accent/50 text-esport-accent'
              }`}
            >
              {toast.type === 'success' ? <CheckCircle2 size={20} /> : <AlertCircle size={20} />}
              <span className="text-sm font-bold text-white">{toast.message}</span>
              <button onClick={() => setToasts(prev => prev.filter(t => t.id !== toast.id))} className="ml-auto opacity-50 hover:opacity-100">
                <X size={16} />
              </button>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {/* Modal System */}
      <AnimatePresence>
        {isModalOpen && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsModalOpen(false)}
              className="absolute inset-0 bg-black/80 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className={`esport-card w-full relative z-10 overflow-hidden ${
                modalContent?.options?.size === "full"
                  ? "max-w-7xl max-h-[92vh]"
                  : modalContent?.options?.size === "wide"
                    ? "max-w-5xl"
                    : "max-w-lg"
              }`}
            >
              {modalContent?.options?.showHeader !== false && (
                <div className="p-6 border-b border-esport-border flex items-center justify-between">
                  <h3 className="text-xl font-display font-bold uppercase">{modalContent?.title}</h3>
                  <button onClick={() => setIsModalOpen(false)} className="p-2 hover:bg-white/5 rounded-lg transition-colors">
                    <X size={20} />
                  </button>
                </div>
              )}
              <div className={`${modalContent?.options?.bodyPadding === "none" ? "" : "p-8"} ${modalContent?.options?.size === "full" ? "max-h-[calc(92vh-40px)] overflow-y-auto custom-scrollbar" : ""}`}>
                {modalContent?.body}
              </div>
              {modalContent?.options?.showFooter !== false && (
                <div className="p-6 bg-black/20 border-t border-esport-border flex justify-end gap-3">
                  <button onClick={() => setIsModalOpen(false)} className="esport-btn-secondary px-8">Cancel</button>
                  <button 
                    onClick={() => {
                      addToast("Action confirmed!", "success");
                      setIsModalOpen(false);
                    }} 
                    className="esport-btn-primary px-8"
                  >
                    Confirm
                  </button>
                </div>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

// --- Sub-Components ---
