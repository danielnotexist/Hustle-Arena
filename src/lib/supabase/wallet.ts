import { appEnv } from "../env";
import { supabase } from "../supabase";
import type { DepositRequestRecord, PayoutJobRecord, WithdrawalRequestRecord } from "./types";

export async function submitDepositRequest(input: {
  amountUsdt: number;
  txid: string;
  fromWalletAddress?: string;
  note?: string;
}) {
  const payload = {
    user_id: (await supabase.auth.getUser()).data.user?.id,
    amount_usdt: input.amountUsdt,
    txid: input.txid.trim().toLowerCase(),
    network: appEnv.platformHotWalletNetwork || "BEP20",
    to_wallet_address: appEnv.platformHotWalletAddress,
    from_wallet_address: input.fromWalletAddress?.trim() || null,
    note: input.note?.trim() || null,
    status: "pending" as const,
  };

  const { data, error } = await supabase
    .from("deposit_requests")
    .insert(payload)
    .select("*")
    .single();

  if (error) {
    throw error;
  }

  return data as DepositRequestRecord;
}

export async function fetchMyDepositRequests(userId: string) {
  const { data, error } = await supabase
    .from("deposit_requests")
    .select("*")
    .eq("user_id", userId)
    .order("requested_at", { ascending: false });

  if (error) {
    throw error;
  }

  return (data || []) as DepositRequestRecord[];
}

export async function fetchAdminDepositRequests() {
  const { data, error } = await supabase
    .from("deposit_requests")
    .select("*, profiles:user_id(username,email)")
    .order("requested_at", { ascending: false });

  if (error) {
    throw error;
  }

  return data || [];
}

export async function approveDepositRequest(requestId: number, adminNote?: string) {
  const { error } = await supabase.rpc("admin_approve_deposit_request", {
    p_request_id: requestId,
    p_admin_note: adminNote || null,
  });

  if (error) {
    throw error;
  }
}

export async function rejectDepositRequest(requestId: number, adminNote?: string) {
  const { error } = await supabase.rpc("admin_reject_deposit_request", {
    p_request_id: requestId,
    p_admin_note: adminNote || null,
  });

  if (error) {
    throw error;
  }
}

export async function submitWithdrawalRequest(input: {
  amountUsdt: number;
  destinationWalletAddress: string;
  note?: string;
}) {
  const payload = {
    user_id: (await supabase.auth.getUser()).data.user?.id,
    amount_usdt: input.amountUsdt,
    network: appEnv.platformHotWalletNetwork || "BEP20",
    destination_wallet_address: input.destinationWalletAddress.trim(),
    note: input.note?.trim() || null,
    status: "pending" as const,
  };

  const { data, error } = await supabase
    .from("withdrawal_requests")
    .insert(payload)
    .select("*")
    .single();

  if (error) {
    throw error;
  }

  return data as WithdrawalRequestRecord;
}

export async function fetchMyWithdrawalRequests(userId: string) {
  const { data, error } = await supabase
    .from("withdrawal_requests")
    .select("*, payout_jobs(*)")
    .eq("user_id", userId)
    .order("requested_at", { ascending: false });

  if (error) {
    throw error;
  }

  return (data || []) as WithdrawalRequestRecord[];
}

export async function fetchAdminWithdrawalRequests() {
  const { data, error } = await supabase
    .from("withdrawal_requests")
    .select("*, profiles:user_id(username,email), payout_jobs(*)")
    .order("requested_at", { ascending: false });

  if (error) {
    throw error;
  }

  return data || [];
}

export async function approveWithdrawalRequest(requestId: number, adminNote?: string) {
  const { error } = await supabase.rpc("admin_approve_withdrawal_request", {
    p_request_id: requestId,
    p_admin_note: adminNote || null,
  });

  if (error) {
    throw error;
  }
}

export async function rejectWithdrawalRequest(requestId: number, adminNote?: string) {
  const { error } = await supabase.rpc("admin_reject_withdrawal_request", {
    p_request_id: requestId,
    p_admin_note: adminNote || null,
  });

  if (error) {
    throw error;
  }
}

export async function fetchAdminPayoutJobs() {
  const { data, error } = await supabase
    .from("payout_jobs")
    .select("*, profiles:user_id(username,email)")
    .order("queued_at", { ascending: false });

  if (error) {
    throw error;
  }

  return (data || []) as (PayoutJobRecord & { profiles?: { username?: string; email?: string } | null })[];
}

export async function markPayoutBroadcasted(payoutJobId: number, txid: string, adminNote?: string) {
  const { error } = await supabase.rpc("admin_mark_payout_broadcasted", {
    p_payout_job_id: payoutJobId,
    p_txid: txid,
    p_admin_note: adminNote || null,
  });

  if (error) {
    throw error;
  }
}

export async function markPayoutConfirmed(payoutJobId: number, txid?: string, adminNote?: string) {
  const { error } = await supabase.rpc("admin_mark_payout_confirmed", {
    p_payout_job_id: payoutJobId,
    p_txid: txid || null,
    p_admin_note: adminNote || null,
  });

  if (error) {
    throw error;
  }
}

export async function markPayoutFailed(
  payoutJobId: number,
  failureReason: string,
  adminNote?: string,
  refundToAvailable = true,
) {
  const { error } = await supabase.rpc("admin_mark_payout_failed", {
    p_payout_job_id: payoutJobId,
    p_failure_reason: failureReason,
    p_admin_note: adminNote || null,
    p_refund_to_available: refundToAvailable,
  });

  if (error) {
    throw error;
  }
}
