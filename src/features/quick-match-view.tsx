import { CheckCircle2, Clock, Lock, MessageSquare, Search, Server, ShieldAlert, Sword, Target, Users } from "lucide-react";
import React, { useEffect, useRef, useState } from "react";
import { isSupabaseTransientNetworkError, supabase } from "../lib/supabase";
import {
  fetchMyActiveLobby,
  fetchQuickQueuePartyStakeCap,
  fetchMyQuickQueueStatus,
  fetchQuickQueuePartyInvites,
  fetchQuickQueuePartyStakeUpdates,
  quickQueueAcceptMatch,
  quickQueueCancel,
  quickQueueJoinOrMatch,
  requestQuickQueuePartyStakeUpdate,
  respondQuickQueuePartyInvite,
  respondQuickQueuePartyStakeUpdate,
  sendQuickQueuePartyInvite,
  type QuickQueuePartyInvite,
  type QuickQueuePartyStakeUpdate,
  type QuickQueueStatus,
  type SupportedGameMode,
} from "../lib/supabase/matchmaking";
import { fetchPublicProfileBasics } from "../lib/supabase/social";
import {
  playMatchFoundSound,
  playNotificationSound,
  playReadyCheckAcceptSound,
  playReadyCheckCompleteSound,
} from "../lib/sound";
import { KYCForm } from "./landing-auth";
import type { AccountMode } from "./types";

const STAKE_OPTIONS = [5, 10, 25, 50, 100, 300, 500, 1000] as const;
const QUICK_QUEUE_STATE_STORAGE_KEY = "hustle_arena_quick_queue_state";
type QuickMatchType = "ranked_5v5" | "ranked_2v2" | "ranked_team_ffa" | "ranked_ffa";

const TEAM_SIZE_BY_MATCH_TYPE: Record<QuickMatchType, 2 | 5> = {
  ranked_2v2: 2,
  ranked_5v5: 5,
  ranked_team_ffa: 5,
  ranked_ffa: 5,
};

const GAME_MODE_BY_MATCH_TYPE: Record<QuickMatchType, SupportedGameMode> = {
  ranked_2v2: "wingman",
  ranked_5v5: "competitive",
  ranked_team_ffa: "team_ffa",
  ranked_ffa: "ffa",
};

const QUEUE_LABEL_BY_MATCH_TYPE: Record<QuickMatchType, string> = {
  ranked_2v2: "WINGMAN 2V2",
  ranked_5v5: "COMPETITIVE 5V5",
  ranked_team_ffa: "TEAM FFA 5V5",
  ranked_ffa: "FFA 5V5",
};

const backendStatusToMatchType = (teamSize: number, gameMode: string | null | undefined): QuickMatchType => {
  if (teamSize === 2) {
    return "ranked_2v2";
  }
  if (gameMode === "team_ffa") {
    return "ranked_team_ffa";
  }
  if (gameMode === "ffa") {
    return "ranked_ffa";
  }
  return "ranked_5v5";
};

const isPartyStakeUpdateBackendError = (error: any) => {
  const message = String(error?.message || "");
  return (
    error?.code === "42501" ||
    error?.code === "PGRST205" ||
    error?.code === "PGRST202" ||
    message.includes("quick_queue_party_stake_updates") ||
    message.includes("request_quick_queue_party_stake_update") ||
    message.includes("respond_quick_queue_party_stake_update")
  );
};

export function BattlefieldView({
  addToast,
  openModal,
  user,
  accountMode,
  visibleBalance,
  onOpenDirectMessage,
  onMatchReady,
}: {
  addToast: any;
  openModal: any;
  user: any;
  accountMode: AccountMode;
  visibleBalance: number;
  onOpenDirectMessage?: (friendId: string) => void;
  refreshSession?: () => Promise<void>;
  onMatchReady?: () => void;
}) {
  const isKycVerified = user?.kycStatus === "verified" || user?.email?.toLowerCase() === "danielnotexist@gmail.com";
  const requiresKyc = accountMode === "live";
  const [matchState, setMatchState] = useState<"idle" | "searching" | "ready_check" | "connecting">("idle");
  const [searchTime, setSearchTime] = useState(0);
  const [matchType, setMatchType] = useState<QuickMatchType>("ranked_5v5");
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
  const [readyCheckDisplayOrder, setReadyCheckDisplayOrder] = useState<string[]>([]);
  const [readyCheckProfiles, setReadyCheckProfiles] = useState<Record<string, { username: string; avatarUrl: string | null }>>({});
  const [friendsList, setFriendsList] = useState<Array<{ id: string; username: string; avatarUrl: string | null }>>([]);
  const [partyInvites, setPartyInvites] = useState<QuickQueuePartyInvite[]>([]);
  const [partyStakeUpdates, setPartyStakeUpdates] = useState<QuickQueuePartyStakeUpdate[]>([]);
  const [partyStakeCap, setPartyStakeCap] = useState<number | null>(null);
  const [partyStakeUpdateBackendMissing, setPartyStakeUpdateBackendMissing] = useState(false);
  const [partyInviteProfiles, setPartyInviteProfiles] = useState<Record<string, { username: string; avatarUrl: string | null }>>({});
  const [partyInviteActionUserId, setPartyInviteActionUserId] = useState<string | null>(null);
  const [stakeUpdateActionId, setStakeUpdateActionId] = useState<number | null>(null);
  const [incomingInviteActionId, setIncomingInviteActionId] = useState<number | null>(null);
  const [partyInviteBackendMissing, setPartyInviteBackendMissing] = useState(false);
  const [wizardStep, setWizardStep] = useState<1 | 2 | 3>(1);
  const pollingRef = useRef<number | null>(null);
  const presenceChannelRef = useRef<any>(null);
  const handledMatchedLobbyRef = useRef<string | null>(null);
  const seenPartyInviteStatusesRef = useRef<Record<number, string>>({});
  const queueRequestVersionRef = useRef(0);
  const cancelInFlightRef = useRef(false);
  const suppressAutoQueueUntilRef = useRef(0);
  const readyCheckAcceptedCountRef = useRef(0);
  const readyCheckCompletionSoundRef = useRef<string | null>(null);
  const seenStakeUpdateStatusesRef = useRef<Record<number, string>>({});
  const unsupportedQueueModeToastRef = useRef<string | null>(null);

  const selectedTeamSize = TEAM_SIZE_BY_MATCH_TYPE[matchType];
  const selectedGameMode = GAME_MODE_BY_MATCH_TYPE[matchType];
  const selectedQueueLabel = QUEUE_LABEL_BY_MATCH_TYPE[matchType];
  const maxPartyMembers = selectedTeamSize - 1;
  const onlineNowIds = new Set(onlineNow.map((entry) => entry.user_id));
  const hasCurrentUserAccepted = !!user?.id && acceptedUserIds.includes(user.id);
  const currentConfigPartyInvites = partyInvites.filter(
    (invite) =>
      invite.host_user_id === user?.id &&
      invite.mode === accountMode &&
      invite.team_size === selectedTeamSize &&
      Number(invite.stake_amount) === Number(selectedStakeAmount || 0) &&
      invite.status !== "declined" &&
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
  const partyInviteByFriendId = new Map<string, QuickQueuePartyInvite>(
    currentConfigPartyInvites.map((invite) => [invite.invitee_user_id, invite] as const)
  );
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
  const isPartyInviteGuest =
    !!acceptedIncomingPartyInvite && acceptedIncomingPartyInvite.host_user_id !== user?.id;
  const incomingPartyHost = acceptedIncomingPartyInvite
    ? {
        id: acceptedIncomingPartyInvite.host_user_id,
        username:
          partyInviteProfiles[acceptedIncomingPartyInvite.host_user_id]?.username ||
          `Player ${acceptedIncomingPartyInvite.host_user_id.slice(0, 8)}`,
        avatarUrl: partyInviteProfiles[acceptedIncomingPartyInvite.host_user_id]?.avatarUrl || null,
        status: "owner",
      }
    : null;
  const visiblePartyMembers = isPartyInviteGuest
    ? incomingPartyHost
      ? [incomingPartyHost]
      : []
    : selectedPartyMembers.length > 0
      ? selectedPartyMembers
      : incomingPartyHost
        ? [incomingPartyHost]
        : [];
  const selfPartyMember = {
    id: user?.id || "self",
    username: user?.username || "You",
    avatarUrl: user?.avatarUrl || null,
    status: "accepted",
    isSelf: true,
  };
  const displayedPartyMembers = [selfPartyMember, ...visiblePartyMembers];
  const isPartyLeader = queueMode === "party" && !isPartyInviteGuest;
  const isPartyQueueMode = queueMode === "party";
  const contextPartyStakeUpdates = partyStakeUpdates.filter(
    (update) => update.mode === accountMode && update.team_size === selectedTeamSize
  );
  const activeAcceptedInviteeIds = new Set(
    partyInvites
      .filter(
        (invite) =>
          invite.host_user_id === user?.id &&
          invite.mode === accountMode &&
          invite.team_size === selectedTeamSize &&
          Number(invite.stake_amount) === Number(selectedStakeAmount || 0) &&
          invite.status === "accepted"
      )
      .map((invite) => invite.invitee_user_id)
  );
  const pendingOutgoingStakeUpdates = isPartyQueueMode
    ? contextPartyStakeUpdates.filter(
        (update) =>
          update.host_user_id === user?.id &&
          update.status === "pending" &&
          activeAcceptedInviteeIds.has(update.invitee_user_id) &&
          Number(update.new_stake_amount) === Number(selectedStakeAmount || 0)
      )
    : [];
  const pendingIncomingStakeUpdate = isPartyQueueMode
    ? contextPartyStakeUpdates.find(
        (update) =>
          update.invitee_user_id === user?.id &&
          update.status === "pending" &&
          !!acceptedIncomingPartyInvite &&
          update.host_user_id === acceptedIncomingPartyInvite.host_user_id
      ) || null
    : null;
  const hostStakeChangePending = isPartyQueueMode && isPartyLeader && pendingOutgoingStakeUpdates.length > 0;
  const currentUserStakeBalance = Math.max(Number(visibleBalance || 0), 0);
  const effectiveStakeLimit = isPartyQueueMode && isPartyLeader
    ? Math.max(Number(partyStakeCap ?? currentUserStakeBalance), 0)
    : currentUserStakeBalance;
  const partyVisibleMemberIds = new Set(visiblePartyMembers.map((member) => member.id));
  const pendingIncomingPartyInvites = partyInvites.filter(
    (invite) => invite.invitee_user_id === user?.id && invite.status === "pending"
  );
  const localPartySize = queueMode === "party" ? displayedPartyMembers.length : 1;
  const effectivePlayersJoined = queueMode === "party" ? Math.max(playersJoined, localPartySize) : playersJoined;
  const effectivePlayersNeeded =
    queueMode === "party"
      ? Math.max(selectedTeamSize * 2 - effectivePlayersJoined, 0)
      : Math.max(playersNeeded, 0);
  const orderedParticipantUserIds =
    readyCheckDisplayOrder.filter((id) => participantUserIds.includes(id)).length === participantUserIds.length
      ? readyCheckDisplayOrder.filter((id) => participantUserIds.includes(id))
      : participantUserIds;

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
        matchType?: QuickMatchType;
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
        setReadyCheckDisplayOrder(savedState.participantUserIds || []);
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
      setPartyStakeUpdates([]);
      setPartyStakeUpdateBackendMissing(false);
      return;
    }

    let cancelled = false;

    const loadPartyInvites = async () => {
      try {
        const inviteRows = await fetchQuickQueuePartyInvites(user.id);
        if (!cancelled) {
          setPartyInviteBackendMissing(false);
          setPartyInvites(inviteRows);
        }
      } catch (error) {
        console.error("Failed to load party invites:", error);
        if (!cancelled && isPartyInviteBackendError(error)) {
          setPartyInviteBackendMissing(true);
        }
      }

      if (partyStakeUpdateBackendMissing) {
        return;
      }

      try {
        const stakeUpdateRows = await fetchQuickQueuePartyStakeUpdates(user.id);
        if (!cancelled) {
          setPartyStakeUpdates(stakeUpdateRows);
        }
      } catch (error) {
        if (!cancelled && isPartyStakeUpdateBackendError(error)) {
          setPartyStakeUpdateBackendMissing(true);
          setPartyStakeUpdates([]);
          console.warn("Party stake update backend is not available yet.", error);
        } else if (!cancelled && isSupabaseTransientNetworkError(error)) {
          setPartyStakeUpdates([]);
        } else {
          console.error("Failed to load party stake updates:", error);
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
  }, [user?.id, partyStakeUpdateBackendMissing]);

  useEffect(() => {
    if (!user?.id || queueMode !== "party" || isPartyInviteGuest) {
      setPartyStakeCap(null);
      return;
    }

    let cancelled = false;

    const loadPartyStakeCap = async () => {
      try {
        const cap = await fetchQuickQueuePartyStakeCap(accountMode, selectedTeamSize);
        if (!cancelled) {
          setPartyStakeCap(Math.max(Number(cap || 0), 0));
        }
      } catch (error) {
        if (!cancelled) {
          setPartyStakeCap(null);
          if (!isPartyStakeUpdateBackendError(error) && !isSupabaseTransientNetworkError(error)) {
            console.error("Failed to load party stake cap:", error);
          }
        }
      }
    };

    void loadPartyStakeCap();
    const interval = window.setInterval(() => {
      void loadPartyStakeCap();
    }, 2500);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [accountMode, isPartyInviteGuest, queueMode, selectedTeamSize, user?.id]);

  useEffect(() => {
    if (!user?.id || !contextPartyStakeUpdates.length) {
      return;
    }

    const previous = seenStakeUpdateStatusesRef.current;
    contextPartyStakeUpdates.forEach((update) => {
      const lastStatus = previous[update.id];
      if (update.host_user_id === user.id && lastStatus === "pending" && update.status === "declined") {
        if (selectedStakeAmount === Number(update.new_stake_amount)) {
          setSelectedStakeAmount(Number(update.previous_stake_amount));
        }
        addToast("Your teammate declined the new stake amount. Reverted to the previous amount.", "info");
      }

      if (update.host_user_id === user.id && lastStatus === "pending" && update.status === "accepted") {
        addToast("Your teammate accepted the new stake amount.", "success");
      }

      previous[update.id] = update.status;
    });
  }, [addToast, contextPartyStakeUpdates, selectedStakeAmount, user?.id]);

  useEffect(() => {
    const profileIds: string[] = Array.from(
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
    setWizardStep(3);
  }, [acceptedIncomingPartyInvite]);

  useEffect(() => {
    setWizardStep(1);
  }, [user?.id, accountMode]);

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
        const backendMatchType = backendStatusToMatchType(status.team_size, status.game_mode);
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
    if (!user?.id || matchState !== "connecting") {
      return;
    }

    let cancelled = false;

    const validateConnectedLobby = async () => {
      try {
        const activeLobby = await fetchMyActiveLobby(user.id, accountMode);
        if (cancelled) {
          return;
        }

        if (!activeLobby || (matchedLobbyId && activeLobby.id !== matchedLobbyId)) {
          resetQuickQueueState("idle");
          addToast("You are no longer in this lobby. You can return to matchmaking or start a new game.", "info");
        }
      } catch (error) {
        console.error("Failed to validate connected lobby:", error);
      }
    };

    void validateConnectedLobby();
    const interval = window.setInterval(() => {
      void validateConnectedLobby();
    }, 1500);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [accountMode, addToast, matchedLobbyId, matchState, user?.id]);

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
    if (!participantUserIds.length) {
      setReadyCheckDisplayOrder([]);
      return;
    }

    setReadyCheckDisplayOrder((current) => {
      const kept = current.filter((id) => participantUserIds.includes(id));
      const additions = participantUserIds.filter((id) => !kept.includes(id));
      return [...kept, ...additions];
    });
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
      readyCheckAcceptedCountRef.current = 0;
      readyCheckCompletionSoundRef.current = null;
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

  useEffect(() => {
    if (matchState !== "ready_check" || !readyCheckId) {
      return;
    }

    const previousAcceptedCount = readyCheckAcceptedCountRef.current;
    const nextAcceptedCount = acceptedUserIds.length;
    const participantCount = orderedParticipantUserIds.length || participantUserIds.length;

    if (nextAcceptedCount > previousAcceptedCount) {
      playReadyCheckAcceptSound();
    }

    if (
      participantCount > 0 &&
      nextAcceptedCount === participantCount &&
      readyCheckCompletionSoundRef.current !== readyCheckId
    ) {
      readyCheckCompletionSoundRef.current = readyCheckId;
      playReadyCheckCompleteSound();
    }

    readyCheckAcceptedCountRef.current = nextAcceptedCount;
  }, [acceptedUserIds, matchState, orderedParticipantUserIds.length, participantUserIds.length, readyCheckId]);

  const applyQueueStatus = (status: QuickQueueStatus | null) => {
    if (!status) return;

    const shouldKeepCurrentReadyCheck =
      status.status === "searching" &&
      matchState === "ready_check" &&
      !!readyCheckId &&
      !status.ready_check_id;

    if (shouldKeepCurrentReadyCheck) {
      return;
    }

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
        addToast("REDIRECT TO THE LOBBY", "success");
        window.setTimeout(() => {
          onMatchReady?.();
        }, 1400);
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

  const isUnsupportedQuickQueueModeError = (error: any) =>
    String(error?.message || "").includes("latest Supabase matchmaking migration");

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
    setReadyCheckDisplayOrder([]);
    handledMatchedLobbyRef.current = null;
  };

  const leaveJoinedParty = async () => {
    if (!acceptedIncomingPartyInvite) {
      return;
    }

    setIncomingInviteActionId(acceptedIncomingPartyInvite.id);
    try {
      if (matchState === "searching" || matchState === "ready_check") {
        await quickQueueCancel(accountMode);
      }

      await respondQuickQueuePartyInvite(acceptedIncomingPartyInvite.id, "decline");
      setPartyInvites((current) =>
        current.map((invite) =>
          invite.id === acceptedIncomingPartyInvite.id
            ? { ...invite, status: "declined", responded_at: new Date().toISOString(), updated_at: new Date().toISOString() }
            : invite
        )
      );
      resetQuickQueueState("idle");
      setQueueMode("solo");
      addToast("You left the party.", "info");
    } catch (error: any) {
      console.error("Failed to leave joined party:", error);
      addToast(error?.message || "Failed to leave the party.", "error");
    } finally {
      setIncomingInviteActionId(null);
    }
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
    if (queueMode === "party" && isPartyLeader && hostStakeChangePending) {
      addToast("Wait for your teammate to accept or decline the updated stake amount before searching.", "error");
      return;
    }
    try {
      cancelInFlightRef.current = false;
      suppressAutoQueueUntilRef.current = 0;
      const requestVersion = ++queueRequestVersionRef.current;
      setSearchTime(0);
      setMatchState("searching");
      const status = await quickQueueJoinOrMatch(
        accountMode,
        selectedTeamSize,
        queueMode,
        selectedStakeAmount,
        selectedGameMode
      );
      if (!cancelInFlightRef.current && requestVersion === queueRequestVersionRef.current) {
        applyQueueStatus(status);
      }
      addToast("Searching for real players in queue...", "info");
    } catch (error: any) {
      console.error(error);
      resetQuickQueueState("idle");
      if (isUnsupportedQuickQueueModeError(error)) {
        unsupportedQueueModeToastRef.current = `${queueMode}:${selectedGameMode}`;
      }
      addToast(error?.message || "Failed to start quick queue.", "error");
    }
  };

  const requestStakeChange = async (nextStakeAmount: number | null) => {
    if (isPartyInviteGuest) {
      return;
    }

    if (!nextStakeAmount) {
      setSelectedStakeAmount(null);
      return;
    }

    const previousStakeAmount = Number(selectedStakeAmount || 0);
    const nextAmount = Number(nextStakeAmount);
    if (nextAmount > effectiveStakeLimit) {
      addToast(
        isPartyQueueMode && isPartyLeader
          ? `That stake is above your party balance limit (${formatStakeLabel(effectiveStakeLimit)}).`
          : `You do not have enough balance for ${formatStakeLabel(nextAmount)}.`,
        "error"
      );
      return;
    }

    if (
      queueMode === "party" &&
      isPartyLeader &&
      acceptedPartyMembers.length > 0 &&
      previousStakeAmount > 0 &&
      previousStakeAmount !== nextAmount
    ) {
      if (hostStakeChangePending) {
        addToast("A stake update request is already pending teammate approval.", "info");
        return;
      }

      setSelectedStakeAmount(nextAmount);
      try {
        const sentCount = await requestQuickQueuePartyStakeUpdate(
          accountMode,
          selectedTeamSize,
          previousStakeAmount,
          nextAmount
        );

        if (sentCount > 0) {
          addToast("Stake update sent for teammate approval.", "info");
        } else {
          addToast("No active accepted teammate found for stake update.", "error");
          setSelectedStakeAmount(previousStakeAmount);
        }
      } catch (error: any) {
        setSelectedStakeAmount(previousStakeAmount);
        if (isPartyStakeUpdateBackendError(error)) {
          setPartyStakeUpdateBackendMissing(true);
          addToast("Stake update consent backend is not active yet. Run migration 20260414_0050.", "error");
        } else {
          addToast(error?.message || "Failed to request stake update.", "error");
        }
      }
      return;
    }

    setSelectedStakeAmount(nextAmount);
  };

  const respondToStakeUpdate = async (updateId: number, action: "accept" | "decline") => {
    setStakeUpdateActionId(updateId);
    try {
      await respondQuickQueuePartyStakeUpdate(updateId, action);
      setPartyStakeUpdates((current) =>
        current.map((update) =>
          update.id === updateId
            ? {
                ...update,
                status: action === "accept" ? "accepted" : "declined",
                responded_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
              }
            : update
        )
      );
      addToast(
        action === "accept"
          ? "You accepted the updated stake amount."
          : "You declined the updated stake amount.",
        action === "accept" ? "success" : "info"
      );
    } catch (error: any) {
      console.error("Failed to respond to stake update:", error);
      if (isPartyStakeUpdateBackendError(error)) {
        setPartyStakeUpdateBackendMissing(true);
        addToast("Stake update consent backend is not active yet. Run migration 20260414_0050.", "error");
      } else {
        addToast(error?.message || "Failed to respond to stake update.", "error");
      }
    } finally {
      setStakeUpdateActionId(null);
    }
  };

  const selectWizardQueueType = (mode: "solo" | "party") => {
    if (isPartyInviteGuest) {
      return;
    }
    setQueueMode(mode);
    setWizardStep(2);
  };

  const goToAssemblyStep = () => {
    if (!selectedStakeAmount) {
      addToast("Choose a stake amount before continuing.", "error");
      return;
    }
    setWizardStep(3);
  };

  const goToPreviousWizardStep = () => {
    if (isPartyInviteGuest) {
      return;
    }
    setWizardStep((current) => {
      if (current <= 1) return 1;
      return (current - 1) as 1 | 2 | 3;
    });
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

  const handleSidebarInvite = async (friendId: string) => {
    if (isPartyInviteGuest) {
      addToast("Only the party leader can send invites.", "error");
      return;
    }
    if (queueMode !== "party") {
      setQueueMode("party");
    }
    await togglePartyMember(friendId);
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
    if (matchState !== "searching") {
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
        const nextStatus = await quickQueueJoinOrMatch(
          accountMode,
          selectedTeamSize,
          queueMode,
          selectedStakeAmount,
          selectedGameMode
        );
        if (!cancelInFlightRef.current && requestVersion === queueRequestVersionRef.current) {
          applyQueueStatus(nextStatus);
        }
      } catch (error: any) {
        if (isUnsupportedQuickQueueModeError(error)) {
          const errorKey = `${queueMode}:${selectedGameMode}`;
          if (unsupportedQueueModeToastRef.current !== errorKey) {
            unsupportedQueueModeToastRef.current = errorKey;
            addToast(error.message || "This quick queue mode is not available yet.", "error");
          }
          resetQuickQueueState("idle");
          return;
        }
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
  }, [matchState, accountMode, selectedTeamSize, queueMode, selectedStakeAmount, selectedGameMode]);

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
    <div className="max-w-7xl mx-auto space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-display font-bold uppercase tracking-tight">Battlefield</h2>
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
        <div className="relative min-h-[72vh]">
          <div className="absolute inset-0 rounded-3xl border border-white/10 bg-black/65 backdrop-blur-md" />
          <div className="relative z-10 flex min-h-[72vh] items-center justify-center p-4">
            <div className="w-full max-w-4xl rounded-[28px] border border-esport-accent/30 bg-[radial-gradient(circle_at_top,rgba(59,130,246,0.18),transparent_36%),linear-gradient(180deg,rgba(15,23,42,0.96),rgba(2,6,23,0.98))] p-6 shadow-[0_30px_120px_rgba(0,0,0,0.55)]">
              <div className="mb-5 flex items-center justify-between gap-4">
                <div className="text-[11px] font-bold uppercase tracking-[0.22em] text-esport-accent">
                  Matchmaking Setup - Step {wizardStep} of 3
                </div>
                <button
                  type="button"
                  onClick={goToPreviousWizardStep}
                  disabled={wizardStep === 1 || isPartyInviteGuest}
                  className="rounded-lg border border-white/10 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.18em] text-esport-text-muted hover:border-white/20 hover:text-white disabled:opacity-40"
                >
                  Back
                </button>
              </div>

              {wizardStep === 1 && (
                <div className="space-y-6">
                  <div className="text-center">
                    <h3 className="text-3xl font-display font-bold uppercase tracking-tight text-white">How do you want to play?</h3>
                    <p className="mt-2 text-sm text-esport-text-muted">Choose your queue style to continue.</p>
                  </div>
                  <div className="grid gap-4 md:grid-cols-2">
                    <button
                      type="button"
                      onClick={() => selectWizardQueueType("solo")}
                      disabled={isPartyInviteGuest}
                      className="rounded-2xl border border-esport-border bg-black/30 p-6 text-left transition-all hover:border-esport-accent hover:bg-esport-accent/10"
                    >
                      <div className="text-xl font-display font-bold uppercase text-white">Solo Quick Match</div>
                      <div className="mt-2 text-sm text-esport-text-muted">Find a random team and queue on your own.</div>
                    </button>
                    <button
                      type="button"
                      onClick={() => selectWizardQueueType("party")}
                      disabled={isPartyInviteGuest}
                      className="rounded-2xl border border-esport-border bg-black/30 p-6 text-left transition-all hover:border-esport-accent hover:bg-esport-accent/10 disabled:opacity-60"
                    >
                      <div className="text-xl font-display font-bold uppercase text-white">Party Quick Match</div>
                      <div className="mt-2 text-sm text-esport-text-muted">Queue with your party and invite friends before search.</div>
                    </button>
                  </div>
                </div>
              )}

              {wizardStep === 2 && (
                <div className="space-y-5">
                  <div className="text-center">
                    <h3 className="text-3xl font-display font-bold uppercase tracking-tight text-white">Choose Your Stake</h3>
                    <p className="mt-2 text-sm text-esport-text-muted">Pick the amount you want to queue for in USDT.</p>
                  </div>

                  {isPartyQueueMode && isPartyLeader && acceptedPartyMembers.length > 0 && effectiveStakeLimit < STAKE_OPTIONS[STAKE_OPTIONS.length - 1] && (
                    <div className="rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-xs text-esport-text-muted">
                      Some stake options are unavailable because a party member balance is below that amount.
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    {STAKE_OPTIONS.map((amount) => {
                      const active = selectedStakeAmount === amount;
                      const disabledForBalance = amount > effectiveStakeLimit;
                      return (
                        <button
                          key={amount}
                          type="button"
                          disabled={disabledForBalance}
                          onClick={() => void requestStakeChange(amount)}
                          className={`rounded-xl border px-3 py-2 text-left transition-all ${
                            disabledForBalance
                              ? "cursor-not-allowed border-white/10 bg-white/[0.03] opacity-45"
                              : active
                                ? "border-esport-accent bg-esport-accent/12 shadow-[0_0_20px_rgba(59,130,246,0.18)]"
                                : "border-esport-border bg-black/20 hover:border-white/20"
                          }`}
                        >
                          <div className="text-[10px] uppercase tracking-[0.18em] text-esport-text-muted">Entry</div>
                          <div className="mt-1 text-lg font-display font-bold text-white">${amount}</div>
                        </button>
                      );
                    })}
                  </div>

                  <div className="flex flex-col items-center gap-3 sm:flex-row sm:justify-between">
                    <div className="rounded-full border border-esport-accent/25 bg-esport-accent/10 px-4 py-2 text-xs font-bold uppercase tracking-[0.18em] text-esport-accent">
                      Current: {formatStakeLabel(selectedStakeAmount)}
                    </div>
                    <button type="button" onClick={goToAssemblyStep} className="esport-btn-primary px-8 py-3 text-sm">
                      Next
                    </button>
                  </div>
                </div>
              )}

              {wizardStep === 3 && (
                <div className="space-y-5">
                  <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                    <div>
                      <h3 className="text-2xl font-display font-bold uppercase tracking-tight text-white">
                        {queueMode === "party" ? "Party Assembly" : "Ready To Queue"}
                      </h3>
                      <p className="mt-1 text-sm text-esport-text-muted">
                        {queueMode === "party"
                          ? "Invite teammates, review party slots, then start matchmaking."
                          : "Your setup is complete. Start matchmaking when you are ready."}
                      </p>
                    </div>
                    <div className="rounded-full border border-esport-accent/25 bg-esport-accent/10 px-4 py-2 text-xs font-bold uppercase tracking-[0.18em] text-esport-accent">
                      {selectedQueueLabel} - {formatStakeLabel(selectedStakeAmount)}
                    </div>
                  </div>

                  {queueMode === "solo" && (
                    <div className="grid gap-3 sm:grid-cols-2">
                      <button
                        type="button"
                        onClick={() => setMatchType("ranked_2v2")}
                        className={`rounded-xl border p-3 text-left transition-colors ${
                          matchType === "ranked_2v2" ? "border-esport-accent bg-esport-accent/10" : "border-esport-border bg-black/20 hover:border-white/20"
                        }`}
                      >
                        <div className="text-sm font-bold uppercase text-white">Wingman 2v2</div>
                      </button>
                      <button
                        type="button"
                        onClick={() => setMatchType("ranked_5v5")}
                        className={`rounded-xl border p-3 text-left transition-colors ${
                          matchType === "ranked_5v5" ? "border-esport-accent bg-esport-accent/10" : "border-esport-border bg-black/20 hover:border-white/20"
                        }`}
                      >
                        <div className="text-sm font-bold uppercase text-white">Competitive 5v5</div>
                      </button>
                      <button
                        type="button"
                        onClick={() => setMatchType("ranked_team_ffa")}
                        className={`rounded-xl border p-3 text-left transition-colors ${
                          matchType === "ranked_team_ffa" ? "border-esport-accent bg-esport-accent/10" : "border-esport-border bg-black/20 hover:border-white/20"
                        }`}
                      >
                        <div className="text-sm font-bold uppercase text-white">Team FFA 5v5</div>
                      </button>
                      <button
                        type="button"
                        onClick={() => setMatchType("ranked_ffa")}
                        className={`rounded-xl border p-3 text-left transition-colors ${
                          matchType === "ranked_ffa" ? "border-esport-accent bg-esport-accent/10" : "border-esport-border bg-black/20 hover:border-white/20"
                        }`}
                      >
                        <div className="text-sm font-bold uppercase text-white">FFA 5v5</div>
                      </button>
                    </div>
                  )}

                  {queueMode === "party" && (
                    <>
                      {isPartyInviteGuest && (
                        <div className="flex justify-end">
                          <button
                            type="button"
                            onClick={() => void leaveJoinedParty()}
                            disabled={incomingInviteActionId === acceptedIncomingPartyInvite?.id}
                            className="rounded-xl border border-rose-300/30 bg-rose-400/10 px-4 py-2 text-xs font-bold uppercase tracking-[0.18em] text-rose-200 transition-colors hover:border-rose-300/60 disabled:opacity-50"
                          >
                            {incomingInviteActionId === acceptedIncomingPartyInvite?.id ? "Leaving..." : "Leave Party"}
                          </button>
                        </div>
                      )}

                      <div className="grid gap-3 sm:grid-cols-2">
                        <button
                          type="button"
                          onClick={() => {
                            if (!isPartyInviteGuest) setMatchType("ranked_2v2");
                          }}
                          className={`rounded-xl border p-3 text-left transition-colors ${
                            matchType === "ranked_2v2" ? "border-esport-accent bg-esport-accent/10" : "border-esport-border bg-black/20 hover:border-white/20"
                          } ${isPartyInviteGuest ? "opacity-60" : ""}`}
                        >
                          <div className="text-sm font-bold uppercase text-white">Wingman 2v2</div>
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            if (!isPartyInviteGuest) setMatchType("ranked_5v5");
                          }}
                          className={`rounded-xl border p-3 text-left transition-colors ${
                            matchType === "ranked_5v5" ? "border-esport-accent bg-esport-accent/10" : "border-esport-border bg-black/20 hover:border-white/20"
                          } ${isPartyInviteGuest ? "opacity-60" : ""}`}
                        >
                          <div className="text-sm font-bold uppercase text-white">Competitive 5v5</div>
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            if (!isPartyInviteGuest) setMatchType("ranked_team_ffa");
                          }}
                          className={`rounded-xl border p-3 text-left transition-colors ${
                            matchType === "ranked_team_ffa" ? "border-esport-accent bg-esport-accent/10" : "border-esport-border bg-black/20 hover:border-white/20"
                          } ${isPartyInviteGuest ? "opacity-60" : ""}`}
                        >
                          <div className="text-sm font-bold uppercase text-white">Team FFA 5v5</div>
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            if (!isPartyInviteGuest) setMatchType("ranked_ffa");
                          }}
                          className={`rounded-xl border p-3 text-left transition-colors ${
                            matchType === "ranked_ffa" ? "border-esport-accent bg-esport-accent/10" : "border-esport-border bg-black/20 hover:border-white/20"
                          } ${isPartyInviteGuest ? "opacity-60" : ""}`}
                        >
                          <div className="text-sm font-bold uppercase text-white">FFA 5v5</div>
                        </button>
                      </div>

                      {partyInviteBackendMissing && (
                        <div className="rounded-2xl border border-amber-300/25 bg-amber-400/10 px-4 py-3 text-sm text-amber-100">
                          Party invites are not active in the database yet. Run `20260413_0038_quick_queue_party_invites.sql` in Supabase, then refresh this page.
                        </div>
                      )}

                      <div className="rounded-2xl border border-white/10 bg-black/25 p-4">
                        <div className="mb-3 flex items-center justify-between gap-3">
                          <div className="text-xs font-bold uppercase tracking-[0.2em] text-esport-text-muted">Party Members</div>
                          <div className="text-[10px] uppercase tracking-[0.18em] text-esport-text-muted">
                            {(isPartyInviteGuest ? visiblePartyMembers.filter((member) => member.status === "accepted" || member.status === "owner").length : acceptedPartyMembers.length)}/{maxPartyMembers} accepted
                          </div>
                        </div>
                        <div className="flex min-w-max gap-2.5 overflow-x-auto custom-scrollbar pb-1">
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
                                  className={`w-[124px] rounded-2xl border p-2.5 text-center transition-colors ${
                                    "isSelf" in friend && friend.isSelf
                                      ? "border-white/20 bg-gradient-to-b from-white/[0.08] to-black/40"
                                      : "border-esport-accent/40 bg-gradient-to-b from-esport-accent/10 to-black/40 hover:border-esport-accent"
                                  }`}
                                >
                                  <img
                                    src={friend.avatarUrl || `https://ui-avatars.com/api/?name=${encodeURIComponent(friend.username)}&background=1f2937&color=ffffff&size=160`}
                                    alt={friend.username}
                                    className="mx-auto h-14 w-14 rounded-full border-4 border-white/10 object-cover"
                                  />
                                  <div className="mt-2 truncate text-xs font-bold text-white">{friend.username}</div>
                                  <div className="mt-1.5 text-[9px] uppercase tracking-[0.2em] text-esport-text-muted">
                                    {"isSelf" in friend && friend.isSelf ? "You" : friend.status === "owner" ? "Owner" : friend.status}
                                  </div>
                                </button>
                              );
                            }
                            return (
                              <button
                                key={`empty-slot-${index}`}
                                type="button"
                                onClick={() => addToast("Invite from the friends list below.", "info")}
                                disabled={isPartyInviteGuest}
                                className="w-[124px] rounded-2xl border border-esport-border bg-black/20 p-2.5 text-center transition-colors hover:border-esport-accent disabled:opacity-60"
                              >
                                <div className="text-4xl leading-none text-white/30">+</div>
                                <div className="mt-2 text-[9px] font-bold uppercase tracking-[0.18em] text-esport-accent">Click to invite</div>
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      <div className="rounded-2xl border border-white/10 bg-black/25 p-4">
                        <div className="mb-2 text-xs font-bold uppercase tracking-[0.2em] text-esport-text-muted">Friends</div>
                        <div className="space-y-1.5 max-h-[180px] overflow-y-auto custom-scrollbar pr-1">
                          {friendsList.length === 0 && <div className="text-xs text-esport-text-muted">No friends yet.</div>}
                          {friendsList
                            .slice()
                            .sort((a, b) => Number(onlineNowIds.has(b.id)) - Number(onlineNowIds.has(a.id)))
                            .map((friend) => {
                              const invite = partyInviteByFriendId.get(friend.id);
                              const inviteStatus = invite?.status || "none";
                              const inviteActionLabel =
                                partyInviteActionUserId === friend.id
                                  ? "Updating..."
                                  : inviteStatus === "accepted"
                                    ? "Remove"
                                    : inviteStatus === "pending"
                                      ? "Cancel"
                                      : inviteStatus === "declined"
                                        ? "Reinvite"
                                        : "Invite";
                              return (
                                <div key={friend.id} className="rounded-xl border border-white/10 bg-black/25 px-2.5 py-2">
                                  <div className="flex items-center gap-1.5">
                                    <img
                                      src={friend.avatarUrl || `https://ui-avatars.com/api/?name=${encodeURIComponent(friend.username)}&background=1f2937&color=ffffff&size=48`}
                                      alt={friend.username}
                                      className="h-7 w-7 rounded-full border border-white/20 object-cover"
                                    />
                                    <div className="min-w-0 flex-1">
                                      <div className="truncate text-[11px] font-bold text-white">{friend.username}</div>
                                      <div className="mt-1 text-[9px] uppercase tracking-[0.16em] text-esport-text-muted">
                                        {partyVisibleMemberIds.has(friend.id) ? "In Party" : onlineNowIds.has(friend.id) ? "Online" : "Offline"}
                                      </div>
                                    </div>
                                  </div>
                                  <div className="mt-1.5 grid grid-cols-2 gap-1.5">
                                    <button
                                      type="button"
                                      onClick={() => void handleSidebarInvite(friend.id)}
                                      disabled={
                                        isPartyInviteGuest ||
                                        partyInviteBackendMissing ||
                                        partyInviteActionUserId === friend.id ||
                                        (inviteStatus === "none" && currentConfigPartyInvites.length >= maxPartyMembers)
                                      }
                                      className={`rounded-lg border px-2 py-1 text-[9px] font-bold uppercase tracking-[0.16em] transition-colors disabled:opacity-50 ${
                                        inviteStatus === "accepted" || inviteStatus === "pending"
                                          ? "border-rose-300/30 bg-rose-400/10 text-rose-200 hover:border-rose-300/50"
                                          : "border-esport-accent/30 bg-esport-accent/10 text-esport-accent hover:border-esport-accent/60"
                                      }`}
                                    >
                                      {inviteActionLabel}
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => onOpenDirectMessage?.(friend.id)}
                                      className="rounded-lg border border-white/15 bg-white/5 px-2 py-1 text-[9px] font-bold uppercase tracking-[0.16em] text-white/90 transition-colors hover:border-white/30 hover:bg-white/10"
                                    >
                                      <span className="inline-flex items-center gap-1">
                                        <MessageSquare size={11} />
                                        Message
                                      </span>
                                    </button>
                                  </div>
                                </div>
                              );
                            })}
                        </div>
                      </div>
                    </>
                  )}

                  <div className="pt-1">
                    <button
                      onClick={() => void startSearch()}
                      disabled={
                        !selectedStakeAmount ||
                        (queueMode === "party" &&
                          (acceptedPartyMembers.length === 0 || isPartyInviteGuest || (isPartyLeader && hostStakeChangePending)))
                      }
                      className="esport-btn-primary w-full py-3 text-sm shadow-[0_0_20px_rgba(59,130,246,0.4)] disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {queueMode === "solo" ? "Start Matchmaking" : isPartyInviteGuest ? "Waiting For Party Leader" : "Start Matchmaking"}
                    </button>
                  </div>
                </div>
              )}
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

      {pendingIncomingStakeUpdate && (
        <div className="fixed inset-0 z-[106] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/75 backdrop-blur-md" />
          <div className="relative z-10 w-full max-w-3xl overflow-hidden rounded-[32px] border border-amber-300/35 bg-[radial-gradient(circle_at_top,rgba(251,191,36,0.15),transparent_34%),linear-gradient(180deg,rgba(15,23,42,0.98),rgba(2,6,23,0.99))] p-8 shadow-[0_30px_120px_rgba(0,0,0,0.55)]">
            <div className="mx-auto inline-flex items-center gap-2 rounded-full border border-amber-300/30 bg-amber-400/10 px-4 py-2 text-[11px] font-bold uppercase tracking-[0.24em] text-amber-200">
              <Clock size={14} />
              Stake Update Request
            </div>
            <div className="mt-6 flex flex-col items-center text-center">
              <h3 className="mt-2 text-4xl font-display font-bold uppercase tracking-wide text-white">
                Party Leader Has Changed The Staking Amount
              </h3>
              <p className="mt-3 max-w-2xl text-base text-esport-text-muted">
                Previous: {formatStakeLabel(pendingIncomingStakeUpdate.previous_stake_amount)} · New:{" "}
                {formatStakeLabel(pendingIncomingStakeUpdate.new_stake_amount)}
              </p>
            </div>

            <div className="mt-8 grid gap-3 sm:grid-cols-2">
              <button
                type="button"
                disabled={stakeUpdateActionId === pendingIncomingStakeUpdate.id}
                onClick={() => void respondToStakeUpdate(pendingIncomingStakeUpdate.id, "accept")}
                className="rounded-2xl bg-esport-success px-6 py-4 text-lg font-bold uppercase tracking-[0.18em] text-black transition-transform hover:scale-[1.01] disabled:opacity-50"
              >
                I Accept
              </button>
              <button
                type="button"
                disabled={stakeUpdateActionId === pendingIncomingStakeUpdate.id}
                onClick={() => void respondToStakeUpdate(pendingIncomingStakeUpdate.id, "decline")}
                className="rounded-2xl border border-esport-danger/35 bg-esport-danger/10 px-6 py-4 text-lg font-bold uppercase tracking-[0.18em] text-rose-200 transition-colors hover:border-esport-danger/60 disabled:opacity-50"
              >
                I Decline
              </button>
            </div>
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
            {orderedParticipantUserIds.map((participantId) => {
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
            {acceptedUserIds.length} / {orderedParticipantUserIds.length || selectedTeamSize * 2} Accepted
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
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <button
              onClick={() => onMatchReady?.()}
              className="esport-btn-primary text-sm"
            >
              Return to Lobby
            </button>
            <button onClick={() => void cancelSearch()} className="esport-btn-secondary text-sm">
              Start New Match
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
