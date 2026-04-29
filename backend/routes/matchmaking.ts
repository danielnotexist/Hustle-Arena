import { Router } from "express";
import { requireAuth, type AuthenticatedRequest } from "../middleware/auth";
import { getSupabaseForBearerToken } from "../supabase";

export const matchmakingRouter = Router();

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

function getUserId(req: AuthenticatedRequest) {
  const userId = req.auth?.user.id;
  if (!userId) {
    throw new Error("Missing authenticated user");
  }
  return userId;
}

function requireInviteId(value: unknown) {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) {
    throw new BadRequestError("Invalid party invite id.");
  }
  return id;
}

function requireMode(value: unknown) {
  if (value !== "demo" && value !== "live") {
    throw new BadRequestError("Invalid queue mode.");
  }
  return value;
}

function requireTeamSize(value: unknown) {
  const teamSize = Number(value);
  if (teamSize !== 2 && teamSize !== 5) {
    throw new BadRequestError("Invalid team size.");
  }
  return teamSize;
}

function requireStakeAmount(value: unknown) {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount < 0) {
    throw new BadRequestError("Invalid stake amount.");
  }
  return amount;
}

function requireUserId(value: unknown) {
  const userId = typeof value === "string" ? value.trim() : "";
  if (!userId) {
    throw new BadRequestError("Invitee user id is required.");
  }
  return userId;
}

matchmakingRouter.get("/party-invites", requireAuth, async (req: AuthenticatedRequest, res, next) => {
  try {
    const userId = getUserId(req);
    const supabase = getUserSupabase(req);
    const { data, error } = await supabase
      .from("quick_queue_party_invites")
      .select("id, host_user_id, invitee_user_id, mode, team_size, stake_amount, status, created_at, updated_at, responded_at")
      .or(`host_user_id.eq.${userId},invitee_user_id.eq.${userId}`)
      .order("updated_at", { ascending: false });

    if (error) {
      throw error;
    }

    res.json({ data: data || [] });
  } catch (error) {
    next(error);
  }
});

matchmakingRouter.post("/party-invites", requireAuth, async (req: AuthenticatedRequest, res, next) => {
  try {
    const supabase = getUserSupabase(req);
    const { data, error } = await supabase.rpc("send_quick_queue_party_invite", {
      p_invitee_user_id: requireUserId(req.body?.inviteeUserId),
      p_mode: requireMode(req.body?.mode),
      p_team_size: requireTeamSize(req.body?.teamSize),
      p_stake_amount: requireStakeAmount(req.body?.stakeAmount),
    });

    if (error) {
      throw error;
    }

    res.status(201).json({ data: data || "sent" });
  } catch (error) {
    next(error);
  }
});

matchmakingRouter.post("/party-invites/:inviteId/respond", requireAuth, async (req: AuthenticatedRequest, res, next) => {
  try {
    const action = req.body?.action;
    if (action !== "accept" && action !== "decline" && action !== "cancel") {
      throw new BadRequestError("Invalid party invite action.");
    }

    const supabase = getUserSupabase(req);
    const { data, error } = await supabase.rpc("respond_quick_queue_party_invite", {
      p_invite_id: requireInviteId(req.params.inviteId),
      p_action: action,
    });

    if (error) {
      throw error;
    }

    res.json({ data: data || action });
  } catch (error) {
    next(error);
  }
});
