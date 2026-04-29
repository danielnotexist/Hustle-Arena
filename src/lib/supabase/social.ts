import { supabase } from "../supabase";
import { hasPlatformApiSession, hasPlatformNotificationsSession, platformFetch } from "../api";

export type SendFriendRequestResult =
  | "requested"
  | "already_requested"
  | "already_friends"
  | "friends";

export type RespondFriendRequestResult =
  | "accepted"
  | "ignored"
  | "blocked"
  | "already_resolved";

export async function sendFriendRequest(targetUserId: string) {
  const { data, error } = await supabase.rpc("send_friend_request", {
    p_target_user_id: targetUserId,
  });

  if (error) {
    throw error;
  }

  return (data || "requested") as SendFriendRequestResult;
}

export async function respondFriendRequest(requestId: number, action: "accept" | "ignore" | "block") {
  const { data, error } = await supabase.rpc("respond_friend_request", {
    p_request_id: requestId,
    p_action: action,
  });

  if (error) {
    throw error;
  }

  return (data || "already_resolved") as RespondFriendRequestResult;
}

export interface PublicProfileBasic {
  id: string;
  username: string | null;
  email: string | null;
  avatar_url?: string | null;
  last_active_at?: string | null;
}

export interface PublicProfileDetails extends PublicProfileBasic {
  cover_url?: string | null;
  bio?: string | null;
  country?: string | null;
  rank?: string | null;
  win_rate?: string | null;
  kd_ratio?: number | null;
  headshot_pct?: string | null;
  level?: number | null;
  last_active_at?: string | null;
}

export interface ProfileComment {
  id: number;
  profile_user_id: string;
  author_user_id: string;
  body: string;
  created_at: string;
  updated_at: string;
  author_username: string | null;
  author_avatar_url: string | null;
}

export interface PublicApexLeaderboardEntry {
  user_id: string;
  username: string | null;
  avatar_url?: string | null;
  rank?: string | null;
  win_rate?: string | null;
  level?: number | null;
  combat_rating?: number | null;
}

export async function fetchPublicProfileBasics(userIds: string[]) {
  const uniqueUserIds = Array.from(new Set(userIds.filter(Boolean)));
  if (!uniqueUserIds.length) {
    return new Map<string, PublicProfileBasic>();
  }

  const executeFetch = async () =>
    supabase.rpc("get_public_profile_basics", {
      p_user_ids: uniqueUserIds,
    });

  let { data, error } = await executeFetch();

  const isTransientGatewayFailure =
    !!error &&
    (
      String(error?.message || "").includes("NetworkError when attempting to fetch resource") ||
      String(error?.message || "").includes("Failed to fetch") ||
      String(error?.details || "").includes("NetworkError when attempting to fetch resource") ||
      String(error?.code || "") === "502"
    );

  if (isTransientGatewayFailure) {
    const retry = await executeFetch();
    data = retry.data;
    error = retry.error;
  }

  if (error) {
    if (isTransientGatewayFailure) {
      return new Map<string, PublicProfileBasic>();
    }
    throw error;
  }

  return new Map(
    ((data || []) as PublicProfileBasic[]).map((profile) => [
      profile.id,
      {
        id: profile.id,
        username: profile.username,
        email: profile.email,
        avatar_url: profile.avatar_url || null,
        last_active_at: profile.last_active_at || null,
      },
    ])
  );
}

export async function findPublicProfileByUsername(username: string) {
  const { data, error } = await supabase.rpc("find_public_profile_by_username", {
    p_username: username,
  });

  if (error) {
    throw error;
  }

  const row = Array.isArray(data) ? data[0] : null;
  return (row as PublicProfileBasic | null) || null;
}

export async function fetchPublicProfileDetails(userId: string) {
  const { data, error } = await supabase.rpc("get_public_profile_details", {
    p_user_id: userId,
  });

  if (error) {
    const missingRpc =
      error.code === "PGRST202" ||
      error.code === "42883" ||
      /get_public_profile_details|get_public_profile/i.test(error.message || "");

    if (!missingRpc) {
      throw error;
    }

    const basics = await fetchPublicProfileBasics([userId]);
    const basicProfile = basics.get(userId);

    if (!basicProfile) {
      return null;
    }

    return {
      ...basicProfile,
      cover_url: null,
      bio: null,
      country: null,
      rank: null,
      win_rate: null,
      kd_ratio: null,
      headshot_pct: null,
      level: null,
      last_active_at: basicProfile.last_active_at || null,
    } satisfies PublicProfileDetails;
  }

  const row = Array.isArray(data) ? data[0] : data;
  return (row as PublicProfileDetails | null) || null;
}

export async function fetchProfileComments(profileUserId: string, limit = 50) {
  const { data, error } = await supabase.rpc("get_profile_comments", {
    p_profile_user_id: profileUserId,
    p_limit: limit,
  });

  if (error) {
    throw error;
  }

  return (data || []) as ProfileComment[];
}

export async function addProfileComment(profileUserId: string, body: string) {
  const { data, error } = await supabase.rpc("add_profile_comment", {
    p_profile_user_id: profileUserId,
    p_body: body,
  });

  if (error) {
    throw error;
  }

  return Number(data || 0);
}

export async function deleteProfileComment(commentId: number) {
  const { error } = await supabase.rpc("delete_profile_comment", {
    p_comment_id: commentId,
  });

  if (error) {
    throw error;
  }
}

export async function fetchPublicApexLeaderboard(limit = 10) {
  const { data, error } = await supabase.rpc("get_public_apex_leaderboard", {
    p_limit: limit,
  });

  if (error) {
    throw error;
  }

  return (data || []) as PublicApexLeaderboardEntry[];
}

export interface AppNotification {
  id: number;
  title: string;
  body: string;
  is_read: boolean;
  created_at: string;
  notice_type: string;
  link_target?: string | null;
  metadata?: Record<string, any> | null;
}

export interface DirectMessage {
  id: number;
  sender_id: string;
  receiver_id: string;
  message: string;
  message_type: string;
  metadata: any;
  created_at: string;
}

export interface PendingLobbyInvite {
  id: number;
  lobby_id: string;
  lobby_name: string;
  from_user_id: string;
  from_username: string;
  password_required: boolean;
}

export async function fetchMyNotifications(limit = 20) {
  if (await hasPlatformNotificationsSession()) {
    try {
      const response = await platformFetch(`/api/social/notifications?limit=${encodeURIComponent(String(limit))}`);
      if (response.ok) {
        const payload = await response.json();
        return (payload.data || []) as AppNotification[];
      }
    } catch {
      // Fall back to Supabase below.
    }
  }

  const { data, error } = await supabase
    .from("notifications")
    .select("id, title, body, is_read, created_at, notice_type, link_target, metadata")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    throw error;
  }

  return (data || []) as AppNotification[];
}

export async function markNotificationsRead(notificationIds: number[]) {
  const ids = Array.from(new Set(notificationIds.filter((id) => Number.isInteger(id) && id > 0)));
  if (!ids.length) {
    return;
  }

  if (await hasPlatformNotificationsSession()) {
    try {
      const response = await platformFetch("/api/social/notifications/read", {
        method: "POST",
        body: JSON.stringify({ ids }),
      });
      if (response.ok) {
        return;
      }
    } catch {
      // Fall back to Supabase below.
    }
  }

  await Promise.all(
    ids.map(async (id) => {
      const { error } = await supabase.rpc("mark_notification_read", {
        p_notice_id: id,
      });
      if (error) {
        throw error;
      }
    })
  );
}

export async function fetchDirectMessageUnreadCounts(userId: string) {
  if (await hasPlatformApiSession()) {
    try {
      const response = await platformFetch("/api/social/direct-messages/unread-counts");
      if (response.ok) {
        const payload = await response.json();
        return (payload.data || {}) as Record<string, number>;
      }
    } catch {
      // Fall back to Supabase below.
    }
  }

  const { data } = await supabase
    .from("direct_messages")
    .select("sender_id")
    .eq("receiver_id", userId)
    .eq("is_read", false);

  const counts: Record<string, number> = {};
  (data ?? []).forEach((row: any) => {
    const sender = row.sender_id as string;
    counts[sender] = (counts[sender] ?? 0) + 1;
  });

  return counts;
}

export async function fetchDirectMessageThread(userId: string, friendId: string, limit = 200) {
  if (await hasPlatformApiSession()) {
    try {
      const response = await platformFetch(
        `/api/social/direct-messages/thread/${encodeURIComponent(friendId)}?limit=${encodeURIComponent(String(limit))}`
      );
      if (response.ok) {
        const payload = await response.json();
        return (payload.data || []) as DirectMessage[];
      }
    } catch {
      // Fall back to Supabase below.
    }
  }

  const condition =
    "and(sender_id.eq." + userId + ",receiver_id.eq." + friendId + "),and(sender_id.eq." + friendId + ",receiver_id.eq." + userId + ")";

  const { data } = await supabase
    .from("direct_messages")
    .select("id,sender_id,receiver_id,message,message_type,metadata,created_at")
    .or(condition)
    .order("created_at", { ascending: true })
    .limit(limit);

  await supabase
    .from("direct_messages")
    .update({ is_read: true })
    .eq("receiver_id", userId)
    .eq("sender_id", friendId)
    .eq("is_read", false);

  return (data ?? []) as DirectMessage[];
}

export async function sendDirectMessage(senderId: string, receiverId: string, message: string, messageType = "text", metadata: Record<string, any> = {}) {
  if (await hasPlatformApiSession()) {
    try {
      const response = await platformFetch("/api/social/direct-messages", {
        method: "POST",
        body: JSON.stringify({
          receiverId,
          message,
          messageType,
          metadata,
        }),
      });
      if (response.ok) {
        const payload = await response.json();
        return payload.data as DirectMessage;
      }
    } catch {
      // Fall back to Supabase below.
    }
  }

  const { data, error } = await supabase
    .from("direct_messages")
    .insert({
      sender_id: senderId,
      receiver_id: receiverId,
      message,
      message_type: messageType,
      metadata,
    })
    .select("id,sender_id,receiver_id,message,message_type,metadata,created_at")
    .single();

  if (error) {
    throw error;
  }

  return data as DirectMessage;
}

export async function fetchPendingLobbyInvites(userId: string) {
  if (await hasPlatformApiSession()) {
    try {
      const response = await platformFetch("/api/social/lobby-invites/pending");
      if (response.ok) {
        const payload = await response.json();
        return (payload.data || []) as PendingLobbyInvite[];
      }
    } catch {
      // Fall back to Supabase below.
    }
  }

  const { data, error } = await supabase
    .from("lobby_invites")
    .select("id,lobby_id,from_user_id,status,lobbies!inner(name,password_required,status)")
    .eq("to_user_id", userId)
    .eq("status", "pending");

  if (error) {
    throw error;
  }

  const rows = (data ?? []).filter((invite: any) => invite.lobbies?.status === "open");
  if (!rows.length) {
    return [];
  }

  const inviterIds = rows.map((invite: any) => invite.from_user_id as string);
  const inviterMap = await fetchPublicProfileBasics(inviterIds);

  return rows.map((invite: any) => ({
    id: invite.id,
    lobby_id: invite.lobby_id,
    lobby_name: invite.lobbies?.name ?? "Squad Lobby",
    from_user_id: invite.from_user_id,
    from_username:
      inviterMap.get(invite.from_user_id)?.username?.trim() ||
      inviterMap.get(invite.from_user_id)?.email?.split("@")[0]?.trim() ||
      `Player ${String(invite.from_user_id).slice(0, 8)}`,
    password_required: !!invite.lobbies?.password_required,
  }));
}

export async function respondLobbyInvite(inviteId: number, lobbyId: string, action: "accept" | "ignore", password?: string | null) {
  if (await hasPlatformApiSession()) {
    try {
      const response = await platformFetch(`/api/social/lobby-invites/${inviteId}/respond`, {
        method: "POST",
        body: JSON.stringify({ action, password }),
      });
      if (response.ok) {
        return;
      }
    } catch {
      // Fall back to Supabase below.
    }
  }

  if (action === "accept") {
    const { error: joinError } = await supabase.rpc("join_matchmaking_lobby", {
      p_lobby_id: lobbyId,
      p_password: password ?? null,
    });

    if (joinError) {
      throw joinError;
    }
  }

  const { error } = await supabase
    .from("lobby_invites")
    .update({ status: action === "accept" ? "accepted" : "ignored", responded_at: new Date().toISOString() })
    .eq("id", inviteId);

  if (error) {
    throw error;
  }
}
