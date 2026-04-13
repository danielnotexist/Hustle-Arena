import { supabase } from "../supabase";

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
}

export async function fetchPublicProfileBasics(userIds: string[]) {
  const uniqueUserIds = Array.from(new Set(userIds.filter(Boolean)));
  if (!uniqueUserIds.length) {
    return new Map<string, PublicProfileBasic>();
  }

  const { data, error } = await supabase.rpc("get_public_profile_basics", {
    p_user_ids: uniqueUserIds,
  });

  if (error) {
    throw error;
  }

  return new Map(
    ((data || []) as PublicProfileBasic[]).map((profile) => [
      profile.id,
      {
        id: profile.id,
        username: profile.username,
        email: profile.email,
      },
    ])
  );
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

export async function fetchMyNotifications(limit = 20) {
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
