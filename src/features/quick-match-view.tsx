import { CheckCircle2, Clock, Lock, Search, Server, ShieldAlert, Sword, Target, Users } from "lucide-react";
import React, { useEffect, useRef, useState } from "react";
import { supabase } from "../lib/supabase";
import {
  fetchMyQuickQueueStatus,
  fetchQuickQueuePartyInvites,
  quickQueueAcceptMatch,
  quickQueueCancel,
  quickQueueJoinOrMatch,
  respondQuickQueuePartyInvite,
  sendQuickQueuePartyInvite,
  type QuickQueuePartyInvite,
  type QuickQueueStatus,
} from "../lib/supabase/matchmaking";
import { fetchPublicProfileBasics } from "../lib/supabase/social";
import { playMatchFoundSound, playNotificationSound } from "../lib/sound";
import { KYCForm } from "./landing-auth";
import type { AccountMode } from "./types";

const STAKE_OPTIONS = [5, 10, 25, 50, 100, 300, 500, 1000] as const;
const QUICK_QUEUE_STATE_STORAGE_KEY = "hustle_arena_quick_queue_state";

export function BattlefieldView({
  addToast,
  openModal,
  user,
  accountMode,
  onMatchReady,
}: {
  addToast: any;
  openModal: any;
  user: any;
  accountMode: AccountMode;
  refreshSession?: () => Promise<void>;
  onMatchReady?: () => void;
}) {
  const isKycVerified = user?.kycStatus === "verified" || user?.email?.toLowerCase() === "danielnotexist@gmail.com";
  const requiresKyc = accountMode === "live";
  const [matchState, setMatchState] = useState<"idle" | "searching" | "ready_check" | "connecting">("idle");
  const [searchTime, setSearchTime] = useState(0);
  const [matchType, setMatchType] = useState<"ranked_5v5" | "ranked_2v2">("ranked_5v5");
  const [queueMode, setQueueMode] = useState<"solo" | "party">("solo");
  const [playersJoined, setPlayersJoined] = useState(0);
  const [playersNeeded, setPlayersNeeded] = useState(0);
  const [estimatedWaitSeconds, setEstimatedWaitSeconds] = useState(75);
  const [selectedStakeAmount, setSelectedStakeAmount] = useState<number | null>(5);
  const [onlineNow, setOnlineNow] = useState<Array<{ user_id: string; username: string; avatar_url?: string | null; selected_stake_amount?: number | null }>>([]);
  const [matchedLobbyId, setMatchedLobbyId] = useState<string | null>(null);
  const [readyCheckId, setReadyCheckId] = useState<string | null>(null);
  const [participantUserIds, setParticipantUserIds] = useState<string[]>([]);
  const [acceptedUserIds, setAcceptedUserIds] = useState<string[]>([]);
  const [readyCheckProfiles, setReadyCheckProfiles] = useState<Record<string, { username: string; avatarUrl: string | null }>>({});
  const [friendsList, setFriendsList] = useState<Array<{ id: string; username: string; avatarUrl: string | null }>>([]);
  const [partyInvites, setPartyInvites] = useState<QuickQueuePartyInvite[]>([]);
  const [partyInviteProfiles, setPartyInviteProfiles] = useState<Record<string, { username: string; avatarUrl: string | null }>>({});
  const [partyInviteActionUserId, setPartyInviteActionUserId] = useState<string | null>(null);
  const [incomingInviteActionId, setIncomingInviteActionId] = useState<number | null>(null);
  const [partyInviteBackendMissing, setPartyInviteBackendMissing] = useState(false);
  const [partyPickerOpen, setPartyPickerOpen] = useState(false);
  const pollingRef = useRef<number | null>(null);
  const presenceChannelRef = useRef<any>(null);
  const handledMatchedLobbyRef = useRef<string | null>(null);
  const seenPartyInviteStatusesRef = useRef<Record<number, string>>({});
  const queueRequestVersionRef = useRef(0);
  const cancelInFlightRef = useRef(false);
  const suppressAutoQueueUntilRef = useRef(0);

  const selectedTeamSize = matchType === "ranked_2v2" ? 2 : 5;
  const selectedQueueLabel = matchType === "ranked_2v2" ? "WINGMAN 2V2" : "COMPETITIVE 5V5";
  const maxPartyMembers = selectedTeamSize - 1;
  const onlineNowIds = new Set(onlineNow.map((entry) => entry.user_id));
  const hasCurrentUserAccepted = !!user?.id && acceptedUserIds.includes(user.id);
  const currentConfigPartyInvites = partyInvites.filter(
    (invite) =>
      invite.host_user_id === user?.id &&
      invite.mode === accountMode &&
      invite.team_size === selectedTeamSize &&
      Number(invite.stake_amount) === Number(selectedStakeAmount || 0) &&
      invite.status !== "cancelled" &&
      invite.status !== "expired"
  );
  const acceptedIncomingPartyInvite =
    partyInvites.find(
      (invite) =>
        invite.invitee_user_id === user?.id &&
        invite.status === "accepted" &&
        invite.mode === accountMode
    ) || null;
  const partyInviteByFriendId = new Map(currentConfigPartyInvites.map((invite) => [invite.invitee_user_id, invite]));
  const selectedPartyMemberIds = currentConfigPartyInvites.map((invite) => invite.invitee_user_id);
  const selectedPartyMembers = currentConfigPartyInvites
    .map((invite) => {
      const friend = friendsList.find((entry) => entry.id === invite.invitee_user_id);
      const profile = partyInviteProfiles[invite.invitee_user_id];
      return {
        id: invite.invitee_user_id,
        username: friend?.username || profile?.username || `Player ${invite.invitee_user_id.slice(0, 8)}`,
        avatarUrl: friend?.avatarUrl || profile?.avatarUrl || null,
        status: invite.status,
      };
    })
    .slice(0, maxPartyMembers);
  const acceptedPartyMembers = selectedPartyMembers.filter((member) => member.status === "accepted");
  const incomingPartyHost = acceptedIncomingPartyInvite
    ? {
        id: acceptedIncomingPartyInvite.host_user_id,
        username:
          partyInviteProfiles[acceptedIncomingPartyInvite.host_user_id]?.username ||
          `Player ${acceptedIncomingPartyInvite.host_user_id.slice(0, 8)}`,
        avatarUrl: partyInviteProfiles[acceptedIncomingPartyInvite.host_user_id]?.avatarUrl || null,
        status: "accepted",
      }
    : null;
  const visiblePartyMembers =
    selectedPartyMembers.length > 0 ? selectedPartyMembers : incomingPartyHost ? [incomingPartyHost] : [];
  const selfPartyMember = {
    id: user?.id || "self",
    username: user?.username || "You",
    avatarUrl: user?.avatarUrl || null,
    status: "accepted",
    isSelf: true,
  };
  const displayedPartyMembers = [selfPartyMember, ...visiblePartyMembers];
  const isPartyInviteGuest = !!incomingPartyHost && selectedPartyMembers.length === 0;
  const availablePartyFriends = friendsList.filter((friend) => !visiblePartyMembers.some((member) => member.id === friend.id));
  const pendingIncomingPartyInvites = partyInvites.filter(
    (invite) => invite.invitee_user_id === user?.id && invite.status === "pending"
  );
  const localPartySize = queueMode === "party" ? displayedPartyMembers.length : 1;
  const effectivePlayersJoined = queueMode === "party" ? Math.max(playersJoined, localPartySize) : playersJoined;
  const effectivePlayersNeeded =
    queueMode === "party"
      ? Math.max(selectedTeamSize * 2 - effectivePlayersJoined, 0)
      : Math.max(playersNeeded, 0);

  useEffect(() => {
    if (typeof window === "undefined" || !user?.id) {
      return;
    }

    try {
      const raw = window.localStorage.getItem(QUICK_QUEUE_STATE_STORAGE_KEY);
      if (!raw) {
        return;
      }

      const savedState = JSON.parse(raw) as {
        userId?: string;
        accountMode?: AccountMode;
        matchType?: "ranked_5v5" | "ranked_2v2";
        queueMode?: "solo" | "party";
        selectedStakeAmount?: number | null;
        matchState?: "idle" | "searching" | "ready_check" | "connecting";
        searchTime?: number;
        playersJoined?: number;
        playersNeeded?: number;
        estimatedWaitSeconds?: number;
        matchedLobbyId?: string | null;
        readyCheckId?: string | null;
        participantUserIds?: string[];
        acceptedUserIds?: string[];
      };

      if (savedState.userId !== user.id || savedState.accountMode !== accountMode) {
        return;
      }

      if (savedState.matchType) {
        setMatchType(savedState.matchType);
      }
      if (savedState.queueMode) {
        setQueueMode(savedState.queueMode);
      }
      if (typeof savedState.selectedStakeAmount !== "undefined") {
        setSelectedStakeAmount(savedState.selectedStakeAmount);
      }
      if (savedState.matchState && savedState.matchState !== "idle") {
        setMatchState(savedState.matchState);
        setSearchTime(savedState.searchTime || 0);
        setPlayersJoined(savedState.playersJoined || 0);
        setPlayersNeeded(savedState.playersNeeded || 0);
        setEstimatedWaitSeconds(savedState.estimatedWaitSeconds || 75);
        setMatchedLobbyId(savedState.matchedLobbyId || null);
        setReadyCheckId(savedState.readyCheckId || null);
        setParticipantUserIds(savedState.participantUserIds || []);
        setAcceptedUserIds(savedState.acceptedUserIds || []);
      }
    } catch (error) {
      console.error("Failed to restore quick queue state:", error);
    }
  }, [user?.id, accountMode]);

  useEffect(() => {
    if (typeof window === "undefined" || !user?.id) {
      return;
    }

    if (matchState === "idle") {
      window.localStorage.removeItem(QUICK_QUEUE_STATE_STORAGE_KEY);
      return;
    }

    window.localStorage.setItem(
      QUICK_QUEUE_STATE_STORAGE_KEY,
      JSON.stringify({
        userId: user.id,
        accountMode,
        matchType,
        queueMode,
        selectedStakeAmount,
        matchState,
        searchTime,
        playersJoined,
        playersNeeded,
        estimatedWaitSeconds,
        matchedLobbyId,
        readyCheckId,
        participantUserIds,
        acceptedUserIds,
      })
    );
  }, [
    user?.id,
    accountMode,
    matchType,
    queueMode,
    selectedStakeAmount,
    matchState,
    searchTime,
    playersJoined,
    playersNeeded,
    estimatedWaitSeconds,
    matchedLobbyId,
    readyCheckId,
    participantUserIds,
    acceptedUserIds,
  ]);

  useEffect(() => {
    if (!user?.id) return;

    const loadFriends = async () => {
      try {
        const [asOwnerRes, asPeerRes] = await Promise.all([
          supabase.from("friends").select("friend_id").eq("user_id", user.id),
          supabase.from("friends").select("user_id").eq("friend_id", user.id),
        ]);

        if (asOwnerRes.error) throw asOwnerRes.error;
        if (asPeerRes.error) throw asPeerRes.error;

        const ids = new Set<string>();
        (asOwnerRes.data ?? []).forEach((row: any) => ids.add(row.friend_id));
        (asPeerRes.data ?? []).forEach((row: any) => ids.add(row.user_id));

        if (!ids.size) {
          setFriendsList([]);
          return;
        }

        const profileMap = await fetchPublicProfileBasics(Array.from(ids));
        const mapped = Array.from(ids)
          .map((id) => {
            const profile = profileMap.get(id);
            return {
              id,
              username: profile?.username?.trim() || profile?.email?.split("@")[0]?.trim() || `Player ${id.slice(0, 8)}`,
              avatarUrl: profile?.avatar_url || null,
            };
          })
          .sort((a, b) => a.username.localeCompare(b.username));

        setFriendsList(mapped);
      } catch (error) {
        console.error("Failed to load party friends:", error);
      }
    };

    void loadFriends();
  }, [user?.id, maxPartyMembers]);

  useEffect(() => {
    if (!user?.id) {
      setPartyInvites([]);
      return;
    }

    let cancelled = false;

    const loadPartyInvites = async () => {
      try {
        const rows = await fetchQuickQueuePartyInvites(user.id);
        if (!cancelled) {
          setPartyInviteBackendMissing(false);
          setPartyInvites(rows);
        }
      } catch (error) {
        console.error("Failed to load party invites:", error);
        if (!cancelled && isPartyInviteBackendError(error)) {
          setPartyInviteBackendMissing(true);
        }
      }
    };

    void loadPartyInvites();
    const interval = window.setInterval(() => {
      void loadPartyInvites();
    }, 1500);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [user?.id]);

  useEffect(() => {
    const profileIds = Array.from(
      new Set(
        partyInvites.flatMap((invite) => [invite.host_user_id, invite.invitee_user_id]).filter((id) => id !== user?.id)
      )
    );

    if (!profileIds.length) {
      setPartyInviteProfiles({});
      return;
    }

    const loadPartyInviteProfiles = async () => {
      try {
        const profileMap = await fetchPublicProfileBasics(profileIds);
        const next: Record<string, { username: string; avatarUrl: string | null }> = {};

        profileIds.forEach((id) => {
          const profile = profileMap.get(id);
          next[id] = {
            username: profile?.username?.trim() || profile?.email?.split("@")[0]?.trim() || `Player ${id.slice(0, 8)}`,
            avatarUrl: profile?.avatar_url || null,
          };
        });

        setPartyInviteProfiles(next);
      } catch (error) {
        console.error("Failed to load party invite profiles:", error);
      }
    };

    void loadPartyInviteProfiles();
  }, [partyInvites, user?.id]);

  useEffect(() => {
    if (!acceptedIncomingPartyInvite) {
      return;
    }

    setQueueMode("party");
    setSelectedStakeAmount(Number(acceptedIncomingPartyInvite.stake_amount));
    setMatchType(acceptedIncomingPartyInvite.team_size === 2 ? "ranked_2v2" : "ranked_5v5");
  }, [acceptedIncomingPartyInvite]);

  useEffect(() => {
    const hostOwnedInvites = partyInvites.filter((invite) => invite.host_user_id === user?.id);
    const previous = seenPartyInviteStatusesRef.current;

    hostOwnedInvites.forEach((invite) => {
      const lastStatus = previous[invite.id];
      if (lastStatus && lastStatus !== "accepted" && invite.status === "accepted") {
        const profile = partyInviteProfiles[invite.invitee_user_id];
        playNotificationSound();
        addToast(`${profile?.username || "Your teammate"} accepted your party invite.`, "success");
      }
      previous[invite.id] = invite.status;
    });
  }, [addToast, partyInviteProfiles, partyInvites, user?.id]);

  useEffect(() => {
    if (!user?.id || matchState === "connecting") {
      return;
    }

    if (cancelInFlightRef.current || suppressAutoQueueUntilRef.current > Date.now()) {
      return;
    }

    let cancelled = false;
    const requestVersion = queueRequestVersionRef.current;

    const syncQueueStateFromBackend = async () => {
      try {
        const status = await fetchMyQuickQueueStatus(accountMode);
        if (!status) {
          return;
        }

        const backendStakeAmount = Number(status.stake_amount || 0);
        const backendMatchType = status.team_size === 2 ? "ranked_2v2" : "ranked_5v5";
        const backendQueueMode = status.queue_mode === "party" ? "party" : "solo";

        if (
          !cancelled &&
          !cancelInFlightRef.current &&
          requestVersion === queueRequestVersionRef.current
        ) {
          if (backendStakeAmount && selectedStakeAmount !== backendStakeAmount) {
            setSelectedStakeAmount(backendStakeAmount);
          }
          if (matchType !== backendMatchType) {
            setMatchType(backendMatchType);
          }
          if (queueMode !== backendQueueMode) {
            setQueueMode(backendQueueMode);
          }
          applyQueueStatus(status);
        }
      } catch (error) {
        console.error("Failed to sync quick queue state from backend:", error);
      }
    };

    void syncQueueStateFromBackend();
    const interval = window.setInterval(() => {
      void syncQueueStateFromBackend();
    }, 1000);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [accountMode, matchState, matchType, queueMode, selectedStakeAmount, user?.id]);

  useEffect(() => {
    if (queueMode !== "party" || isPartyInviteGuest) {
      setPartyPickerOpen(false);
    }
  }, [queueMode, isPartyInviteGuest]);

  useEffect(() => {
    if (!participantUserIds.length) {
      setReadyCheckProfiles({});
      return;
    }

    const loadReadyCheckProfiles = async () => {
      try {
        const profileMap = await fetchPublicProfileBasics(participantUserIds);
        const next: Record<string, { username: string; avatarUrl: string | null }> = {};

        participantUserIds.forEach((id) => {
          const profile = profileMap.get(id);
          next[id] = {
            username: profile?.username?.trim() || profile?.email?.split("@")[0]?.trim() || `Player ${id.slice(0, 8)}`,
            avatarUrl: profile?.avatar_url || null,
          };
        });

        setReadyCheckProfiles(next);
      } catch (error) {
        console.error("Failed to load ready-check profiles:", error);
      }
    };

    void loadReadyCheckProfiles();
  }, [participantUserIds]);

  useEffect(() => {
    if (matchState !== "searching") return;
    const interval = window.setInterval(() => {
      setSearchTime((prev) => prev + 1);
    }, 1000);
    return () => {
      window.clearInterval(interval);
    };
  }, [matchState]);

  useEffect(() => {
    if (matchState !== "ready_check") {
      return;
    }

    playMatchFoundSound();
    const interval = window.setInterval(() => {
      playMatchFoundSound();
    }, 2200);

    return () => {
      window.clearInterval(interval);
    };
  }, [matchState]);

  const applyQueueStatus = (status: QuickQueueStatus | null) => {
    if (!status) return;

    setPlayersJoined(status.players_joined || 0);
    setPlayersNeeded(status.players_needed || 0);
    setEstimatedWaitSeconds(status.estimated_wait_seconds || 10);
    setMatchedLobbyId(status.lobby_id || null);
    setReadyCheckId(status.ready_check_id || null);
    setParticipantUserIds(status.participant_user_ids || []);
    setAcceptedUserIds(status.accepted_user_ids || []);

    if (status.status === "matched" && status.lobby_id) {
      if (handledMatchedLobbyRef.current !== status.lobby_id) {
        handledMatchedLobbyRef.current = status.lobby_id;
        setMatchState("connecting");
        addToast("All players accepted. Opening your new lobby...", "success");
        window.setTimeout(() => {
          onMatchReady?.();
        }, 500);
      }
      return;
    }

    handledMatchedLobbyRef.current = null;
    setMatchState(status.status === "ready_check" ? "ready_check" : "searching");
  };

  useEffect(() => {
    if (!user?.id) return;
    if (presenceChannelRef.current) {
      supabase.removeChannel(presenceChannelRef.current);
      presenceChannelRef.current = null;
    }

    const channel = supabase.channel(`battlefield-online-${accountMode}`, {
      config: { presence: { key: user.id } },
    });

    channel
      .on("presence", { event: "sync" }, () => {
        const state = channel.presenceState();
        const flattened = Object.values(state)
          .flat()
          .map((entry: any) => ({
            user_id: entry.user_id as string,
            username: entry.username as string,
            avatar_url: entry.avatar_url as string | null,
            selected_stake_amount: typeof entry.selected_stake_amount === "number" ? entry.selected_stake_amount : null,
          }))
          .filter((entry) => !!entry.user_id);
        const byId = new Map<string, { user_id: string; username: string; avatar_url?: string | null; selected_stake_amount?: number | null }>();
        flattened.forEach((entry) => byId.set(entry.user_id, entry));
        setOnlineNow(Array.from(byId.values()));
      })
      .subscribe(async (status: string) => {
        if (status === "SUBSCRIBED") {
          await channel.track({
            user_id: user.id,
            username: user.username || user.email?.split("@")[0] || "Player",
            avatar_url: user.avatarUrl || null,
            selected_stake_amount: selectedStakeAmount,
            online_at: new Date().toISOString(),
          });
        }
      });

    presenceChannelRef.current = channel;
    return () => {
      if (presenceChannelRef.current) {
        supabase.removeChannel(presenceChannelRef.current);
        presenceChannelRef.current = null;
      }
    };
  }, [user?.id, accountMode, user?.username, user?.email, user?.avatarUrl, selectedStakeAmount]);

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60).toString().padStart(2, "0");
    const s = (seconds % 60).toString().padStart(2, "0");
    return `${m}:${s}`;
  };

  const formatStakeLabel = (amount: number | null | undefined) =>
    amount ? `${Number(amount).toFixed(Number(amount) >= 100 ? 0 : 0)} USDT` : "No stake";

  const isPartyInviteBackendError = (error: any) => {
    const message = String(error?.message || "");
    return (
      error?.code === "PGRST205" ||
      error?.code === "PGRST202" ||
      message.includes("quick_queue_party_invites") ||
      message.includes("send_quick_queue_party_invite") ||
      message.includes("respond_quick_queue_party_invite")
    );
  };

  const getPartyInviteStatusText = (status: string) => {
    if (status === "accepted") return "Accepted";
    if (status === "declined") return "Declined";
    if (status === "pending") return "Waiting for approval";
    if (status === "cancelled") return "Invite cancelled";
    return "Ready to invite";
  };

  const getPartyInviteStatusClasses = (status: string) => {
    if (status === "accepted") return "border-emerald-300/30 bg-emerald-400/10 text-emerald-300";
    if (status === "declined") return "border-rose-300/30 bg-rose-400/10 text-rose-300";
    if (status === "pending") return "border-esport-accent/30 bg-esport-accent/10 text-esport-accent";
    return "border-white/10 bg-white/5 text-esport-text-muted";
  };

  const resetQuickQueueState = (nextState: "idle" | "searching" = "idle") => {
    queueRequestVersionRef.current += 1;
    setMatchState(nextState);
    setSearchTime(0);
    setPlayersJoined(0);
    setPlayersNeeded(0);
    setEstimatedWaitSeconds(75);
    setMatchedLobbyId(null);
    setReadyCheckId(null);
    setParticipantUserIds([]);
    setAcceptedUserIds([]);
    handledMatchedLobbyRef.current = null;
  };

  const startSearch = async () => {
    if (requiresKyc && !isKycVerified) {
      addToast("KYC Verification required to play", "error");
      return;
    }
    if (accountMode !== "demo") {
      addToast("Switch to Demo Account from Profile before entering matchmaking.", "error");
      return;
    }
    if (!selectedStakeAmount) {
      addToast("Choose how much you want to play for before starting matchmaking.", "error");
      return;
    }
    if (queueMode === "party" && acceptedPartyMembers.length === 0) {
      addToast("Invite a friend and wait for them to accept before searching.", "error");
      return;
    }
    try {
      cancelInFlightRef.current = false;
      suppressAutoQueueUntilRef.current = 0;
      const requestVersion = ++queueRequestVersionRef.current;
      setSearchTime(0);
      setMatchState("searching");
      const status = await quickQueueJoinOrMatch(accountMode, selectedTeamSize, queueMode, selectedStakeAmount);
      if (!cancelInFlightRef.current && requestVersion === queueRequestVersionRef.current) {
        applyQueueStatus(status);
      }
      addToast("Searching for real players in queue...", "info");
    } catch (error: any) {
      console.error(error);
      setMatchState("idle");
      addToast(error?.message || "Failed to start quick queue.", "error");
    }
  };

  const togglePartyMember = async (friendId: string) => {
    const existingInvite = partyInviteByFriendId.get(friendId);

    if (existingInvite) {
      setPartyInviteActionUserId(friendId);
      try {
        await respondQuickQueuePartyInvite(existingInvite.id, "cancel");
        setPartyInvites((current) =>
          current.map((invite) =>
            invite.id === existingInvite.id
              ? { ...invite, status: "cancelled", responded_at: new Date().toISOString(), updated_at: new Date().toISOString() }
              : invite
          )
        );
        addToast("Party invite removed.", "info");
      } catch (error: any) {
        console.error("Failed to cancel party invite:", error);
        addToast(error?.message || "Failed to remove party invite.", "error");
      } finally {
        setPartyInviteActionUserId(null);
      }
      return;
    }

    if (currentConfigPartyInvites.length >= maxPartyMembers) {
      addToast(`You can invite up to ${maxPartyMembers} friend${maxPartyMembers === 1 ? "" : "s"} for this queue.`, "error");
      return;
    }

    if (!selectedStakeAmount) {
      addToast("Choose a stake amount before inviting a party member.", "error");
      return;
    }

    setPartyInviteActionUserId(friendId);
    try {
      await sendQuickQueuePartyInvite(friendId, accountMode, selectedTeamSize, selectedStakeAmount);
      setPartyInviteBackendMissing(false);
      setPartyInvites((current) => {
        const existingIndex = current.findIndex((invite) => invite.host_user_id === user?.id && invite.invitee_user_id === friendId);
        const nextInvite: QuickQueuePartyInvite = {
          id: existingIndex >= 0 ? current[existingIndex].id : Date.now(),
          host_user_id: user?.id || "",
          invitee_user_id: friendId,
          mode: accountMode,
          team_size: selectedTeamSize,
          stake_amount: selectedStakeAmount,
          status: "pending",
          created_at: existingIndex >= 0 ? current[existingIndex].created_at : new Date().toISOString(),
          updated_at: new Date().toISOString(),
          responded_at: null,
        };

        if (existingIndex >= 0) {
          const next = [...current];
          next[existingIndex] = nextInvite;
          return next;
        }

        return [nextInvite, ...current];
      });
      addToast("Party invite sent. Waiting for your friend to accept.", "success");
    } catch (error: any) {
      console.error("Failed to send party invite:", error);
      if (isPartyInviteBackendError(error)) {
        setPartyInviteBackendMissing(true);
        addToast("Party invites are not active in Supabase yet. Run migration 20260413_0038 first.", "error");
      } else {
        addToast(error?.message || "Failed to send party invite.", "error");
      }
    } finally {
      setPartyInviteActionUserId(null);
    }
  };

  const respondToIncomingPartyInvite = async (inviteId: number, action: "accept" | "decline") => {
    setIncomingInviteActionId(inviteId);
    try {
      await respondQuickQueuePartyInvite(inviteId, action);
      setPartyInviteBackendMissing(false);
      const nextStatus = action === "accept" ? "accepted" : "declined";
      setPartyInvites((current) =>
        current.map((invite) =>
          invite.id === inviteId
            ? { ...invite, status: nextStatus, responded_at: new Date().toISOString(), updated_at: new Date().toISOString() }
            : invite
        )
      );
      addToast(action === "accept" ? "Party invite accepted." : "Party invite declined.", action === "accept" ? "success" : "info");
    } catch (error: any) {
      console.error("Failed to respond to party invite:", error);
      if (isPartyInviteBackendError(error)) {
        setPartyInviteBackendMissing(true);
        addToast("Party invites are not active in Supabase yet. Run migration 20260413_0038 first.", "error");
      } else {
        addToast(error?.message || "Failed to respond to the party invite.", "error");
      }
    } finally {
      setIncomingInviteActionId(null);
    }
  };

  const acceptMatch = async (accept: boolean) => {
    if (!readyCheckId) return;

    try {
      const status = await quickQueueAcceptMatch(readyCheckId, accept);
      if (!accept) {
        resetQuickQueueState("idle");
        addToast("You declined the ready check. Returning to matchmaking.", "info");
        return;
      }
      applyQueueStatus(status);
    } catch (error: any) {
      console.error("Failed to respond to ready check:", error);
      addToast(error?.message || "Failed to respond to ready check.", "error");
    }
  };

  const cancelSearch = async () => {
    cancelInFlightRef.current = true;
    suppressAutoQueueUntilRef.current = Date.now() + 4000;
    if (pollingRef.current) {
      window.clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
    resetQuickQueueState("idle");
    try {
      await quickQueueCancel(accountMode);
    } catch (error) {
      console.error("Failed to cancel quick queue:", error);
    } finally {
      window.setTimeout(() => {
        cancelInFlightRef.current = false;
      }, 250);
    }
  };

  useEffect(() => {
    if (!["searching", "ready_check"].includes(matchState)) {
      if (pollingRef.current) {
        window.clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
      return;
    }

    const poll = async () => {
      try {
        if (!selectedStakeAmount) return;
        const requestVersion = queueRequestVersionRef.current;
        const nextStatus = await quickQueueJoinOrMatch(accountMode, selectedTeamSize, queueMode, selectedStakeAmount);
        if (!cancelInFlightRef.current && requestVersion === queueRequestVersionRef.current) {
          applyQueueStatus(nextStatus);
        }
      } catch (error) {
        console.error("Quick queue poll failed:", error);
      }
    };

    void poll();
    const interval = window.setInterval(() => {
      void poll();
    }, 750);
    pollingRef.current = interval;

    return () => {
      window.clearInterval(interval);
      pollingRef.current = null;
    };
  }, [matchState, accountMode, selectedTeamSize, queueMode, selectedStakeAmount]);

  if (requiresKyc && !isKycVerified) {
    return (
      <div className="max-w-5xl mx-auto h-[60vh] flex flex-col items-center justify-center text-center space-y-6">
        <div className="w-24 h-24 bg-esport-danger/10 rounded-full flex items-center justify-center">
          <Lock size={48} className="text-esport-danger" />
        </div>
        <div className="space-y-2">
          <h2 className="text-3xl font-display font-bold uppercase tracking-tight">Battlefield Locked</h2>
          <p className="text-esport-text-muted max-w-md mx-auto">
            You must complete your KYC verification before you can enter the battlefield and compete for prizes.
          </p>
        </div>
        <button
          onClick={() => openModal("KYC Verification", <KYCForm addToast={addToast} user={user} />)}
          className="esport-btn-primary px-8 py-4 uppercase tracking-widest text-sm"
        >
          Verify Identity Now
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-display font-bold uppercase tracking-tight">Battlefield</h2>
          <p className="text-esport-text-muted">
            {accountMode === "demo"
              ? "Quick matchmaking is active here. Use Battlefield only for instant solo or party queue search."
              : "Quick matchmaking is currently restricted to Demo Accounts so queue and server flows can be tested safely."}
          </p>
        </div>
        <div className="flex items-center gap-4 bg-esport-card border border-esport-border px-4 py-2 rounded-lg">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-esport-success animate-pulse" />
            <span className="text-sm font-bold">
              {accountMode === "demo" ? `Quick Queue Online - ${onlineNow.length}` : "Live Queue Locked"}
            </span>
          </div>
        </div>
      </div>

      {accountMode !== "demo" && (
        <div className="esport-card p-6 border border-esport-secondary/30 bg-esport-secondary/5">
          <div className="flex items-start gap-4">
            <div className="w-10 h-10 rounded-full bg-esport-secondary/10 flex items-center justify-center text-esport-secondary shrink-0">
              <ShieldAlert size={18} />
            </div>
            <div className="space-y-2">
              <div className="text-sm font-bold uppercase tracking-widest text-white">Demo Account Required</div>
              <p className="text-sm text-esport-text-muted">
                Battlefield quick-queue testing is isolated to demo-mode users only. Switch from the Profile section to enter the demo environment.
              </p>
            </div>
          </div>
        </div>
      )}

      {matchState === "idle" && (
        <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1.45fr)_320px] gap-5">
          <div className="space-y-4">
            <div className="esport-card p-5 border border-esport-border">
              <div className="flex items-center justify-between gap-4 mb-4">
                <div>
                  <h3 className="text-xl font-bold font-display uppercase">Queue Type</h3>
                  <p className="text-sm text-esport-text-muted">Pick whether you are searching alone or entering quick queue with your party.</p>
                </div>
                <div className="text-[10px] uppercase tracking-widest text-esport-text-muted">Battlefield only</div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => setQueueMode("solo")}
                  className={`rounded-xl border p-4 text-left transition-colors ${queueMode === "solo" ? "border-esport-accent bg-esport-accent/10" : "border-esport-border bg-black/20 hover:border-white/20"}`}
                >
                  <div className="text-sm font-bold text-white">Solo Quick Match</div>
                  <div className="text-xs text-esport-text-muted mt-1">Find a random team and queue on your own.</div>
                </button>
                <button
                  onClick={() => setQueueMode("party")}
                  className={`rounded-xl border p-4 text-left transition-colors ${queueMode === "party" ? "border-esport-accent bg-esport-accent/10" : "border-esport-border bg-black/20 hover:border-white/20"}`}
                >
                  <div className="text-sm font-bold text-white">Party Quick Match</div>
                  <div className="text-xs text-esport-text-muted mt-1">Enter the random queue with your current squad or party.</div>
                </button>
              </div>
            </div>

            <div className="esport-card p-5 border border-esport-border bg-[radial-gradient(circle_at_top_right,rgba(59,130,246,0.16),transparent_42%)]">
              <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div>
                  <h3 className="text-xl font-bold font-display uppercase">Stake Amount</h3>
                  <p className="text-sm text-esport-text-muted">
                    Choose how much you want to play for. Queue matching will only combine players on the same amount.
                  </p>
                </div>
                <div className="rounded-full border border-esport-accent/30 bg-esport-accent/10 px-4 py-2 text-xs font-bold uppercase tracking-[0.22em] text-esport-accent">
                  {formatStakeLabel(selectedStakeAmount)}
                </div>
              </div>

              <div className="mt-4 grid grid-cols-4 gap-2">
                {STAKE_OPTIONS.map((amount) => {
                  const active = selectedStakeAmount === amount;
                  return (
                    <button
                      key={amount}
                      type="button"
                      onClick={() => setSelectedStakeAmount(amount)}
                        className={`rounded-xl border px-3 py-3 text-left transition-all ${
                        active
                          ? "border-esport-accent bg-esport-accent/12 shadow-[0_0_20px_rgba(59,130,246,0.18)]"
                          : "border-esport-border bg-black/20 hover:border-white/20"
                      }`}
                    >
                      <div className="text-[10px] uppercase tracking-[0.2em] text-esport-text-muted">Entry</div>
                      <div className="mt-1 text-xl font-display font-bold text-white">${amount}</div>
                    </button>
                  );
                })}
              </div>

              <div className="mt-4 flex items-center justify-between gap-4 rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
                <div>
                  <div className="text-[10px] uppercase tracking-[0.2em] text-esport-text-muted">Current choice</div>
                  <div className="mt-1 text-sm font-bold text-white">
                    {selectedStakeAmount ? `You will queue for ${formatStakeLabel(selectedStakeAmount)}` : "No stake selected yet"}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedStakeAmount(null)}
                  className="rounded-full border border-white/10 px-4 py-2 text-[10px] font-bold uppercase tracking-[0.2em] text-esport-text-muted transition-colors hover:border-white/20 hover:text-white"
                >
                  Remove stake
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div
                onClick={() => setMatchType("ranked_5v5")}
                className={`esport-card p-5 border relative overflow-hidden group cursor-pointer transition-colors ${matchType === "ranked_5v5" ? "border-esport-accent" : "border-esport-border hover:border-white/20"}`}
              >
                <div className={`absolute inset-0 bg-gradient-to-r from-esport-accent/20 to-transparent transition-opacity ${matchType === "ranked_5v5" ? "opacity-100" : "opacity-0 group-hover:opacity-50"}`} />
                <div className="flex items-center justify-between relative z-10">
                  <div>
                    <h3 className="text-xl font-bold font-display uppercase mb-1">COMPETETIVE 5V5</h3>
                    <p className="text-sm text-esport-text-muted">Quick competitive matchmaking. Affects your ELO.</p>
                  </div>
                  <div className={`w-12 h-12 rounded-full flex items-center justify-center border transition-colors ${matchType === "ranked_5v5" ? "bg-esport-accent/20 border-esport-accent" : "bg-black/50 border-esport-border"}`}>
                    <Sword className={matchType === "ranked_5v5" ? "text-esport-accent" : "text-esport-text-muted"} />
                  </div>
                </div>
              </div>

              <div
                onClick={() => setMatchType("ranked_2v2")}
                className={`esport-card p-5 border relative overflow-hidden group cursor-pointer transition-colors ${matchType === "ranked_2v2" ? "border-esport-accent" : "border-esport-border hover:border-white/20"}`}
              >
                <div className={`absolute inset-0 bg-gradient-to-r from-esport-accent/20 to-transparent transition-opacity ${matchType === "ranked_2v2" ? "opacity-100" : "opacity-0 group-hover:opacity-50"}`} />
                <div className="flex items-center justify-between relative z-10">
                  <div>
                    <h3 className="text-xl font-bold font-display uppercase mb-1">WINGMAN 2V2</h3>
                    <p className="text-sm text-esport-text-muted">Wingman quick queue. Competitive and fast.</p>
                  </div>
                  <div className={`w-12 h-12 rounded-full flex items-center justify-center border transition-colors ${matchType === "ranked_2v2" ? "bg-esport-accent/20 border-esport-accent" : "bg-black/50 border-esport-border"}`}>
                    <Users className={matchType === "ranked_2v2" ? "text-esport-accent" : "text-esport-text-muted"} />
                  </div>
                </div>
              </div>
            </div>

            {queueMode === "party" && (
              <div className="esport-card p-5 border border-esport-border">
                <div className="flex items-center justify-between gap-4 mb-4">
                  <div>
                    <h3 className="text-xl font-bold font-display uppercase">Party Members</h3>
                    <p className="text-sm text-esport-text-muted">
                      Invite up to {maxPartyMembers} friend{maxPartyMembers === 1 ? "" : "s"} and wait for them to accept before starting queue.
                    </p>
                  </div>
                  <div className="text-[10px] uppercase tracking-widest text-esport-text-muted">
                    {(isPartyInviteGuest ? 1 : acceptedPartyMembers.length)}/{maxPartyMembers} accepted
                  </div>
                </div>

                {partyInviteBackendMissing && (
                  <div className="mb-4 rounded-2xl border border-amber-300/25 bg-amber-400/10 px-4 py-3 text-sm text-amber-100">
                    Party invites are not active in the database yet. Run `20260413_0038_quick_queue_party_invites.sql` in Supabase, then refresh this page.
                  </div>
                )}

                <div className="mb-4 overflow-x-auto custom-scrollbar pb-2">
                  <div className="flex min-w-max gap-3">
                    {Array.from({ length: selectedTeamSize }).map((_, index) => {
                      const friend = displayedPartyMembers[index];

                      if (friend) {
                        return (
                          <button
                            key={`${friend.id}-${index}`}
                            type="button"
                            onClick={() => {
                              if (!isPartyInviteGuest && !("isSelf" in friend && friend.isSelf)) {
                                void togglePartyMember(friend.id);
                              }
                            }}
                            className={`w-[150px] rounded-2xl border p-4 text-center transition-colors ${
                              "isSelf" in friend && friend.isSelf
                                ? "border-white/20 bg-gradient-to-b from-white/[0.08] to-black/40"
                                : "border-esport-accent/40 bg-gradient-to-b from-esport-accent/10 to-black/40 hover:border-esport-accent"
                            }`}
                          >
                            <img
                              src={friend.avatarUrl || `https://ui-avatars.com/api/?name=${encodeURIComponent(friend.username)}&background=1f2937&color=ffffff&size=160`}
                              alt={friend.username}
                              className="mx-auto w-20 h-20 rounded-full border-4 border-white/10 object-cover"
                            />
                            <div className="mt-3 text-sm font-bold text-white truncate">{friend.username}</div>
                            <div className={`mt-2 text-[10px] uppercase tracking-[0.2em] ${
                              friend.status === "accepted"
                                ? "text-emerald-300"
                                : friend.status === "declined"
                                  ? "text-rose-300"
                                  : "text-esport-accent"
                            }`}>
                              {"isSelf" in friend && friend.isSelf
                                ? "You"
                                : friend.status === "accepted"
                                  ? "Accepted"
                                  : friend.status === "declined"
                                    ? "Declined"
                                    : "Pending"}
                            </div>
                          </button>
                        );
                      }

                      return (
                        <button
                          key={`empty-slot-${index}`}
                          type="button"
                          onClick={() => setPartyPickerOpen((current) => !current)}
                          disabled={isPartyInviteGuest}
                          className="w-[150px] rounded-2xl border border-esport-border bg-black/20 p-4 flex flex-col items-center justify-center text-center min-h-[180px] transition-colors hover:border-esport-accent disabled:opacity-60"
                        >
                          <div className="text-5xl leading-none text-white/30">+</div>
                          <div className="mt-3 text-[10px] uppercase tracking-[0.2em] text-esport-text-muted">Empty Slot</div>
                          <div className="mt-2 text-[10px] font-bold uppercase tracking-[0.2em] text-esport-accent">Click to invite</div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {!isPartyInviteGuest && (
                  <div className="mb-4 flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
                    <div>
                      <div className="text-[10px] uppercase tracking-[0.2em] text-esport-text-muted">Quick Invite</div>
                      <div className="mt-1 text-sm font-bold text-white">Use the `+` slot to choose a friend and send the invite.</div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setPartyPickerOpen((current) => !current)}
                      className="rounded-full border border-esport-accent/30 bg-esport-accent/10 px-4 py-2 text-[10px] font-bold uppercase tracking-[0.2em] text-esport-accent"
                    >
                      {partyPickerOpen ? "Hide Friends" : "Open Friends"}
                    </button>
                  </div>
                )}

                {partyPickerOpen && !isPartyInviteGuest && (
                  availablePartyFriends.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-esport-border bg-black/20 px-4 py-6 text-sm text-esport-text-muted">
                      No friends available yet. Add friends in Social before entering Party Queue.
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-[320px] overflow-y-auto custom-scrollbar pr-1">
                    {availablePartyFriends.map((friend) => {
                      const invite = partyInviteByFriendId.get(friend.id);
                      const isSelected = !!invite;
                      const isOnline = onlineNowIds.has(friend.id);
                      const inviteStatus = invite?.status || "none";
                      const actionLabel =
                        partyInviteActionUserId === friend.id
                          ? "Updating..."
                          : inviteStatus === "accepted"
                            ? "Remove Friend"
                            : inviteStatus === "declined"
                              ? "Reinvite"
                              : inviteStatus === "pending"
                                ? "Cancel Invite"
                                : "Send Invite";

                      return (
                        <div
                          key={friend.id}
                          className={`rounded-2xl border p-4 transition-colors ${
                            isSelected
                              ? "border-esport-accent bg-esport-accent/10 shadow-[0_0_24px_rgba(59,130,246,0.12)]"
                              : "border-esport-border bg-black/20 hover:border-white/20"
                          }`}
                        >
                          <div className="flex items-start gap-3">
                            <img
                              src={friend.avatarUrl || `https://ui-avatars.com/api/?name=${encodeURIComponent(friend.username)}&background=1f2937&color=ffffff&size=96`}
                              alt={friend.username}
                              className="h-12 w-12 rounded-xl border border-white/15 object-cover"
                            />
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <div className="max-w-full truncate text-sm font-bold text-white">{friend.username}</div>
                                <span className={`rounded-full border px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.18em] ${
                                  isOnline
                                    ? "border-emerald-300/30 bg-emerald-400/10 text-emerald-300"
                                    : "border-white/10 bg-white/5 text-esport-text-muted"
                                }`}>
                                  {isOnline ? "Online" : "Offline"}
                                </span>
                              </div>
                              <div className="mt-2 text-[10px] font-bold uppercase tracking-[0.2em] text-esport-text-muted">
                                Friend
                              </div>
                              <div className="mt-1 text-xs leading-5 text-esport-text-muted">
                                {inviteStatus === "accepted"
                                  ? "This friend already accepted your party invite."
                                  : inviteStatus === "pending"
                                    ? "Invite sent. Waiting for your friend to approve it."
                                    : inviteStatus === "declined"
                                      ? "Your friend declined the last invite. You can send a new one."
                                      : "Send a party invite so this friend can approve and join your queue."}
                              </div>
                            </div>
                          </div>

                          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                            <span className={`rounded-full border px-3 py-1 text-[10px] font-bold uppercase tracking-[0.18em] ${getPartyInviteStatusClasses(inviteStatus)}`}>
                              {getPartyInviteStatusText(inviteStatus)}
                            </span>
                            <button
                              type="button"
                              onClick={() => void togglePartyMember(friend.id)}
                              disabled={partyInviteActionUserId === friend.id || partyInviteBackendMissing}
                              className={`rounded-full border px-4 py-2 text-[10px] font-bold uppercase tracking-[0.2em] transition-colors disabled:opacity-50 ${
                                inviteStatus === "accepted" || inviteStatus === "pending"
                                  ? "border-rose-300/30 bg-rose-400/10 text-rose-200 hover:border-rose-300/50"
                                  : "border-esport-accent/30 bg-esport-accent/10 text-esport-accent hover:border-esport-accent/60"
                              }`}
                            >
                              {actionLabel}
                            </button>
                          </div>
                        </div>
                      );
                    })}
                    </div>
                  )
                )}
              </div>
            )}
          </div>

          <div className="esport-card p-5 flex flex-col justify-center items-center text-center space-y-5 xl:sticky xl:top-6 h-fit">
            <div className="w-24 h-24 rounded-full border-4 border-esport-border flex items-center justify-center bg-black/50">
              <Target className="w-10 h-10 text-esport-text-muted" />
            </div>
            <div>
              <div className="text-sm text-esport-text-muted mb-1">{queueMode === "solo" ? "Solo Queue" : "Party Queue"}</div>
              <div className="text-sm text-white font-bold">{selectedQueueLabel}</div>
              <div className="mt-2 text-xs font-bold uppercase tracking-[0.2em] text-esport-accent">
                {selectedStakeAmount ? `Queueing for ${formatStakeLabel(selectedStakeAmount)}` : "Choose a stake amount"}
              </div>
              <div className="text-xs text-esport-text-muted mb-2">Estimated Wait</div>
              <div className="text-2xl font-bold font-mono">{formatTime(estimatedWaitSeconds)}</div>
              {queueMode === "party" && (
                <div className="mt-2 text-xs text-esport-text-muted">
                  Party size: {(isPartyInviteGuest ? 1 : acceptedPartyMembers.length) + 1}/{selectedTeamSize}
                </div>
              )}
              {matchState === "searching" && (
                <div className="mt-2 text-xs text-esport-text-muted">
                  {effectivePlayersJoined} joined - {effectivePlayersNeeded} needed
                </div>
              )}
            </div>
            <button
              onClick={() => void startSearch()}
              disabled={!selectedStakeAmount || (queueMode === "party" && (acceptedPartyMembers.length === 0 || isPartyInviteGuest))}
              className="esport-btn-primary w-full py-4 text-lg animate-pulse hover:animate-none shadow-[0_0_20px_rgba(59,130,246,0.4)] disabled:cursor-not-allowed disabled:opacity-50 disabled:animate-none"
            >
              {queueMode === "solo" ? "FIND SOLO MATCH" : isPartyInviteGuest ? "WAITING FOR PARTY LEADER" : "FIND PARTY MATCH"}
            </button>
            {queueMode === "party" && (
              <div className="w-full rounded-lg border border-esport-border bg-black/20 p-3 text-left">
                <div className="text-[10px] uppercase tracking-widest text-esport-text-muted mb-2">
                  Your Party
                </div>
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <img
                      src={user?.avatarUrl || `https://ui-avatars.com/api/?name=${encodeURIComponent(user?.username || "You")}&background=1f2937&color=ffffff&size=48`}
                      alt={user?.username || "You"}
                      className="w-6 h-6 rounded-full border border-white/20 object-cover"
                    />
                    <span className="text-xs font-bold text-white truncate">{user?.username || "You"} (You)</span>
                  </div>
                  {visiblePartyMembers.map((friend) => (
                    <div key={friend.id} className="flex items-center gap-2">
                      <img
                        src={friend.avatarUrl || `https://ui-avatars.com/api/?name=${encodeURIComponent(friend.username)}&background=1f2937&color=ffffff&size=48`}
                        alt={friend.username}
                        className="w-6 h-6 rounded-full border border-white/20 object-cover"
                      />
                      <span className="text-xs text-white truncate">{friend.username}</span>
                      <span className={`rounded-full border px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.18em] ${
                        friend.status === "accepted"
                          ? "border-emerald-300/30 bg-emerald-400/10 text-emerald-300"
                          : friend.status === "declined"
                            ? "border-rose-300/30 bg-rose-400/10 text-rose-300"
                            : "border-esport-accent/30 bg-esport-accent/10 text-esport-accent"
                      }`}>
                        {friend.status}
                      </span>
                    </div>
                  ))}
                  {visiblePartyMembers.length === 0 && (
                    <div className="text-xs text-esport-text-muted">Invite at least one friend and wait for acceptance to enable party matchmaking.</div>
                  )}
                  {isPartyInviteGuest && (
                    <div className="text-xs text-esport-text-muted">Party leader will start the matchmaking search for this squad.</div>
                  )}
                </div>
              </div>
            )}
            <div className="w-full rounded-lg border border-esport-border bg-black/20 p-3 text-left">
              <div className="text-[10px] uppercase tracking-widest text-esport-text-muted mb-2">
                Looking To Play
              </div>
              <div className="space-y-2 max-h-[160px] overflow-y-auto custom-scrollbar">
                {onlineNow.length === 0 && (
                  <div className="text-xs text-esport-text-muted">No active players on Battlefield right now.</div>
                )}
                {onlineNow.slice(0, 12).map((entry) => (
                  <div key={entry.user_id} className="flex items-center gap-2">
                    <img
                      src={entry.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(entry.username || "Player")}&background=1f2937&color=ffffff&size=48`}
                      alt={entry.username || "Player"}
                      className="w-6 h-6 rounded-full border border-white/20 object-cover"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="text-xs text-white truncate">{entry.username || `Player ${entry.user_id.slice(0, 6)}`}</div>
                    </div>
                    <span className={`shrink-0 rounded-full border px-2 py-1 text-[9px] font-bold uppercase tracking-[0.18em] ${
                      entry.selected_stake_amount
                        ? "border-esport-accent/30 bg-esport-accent/10 text-esport-accent"
                        : "border-white/10 bg-white/5 text-esport-text-muted"
                    }`}>
                      {entry.selected_stake_amount ? `$${entry.selected_stake_amount}` : "No stake"}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {matchState === "searching" && (
        <div className="esport-card p-12 flex flex-col items-center justify-center min-h-[440px] relative overflow-hidden border-esport-accent/40 bg-[radial-gradient(circle_at_top,rgba(59,130,246,0.18),transparent_38%),linear-gradient(180deg,rgba(15,23,42,0.96),rgba(2,6,23,0.98))]">
          <div className="absolute inset-0 flex items-center justify-center opacity-30 pointer-events-none">
            <div className="w-96 h-96 border border-esport-accent rounded-full animate-[ping_3s_linear_infinite]" />
            <div className="w-64 h-64 border border-esport-accent rounded-full absolute animate-[ping_3s_linear_infinite_1s]" />
            <div className="w-32 h-32 border border-esport-accent rounded-full absolute animate-[ping_3s_linear_infinite_2s]" />
          </div>

          <div className="absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-esport-accent/10 to-transparent pointer-events-none" />

          <div className="relative z-10 text-center space-y-7 w-full max-w-2xl">
            <div className="mx-auto inline-flex items-center gap-2 rounded-full border border-esport-accent/30 bg-esport-accent/10 px-4 py-2 text-[11px] font-bold uppercase tracking-[0.25em] text-esport-accent shadow-[0_0_30px_rgba(59,130,246,0.14)]">
              <Clock className="h-3.5 w-3.5" />
              {selectedStakeAmount ? `Searching for ${formatStakeLabel(selectedStakeAmount)}` : "Searching queue"}
            </div>
            <div className="w-20 h-20 mx-auto bg-esport-accent/20 rounded-full flex items-center justify-center border border-esport-accent animate-spin-slow shadow-[0_0_30px_rgba(59,130,246,0.2)]">
              <Search className="w-8 h-8 text-esport-accent" />
            </div>
            <div>
              <h3 className="text-2xl font-bold font-display uppercase tracking-widest text-esport-accent mb-2">{queueMode === "solo" ? "Searching Solo Queue" : "Searching Party Queue"}</h3>
              <div className="text-4xl font-mono font-bold text-white">{formatTime(searchTime)}</div>
              <div className="mt-6 grid gap-3 sm:grid-cols-2">
                <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-5 py-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
                  <div className="text-[10px] font-bold uppercase tracking-[0.24em] text-esport-text-muted">Players Found</div>
                  <div className="mt-2 text-2xl font-display font-bold text-white">
                    {effectivePlayersJoined} / {selectedTeamSize * 2}
                  </div>
                </div>
                <div className="rounded-2xl border border-esport-accent/20 bg-esport-accent/[0.06] px-5 py-4 shadow-[0_0_25px_rgba(59,130,246,0.08)]">
                  <div className="text-[10px] font-bold uppercase tracking-[0.24em] text-esport-text-muted">Still Waiting</div>
                  <div className="mt-2 text-2xl font-display font-bold text-esport-accent">
                    {effectivePlayersNeeded}
                  </div>
                </div>
              </div>
              <div className="mt-5 space-y-2">
                <div className="text-sm font-bold uppercase tracking-[0.2em] text-white/90">
                  Found {effectivePlayersJoined} / {selectedTeamSize * 2} players
                </div>
                <div className="text-sm text-esport-text-muted">
                  Waiting for {effectivePlayersNeeded} more player{effectivePlayersNeeded === 1 ? "" : "s"} to accept this pool.
                </div>
                {selectedStakeAmount && (
                  <div className="inline-flex items-center rounded-full border border-esport-accent/30 bg-esport-accent/10 px-4 py-2 text-[11px] font-bold uppercase tracking-[0.2em] text-esport-accent">
                    Current pool: {formatStakeLabel(selectedStakeAmount)}
                  </div>
                )}
              </div>
            </div>
            <div className="flex justify-center">
              <button
                onClick={() => void cancelSearch()}
                className="esport-btn-secondary min-w-[220px] text-esport-danger border-esport-danger/30 hover:bg-esport-danger/10"
              >
                Cancel Search
              </button>
            </div>
          </div>
        </div>
      )}

      {pendingIncomingPartyInvites.length > 0 && (
        <div className="esport-card p-5 border border-esport-accent/25 bg-[radial-gradient(circle_at_top_left,rgba(59,130,246,0.12),transparent_42%),linear-gradient(180deg,rgba(17,24,39,0.97),rgba(2,6,23,0.98))]">
          <div className="text-[10px] font-bold uppercase tracking-[0.24em] text-esport-accent">Incoming Party Invite</div>
          <div className="mt-4 space-y-3">
            {pendingIncomingPartyInvites.map((invite) => {
              const hostProfile = partyInviteProfiles[invite.host_user_id];
              const hostName = hostProfile?.username || `Player ${invite.host_user_id.slice(0, 8)}`;
              return (
                <div key={invite.id} className="rounded-2xl border border-white/10 bg-black/20 px-4 py-4 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                  <div className="flex items-center gap-3">
                    <img
                      src={hostProfile?.avatarUrl || `https://ui-avatars.com/api/?name=${encodeURIComponent(hostName)}&background=1f2937&color=ffffff&size=96`}
                      alt={hostName}
                      className="h-12 w-12 rounded-2xl border border-white/15 object-cover"
                    />
                    <div>
                      <div className="text-sm font-bold text-white">{hostName} invited you to party up</div>
                      <div className="mt-1 text-[11px] uppercase tracking-[0.2em] text-esport-text-muted">
                        {invite.team_size}v{invite.team_size} • {formatStakeLabel(invite.stake_amount)} • {invite.mode.toUpperCase()}
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-3">
                    <button
                      type="button"
                      disabled={incomingInviteActionId === invite.id}
                      onClick={() => void respondToIncomingPartyInvite(invite.id, "accept")}
                      className="bg-esport-success hover:bg-emerald-400 text-black font-bold py-3 px-6 rounded-xl disabled:opacity-50"
                    >
                      Accept
                    </button>
                    <button
                      type="button"
                      disabled={incomingInviteActionId === invite.id}
                      onClick={() => void respondToIncomingPartyInvite(invite.id, "decline")}
                      className="esport-btn-secondary border-esport-danger/30 text-esport-danger disabled:opacity-50"
                    >
                      Decline
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {matchState === "ready_check" && (
        <div className="esport-card p-12 flex flex-col items-center justify-center min-h-[440px] border-esport-success shadow-[0_0_50px_rgba(16,185,129,0.2)] bg-[radial-gradient(circle_at_top,rgba(16,185,129,0.14),transparent_36%),linear-gradient(180deg,rgba(15,23,42,0.96),rgba(2,6,23,0.98))]">
          <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-esport-success/30 bg-esport-success/10 px-4 py-2 text-[11px] font-bold uppercase tracking-[0.24em] text-emerald-300 shadow-[0_0_30px_rgba(16,185,129,0.14)]">
            <Target className="h-3.5 w-3.5" />
            {selectedStakeAmount ? `Playing for ${formatStakeLabel(selectedStakeAmount)}` : "Ready Check Live"}
          </div>
          <div className="w-24 h-24 mx-auto bg-esport-success/20 rounded-full flex items-center justify-center border-2 border-esport-success mb-6 animate-bounce shadow-[0_0_35px_rgba(16,185,129,0.18)]">
            <CheckCircle2 className="w-12 h-12 text-esport-success" />
          </div>
          <h3 className="text-4xl font-bold font-display uppercase tracking-widest text-white mb-2">MATCH FOUND</h3>
          <p className="text-esport-text-muted mb-8">Each player must press ACCEPT. Once all players accept, a new lobby opens with a random owner.</p>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8 w-full max-w-3xl">
            {participantUserIds.map((participantId) => {
              const profile = readyCheckProfiles[participantId];
              const accepted = acceptedUserIds.includes(participantId);
              const isCurrentUser = participantId === user?.id;
              const username = isCurrentUser
                ? (user?.username || user?.email?.split("@")[0] || "You")
                : (profile?.username || `Player ${participantId.slice(0, 8)}`);
              const avatarUrl =
                (isCurrentUser ? user?.avatarUrl : profile?.avatarUrl) ||
                `https://ui-avatars.com/api/?name=${encodeURIComponent(username)}&background=1f2937&color=ffffff&size=96`;

              return (
                <div key={participantId} className={`rounded-2xl border p-4 text-center ${accepted ? "border-emerald-400/40 bg-emerald-400/10" : "border-esport-border bg-black/30"}`}>
                  <img
                    src={avatarUrl}
                    alt={username}
                    className="mx-auto h-14 w-14 rounded-full border border-white/15 object-cover"
                  />
                  <div className="mt-3 text-sm font-bold text-white truncate">{username}</div>
                  <div className={`mt-2 text-[10px] uppercase tracking-[0.2em] ${accepted ? "text-emerald-300" : "text-esport-text-muted"}`}>
                    {accepted ? "Accepted" : isCurrentUser ? "Waiting For You" : "Waiting"}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="rounded-full border border-esport-accent/20 bg-esport-accent/10 px-6 py-3 text-xl font-mono font-bold text-esport-accent mb-8 shadow-[0_0_20px_rgba(59,130,246,0.12)]">
            {acceptedUserIds.length} / {participantUserIds.length || selectedTeamSize * 2} Accepted
          </div>

          <div className="flex w-full max-w-md flex-col sm:flex-row items-center justify-center gap-4">
            <button
              onClick={() => void acceptMatch(!hasCurrentUserAccepted)}
              className={`w-full sm:flex-1 font-bold py-4 px-12 rounded-lg text-xl transition-transform active:scale-95 ${
                hasCurrentUserAccepted
                  ? "bg-esport-danger hover:bg-rose-500 text-white shadow-[0_0_20px_rgba(244,63,94,0.35)]"
                  : "bg-esport-success hover:bg-emerald-400 text-black shadow-[0_0_20px_rgba(16,185,129,0.4)]"
              }`}
            >
              {hasCurrentUserAccepted ? "UNACCEPT" : "ACCEPT"}
            </button>
            <button onClick={() => void acceptMatch(false)} className="w-full sm:flex-1 esport-btn-secondary py-4 px-8">
              DECLINE
            </button>
          </div>
        </div>
      )}

      {matchState === "connecting" && (
        <div className="esport-card p-12 flex flex-col items-center justify-center min-h-[400px] border-esport-accent">
          <div className="w-20 h-20 mx-auto mb-6 relative">
            <div className="absolute inset-0 border-4 border-esport-border rounded-full" />
            <div className="absolute inset-0 border-4 border-esport-accent rounded-full border-t-transparent animate-spin" />
            <div className="absolute inset-0 flex items-center justify-center">
              <Server className="w-8 h-8 text-esport-accent" />
            </div>
          </div>
          <h3 className="text-3xl font-bold font-display uppercase tracking-widest text-white mb-2">Connecting to Server</h3>
          <p className="text-esport-text-muted font-mono bg-black/50 px-4 py-2 rounded border border-esport-border">
            IP: 192.168.1.{Math.floor(Math.random() * 255)}:27015
          </p>
          <div className="text-xs text-esport-text-muted mt-2">Lobby: {matchedLobbyId || "pending"}</div>
          <button onClick={() => void cancelSearch()} className="mt-8 esport-btn-secondary text-sm">
            Disconnect
          </button>
        </div>
      )}
    </div>
  );
}
