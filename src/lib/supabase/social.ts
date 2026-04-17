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
