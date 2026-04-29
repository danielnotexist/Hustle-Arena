import { Router } from "express";
import { optionalAuthSoft, requireAuth, type AuthenticatedRequest } from "../middleware/auth";
import { getSupabaseAdmin, getSupabaseForBearerToken } from "../supabase";

export const socialRouter = Router();

class BadRequestError extends Error {
  statusCode = 400;
}

function getBearerToken(req: AuthenticatedRequest) {
  const header = req.headers.authorization || "";
  const [scheme, token] = header.split(" ");
  return scheme?.toLowerCase() === "bearer" ? token : "";
}

function getUserSupabase(req: AuthenticatedRequest) {
  const token = getBearerToken(req);
  if (!token) {
    throw new Error("Missing bearer token");
  }
  return getSupabaseForBearerToken(token);
}

function requireCurrentUserId(req: AuthenticatedRequest) {
  const userId = req.auth?.user.id;
  if (!userId) {
    throw new Error("Missing authenticated user");
  }
  return userId;
}

function optionalLimit(value: unknown, fallback: number, max: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return Math.min(Math.floor(parsed), max);
}

function requireText(value: unknown, label: string, maxLength: number) {
  const text = typeof value === "string" ? value.trim() : "";
  if (!text) {
    throw new BadRequestError(`${label} is required.`);
  }
  if (text.length > maxLength) {
    throw new BadRequestError(`${label} is too long.`);
  }
  return text;
}

function requireNumberArray(value: unknown, label: string) {
  if (!Array.isArray(value)) {
    throw new BadRequestError(`${label} must be an array.`);
  }

  const ids = value
    .map((entry) => Number(entry))
    .filter((entry) => Number.isInteger(entry) && entry > 0);

  if (!ids.length) {
    throw new BadRequestError(`${label} must include at least one id.`);
  }

  return Array.from(new Set(ids)).slice(0, 100);
}

socialRouter.get("/notifications", optionalAuthSoft, async (req: AuthenticatedRequest, res, next) => {
  try {
    if (!req.auth?.user.id) {
      res.json({ data: [] });
      return;
    }

    const limit = optionalLimit(req.query.limit, 20, 100);
    const supabase = getUserSupabase(req);
    const { data, error } = await supabase
      .from("notifications")
      .select("id, title, body, is_read, created_at, notice_type, link_target, metadata")
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) {
      throw error;
    }

    res.json({ data: data || [] });
  } catch (error) {
    next(error);
  }
});

socialRouter.post("/notifications/read", requireAuth, async (req: AuthenticatedRequest, res, next) => {
  try {
    const ids = requireNumberArray(req.body?.ids, "Notification ids");
    const supabase = getUserSupabase(req);

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

    res.json({ ok: true, ids });
  } catch (error) {
    next(error);
  }
});

socialRouter.get("/direct-messages/unread-counts", requireAuth, async (req: AuthenticatedRequest, res, next) => {
  try {
    const userId = requireCurrentUserId(req);
    const supabaseAdmin = getSupabaseAdmin();
    const { data, error } = await supabaseAdmin
      .from("direct_messages")
      .select("sender_id")
      .eq("receiver_id", userId)
      .eq("is_read", false);

    if (error) {
      throw error;
    }

    const counts: Record<string, number> = {};
    (data || []).forEach((row: any) => {
      const senderId = row.sender_id as string;
      counts[senderId] = (counts[senderId] || 0) + 1;
    });

    res.json({ data: counts });
  } catch (error) {
    next(error);
  }
});

socialRouter.get("/direct-messages/thread/:friendId", requireAuth, async (req: AuthenticatedRequest, res, next) => {
  try {
    const userId = requireCurrentUserId(req);
    const friendId = requireText(req.params.friendId, "Friend id", 80);
    const limit = optionalLimit(req.query.limit, 200, 300);
    const markRead = req.query.markRead !== "false";
    const supabaseAdmin = getSupabaseAdmin();
    const condition =
      `and(sender_id.eq.${userId},receiver_id.eq.${friendId}),and(sender_id.eq.${friendId},receiver_id.eq.${userId})`;

    const { data, error } = await supabaseAdmin
      .from("direct_messages")
      .select("id,sender_id,receiver_id,message,message_type,metadata,created_at")
      .or(condition)
      .order("created_at", { ascending: true })
      .limit(limit);

    if (error) {
      throw error;
    }

    if (markRead) {
      const { error: markReadError } = await supabaseAdmin
        .from("direct_messages")
        .update({ is_read: true })
        .eq("receiver_id", userId)
        .eq("sender_id", friendId)
        .eq("is_read", false);

      if (markReadError) {
        throw markReadError;
      }
    }

    res.json({ data: data || [] });
  } catch (error) {
    next(error);
  }
});

socialRouter.post("/direct-messages", requireAuth, async (req: AuthenticatedRequest, res, next) => {
  try {
    const userId = requireCurrentUserId(req);
    const receiverId = requireText(req.body?.receiverId, "Receiver id", 80);
    const message = requireText(req.body?.message, "Message", 2000);
    const messageType = typeof req.body?.messageType === "string" ? req.body.messageType.trim() || "text" : "text";
    const metadata = req.body?.metadata && typeof req.body.metadata === "object" ? req.body.metadata : {};
    const supabase = getUserSupabase(req);

    const { data, error } = await supabase
      .from("direct_messages")
      .insert({
        sender_id: userId,
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

    res.status(201).json({ data });
  } catch (error) {
    next(error);
  }
});

socialRouter.get("/lobby-invites/pending", requireAuth, async (req: AuthenticatedRequest, res, next) => {
  try {
    const userId = requireCurrentUserId(req);
    const supabaseAdmin = getSupabaseAdmin();
    const { data, error } = await supabaseAdmin
      .from("lobby_invites")
      .select("id,lobby_id,from_user_id,status,lobbies!inner(name,password_required,status)")
      .eq("to_user_id", userId)
      .eq("status", "pending");

    if (error) {
      throw error;
    }

    const rows = (data || []).filter((invite: any) => invite.lobbies?.status === "open");
    const inviterIds = Array.from(new Set(rows.map((invite: any) => invite.from_user_id).filter(Boolean)));
    const profileMap = new Map<string, any>();

    if (inviterIds.length) {
      const { data: profiles, error: profileError } = await supabaseAdmin
        .from("profiles")
        .select("id, username, email")
        .in("id", inviterIds);

      if (profileError) {
        throw profileError;
      }

      (profiles || []).forEach((profile: any) => profileMap.set(profile.id, profile));
    }

    res.json({
      data: rows.map((invite: any) => {
        const profile = profileMap.get(invite.from_user_id);
        return {
          id: invite.id,
          lobby_id: invite.lobby_id,
          lobby_name: invite.lobbies?.name || "Squad Lobby",
          from_user_id: invite.from_user_id,
          from_username:
            profile?.username?.trim() ||
            profile?.email?.split("@")[0]?.trim() ||
            `Player ${String(invite.from_user_id).slice(0, 8)}`,
          password_required: Boolean(invite.lobbies?.password_required),
        };
      }),
    });
  } catch (error) {
    next(error);
  }
});

socialRouter.post("/lobby-invites/:inviteId/respond", requireAuth, async (req: AuthenticatedRequest, res, next) => {
  try {
    const userId = requireCurrentUserId(req);
    const inviteId = Number(req.params.inviteId);
    const action = req.body?.action;

    if (!Number.isInteger(inviteId) || inviteId <= 0) {
      throw new BadRequestError("Invalid lobby invite id.");
    }
    if (action !== "accept" && action !== "ignore") {
      throw new BadRequestError("Invalid lobby invite action.");
    }

    const supabase = getUserSupabase(req);
    const supabaseAdmin = getSupabaseAdmin();

    if (action === "accept") {
      const { data: invite, error: inviteError } = await supabaseAdmin
        .from("lobby_invites")
        .select("lobby_id,to_user_id,status")
        .eq("id", inviteId)
        .eq("to_user_id", userId)
        .maybeSingle();

      if (inviteError) {
        throw inviteError;
      }
      if (!invite || invite.status !== "pending") {
        throw new BadRequestError("Lobby invite is no longer pending.");
      }

      const { error: joinError } = await supabase.rpc("join_matchmaking_lobby", {
        p_lobby_id: invite.lobby_id,
        p_password: typeof req.body?.password === "string" ? req.body.password : null,
      });

      if (joinError) {
        throw joinError;
      }
    }

    const { error } = await supabaseAdmin
      .from("lobby_invites")
      .update({ status: action === "accept" ? "accepted" : "ignored", responded_at: new Date().toISOString() })
      .eq("id", inviteId)
      .eq("to_user_id", userId);

    if (error) {
      throw error;
    }

    res.json({ ok: true, action });
  } catch (error) {
    next(error);
  }
});
