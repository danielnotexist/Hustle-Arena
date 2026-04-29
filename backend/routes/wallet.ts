import { Router } from "express";
import { requireAdmin, requireAuth, type AuthenticatedRequest } from "../middleware/auth";
import { getSupabaseForBearerToken } from "../supabase";

export const walletRouter = Router();

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

function optionalText(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function requirePositiveAmount(value: unknown) {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new BadRequestError("Enter a valid USDT amount.");
  }
  return amount;
}

function requireNumericId(value: unknown, label: string) {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) {
    throw new BadRequestError(`Invalid ${label}.`);
  }
  return id;
}

function requireText(value: unknown, label: string) {
  const text = optionalText(value);
  if (!text) {
    throw new BadRequestError(`${label} is required.`);
  }
  return text;
}

async function callRpc(req: AuthenticatedRequest, rpcName: string, params: Record<string, unknown>) {
  const supabase = getUserSupabase(req);
  const { error } = await supabase.rpc(rpcName, params);

  if (error) {
    throw error;
  }
}

walletRouter.post("/deposit-requests", requireAuth, async (req: AuthenticatedRequest, res, next) => {
  try {
    const amountUsdt = requirePositiveAmount(req.body?.amountUsdt);
    const txid = optionalText(req.body?.txid)?.toLowerCase();
    const toWalletAddress = optionalText(req.body?.toWalletAddress);

    if (!txid || !toWalletAddress) {
      res.status(400).json({ error: "Transaction hash and destination wallet are required." });
      return;
    }

    const supabase = getUserSupabase(req);
    const { data, error } = await supabase
      .from("deposit_requests")
      .insert({
        user_id: req.auth?.user.id,
        amount_usdt: amountUsdt,
        txid,
        network: optionalText(req.body?.network) || "BEP20",
        to_wallet_address: toWalletAddress,
        from_wallet_address: optionalText(req.body?.fromWalletAddress),
        note: optionalText(req.body?.note),
        status: "pending",
      })
      .select("*")
      .single();

    if (error) {
      throw error;
    }

    res.status(201).json({ data });
  } catch (error) {
    next(error);
  }
});

walletRouter.post("/withdrawal-requests", requireAuth, async (req: AuthenticatedRequest, res, next) => {
  try {
    const amountUsdt = requirePositiveAmount(req.body?.amountUsdt);
    const destinationWalletAddress = optionalText(req.body?.destinationWalletAddress);

    if (!destinationWalletAddress) {
      res.status(400).json({ error: "Destination wallet address is required." });
      return;
    }

    const supabase = getUserSupabase(req);
    const { data, error } = await supabase
      .from("withdrawal_requests")
      .insert({
        user_id: req.auth?.user.id,
        amount_usdt: amountUsdt,
        network: optionalText(req.body?.network) || "BEP20",
        destination_wallet_address: destinationWalletAddress,
        note: optionalText(req.body?.note),
        status: "pending",
      })
      .select("*")
      .single();

    if (error) {
      throw error;
    }

    res.status(201).json({ data });
  } catch (error) {
    next(error);
  }
});

walletRouter.post("/admin/deposit-requests/:requestId/approve", requireAuth, requireAdmin, async (req: AuthenticatedRequest, res, next) => {
  try {
    await callRpc(req, "admin_approve_deposit_request", {
      p_request_id: requireNumericId(req.params.requestId, "deposit request id"),
      p_admin_note: optionalText(req.body?.adminNote),
    });
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

walletRouter.post("/admin/deposit-requests/:requestId/reject", requireAuth, requireAdmin, async (req: AuthenticatedRequest, res, next) => {
  try {
    await callRpc(req, "admin_reject_deposit_request", {
      p_request_id: requireNumericId(req.params.requestId, "deposit request id"),
      p_admin_note: optionalText(req.body?.adminNote),
    });
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

walletRouter.post("/admin/withdrawal-requests/:requestId/approve", requireAuth, requireAdmin, async (req: AuthenticatedRequest, res, next) => {
  try {
    await callRpc(req, "admin_approve_withdrawal_request", {
      p_request_id: requireNumericId(req.params.requestId, "withdrawal request id"),
      p_admin_note: optionalText(req.body?.adminNote),
    });
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

walletRouter.post("/admin/withdrawal-requests/:requestId/reject", requireAuth, requireAdmin, async (req: AuthenticatedRequest, res, next) => {
  try {
    await callRpc(req, "admin_reject_withdrawal_request", {
      p_request_id: requireNumericId(req.params.requestId, "withdrawal request id"),
      p_admin_note: optionalText(req.body?.adminNote),
    });
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

walletRouter.post("/admin/payout-jobs/:payoutJobId/broadcasted", requireAuth, requireAdmin, async (req: AuthenticatedRequest, res, next) => {
  try {
    await callRpc(req, "admin_mark_payout_broadcasted", {
      p_payout_job_id: requireNumericId(req.params.payoutJobId, "payout job id"),
      p_txid: requireText(req.body?.txid, "Transaction hash"),
      p_admin_note: optionalText(req.body?.adminNote),
    });
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

walletRouter.post("/admin/payout-jobs/:payoutJobId/confirmed", requireAuth, requireAdmin, async (req: AuthenticatedRequest, res, next) => {
  try {
    await callRpc(req, "admin_mark_payout_confirmed", {
      p_payout_job_id: requireNumericId(req.params.payoutJobId, "payout job id"),
      p_txid: optionalText(req.body?.txid),
      p_admin_note: optionalText(req.body?.adminNote),
    });
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

walletRouter.post("/admin/payout-jobs/:payoutJobId/failed", requireAuth, requireAdmin, async (req: AuthenticatedRequest, res, next) => {
  try {
    await callRpc(req, "admin_mark_payout_failed", {
      p_payout_job_id: requireNumericId(req.params.payoutJobId, "payout job id"),
      p_failure_reason: requireText(req.body?.failureReason, "Failure reason"),
      p_admin_note: optionalText(req.body?.adminNote),
      p_refund_to_available: req.body?.refundToAvailable !== false,
    });
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});
