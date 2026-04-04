import { motion } from "motion/react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Activity, CheckCircle2, Copy, FileText, Search, Settings, Shield, ShieldAlert, Star, Users, X } from "lucide-react";
import React, { useEffect, useState } from "react";
import { appEnv, isSupabaseConfigured } from "../lib/env";
import { fetchAdminProfiles, updateAdminKycStatus, updateAdminUserField } from "../lib/supabase/profile";
import {
  approveDepositRequest,
  approveWithdrawalRequest,
  fetchAdminDepositRequests,
  fetchAdminPayoutJobs,
  fetchAdminWithdrawalRequests,
  fetchMyDepositRequests,
  fetchMyWithdrawalRequests,
  markPayoutBroadcasted,
  markPayoutConfirmed,
  markPayoutFailed,
  rejectDepositRequest,
  rejectWithdrawalRequest,
  submitDepositRequest,
  submitWithdrawalRequest,
} from "../lib/supabase/wallet";
import { collection, db, doc, onSnapshot, query, serverTimestamp, updateDoc } from "../firebase";
import { cn } from "./shared-ui";
import type { DepositRequestView, PayoutJobView, WithdrawalRequestView } from "./types";

function getSingleRelatedRecord<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }
  return value ?? null;
}

function mapDepositRequest(record: any): DepositRequestView {
  return {
    id: record.id,
    amountUsdt: Number(record.amount_usdt || 0),
    txid: record.txid,
    network: record.network,
    toWalletAddress: record.to_wallet_address,
    fromWalletAddress: record.from_wallet_address,
    note: record.note,
    status: record.status,
    adminNote: record.admin_note,
    requestedAt: record.requested_at,
    reviewedAt: record.reviewed_at,
  };
}

function mapWithdrawalRequest(record: any): WithdrawalRequestView {
  const payoutJob = getSingleRelatedRecord<any>(record.payout_jobs);
  return {
    id: record.id,
    amountUsdt: Number(record.amount_usdt || 0),
    network: record.network,
    destinationWalletAddress: record.destination_wallet_address,
    note: record.note,
    status: record.status,
    adminNote: record.admin_note,
    requestedAt: record.requested_at,
    reviewedAt: record.reviewed_at,
    payoutStatus: payoutJob?.status || null,
    payoutTxid: payoutJob?.txid || null,
    payoutFailureReason: payoutJob?.failure_reason || null,
  };
}

function mapPayoutJob(record: any): PayoutJobView {
  return {
    id: record.id,
    withdrawalRequestId: record.withdrawal_request_id,
    userId: record.user_id,
    username: record.profiles?.username || null,
    email: record.profiles?.email || null,
    amountUsdt: Number(record.amount_usdt || 0),
    network: record.network,
    destinationWalletAddress: record.destination_wallet_address,
    status: record.status,
    txid: record.txid,
    failureReason: record.failure_reason,
    adminNote: record.admin_note,
    queuedAt: record.queued_at,
    broadcastedAt: record.broadcasted_at,
    confirmedAt: record.confirmed_at,
    failedAt: record.failed_at,
  };
}

export function DepositPage({ addToast, user }: { addToast: any, user: any }) {
  const hotWalletAddress = appEnv.platformHotWalletAddress || "0xe9485f341b23d1d00a8a742a0ef1ad456a7ff3b6";
  const walletNetwork = appEnv.platformHotWalletNetwork || "BEP20";
  const [amountUsdt, setAmountUsdt] = useState("");
  const [txid, setTxid] = useState("");
  const [fromWalletAddress, setFromWalletAddress] = useState("");
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [depositRequests, setDepositRequests] = useState<DepositRequestView[]>([]);
  const [withdrawalAmountUsdt, setWithdrawalAmountUsdt] = useState("");
  const [destinationWalletAddress, setDestinationWalletAddress] = useState("");
  const [withdrawalNote, setWithdrawalNote] = useState("");
  const [submittingWithdrawal, setSubmittingWithdrawal] = useState(false);
  const [withdrawalRequests, setWithdrawalRequests] = useState<WithdrawalRequestView[]>([]);
  const [loadingRequests, setLoadingRequests] = useState(false);

  const loadDepositRequests = async () => {
    if (!isSupabaseConfigured() || !user?.id) {
      return;
    }

    setLoadingRequests(true);
    try {
      const requests = await fetchMyDepositRequests(user.id);
      setDepositRequests(requests.map(mapDepositRequest));
      const withdrawalList = await fetchMyWithdrawalRequests(user.id);
      setWithdrawalRequests(withdrawalList.map(mapWithdrawalRequest));
    } catch (error) {
      console.error("Failed to load deposit requests:", error);
    } finally {
      setLoadingRequests(false);
    }
  };

  const handleSubmitWithdrawalRequest = async () => {
    if (!isSupabaseConfigured()) {
      addToast("Supabase wallet flow is not configured in this environment.", "error");
      return;
    }

    const parsedAmount = Number(withdrawalAmountUsdt);
    if (!user?.id || !parsedAmount || parsedAmount <= 0 || !destinationWalletAddress.trim()) {
      addToast("Enter a valid USDT amount and destination wallet address.", "error");
      return;
    }

    setSubmittingWithdrawal(true);
    try {
      await submitWithdrawalRequest({
        amountUsdt: parsedAmount,
        destinationWalletAddress,
        note: withdrawalNote,
      });
      addToast("Withdrawal request submitted for review.", "success");
      setWithdrawalAmountUsdt("");
      setDestinationWalletAddress("");
      setWithdrawalNote("");
      await loadDepositRequests();
    } catch (error: any) {
      console.error("Withdrawal request failed:", error);
      addToast(error?.message || "Failed to submit withdrawal request.", "error");
    } finally {
      setSubmittingWithdrawal(false);
    }
  };

  useEffect(() => {
    void loadDepositRequests();
  }, [user?.id]);
  
  const copyToClipboard = () => {
    navigator.clipboard.writeText(hotWalletAddress);
    addToast("Address copied to clipboard!", "success");
  };

  const handleSubmitDepositRequest = async () => {
    if (!isSupabaseConfigured()) {
      addToast("Supabase wallet flow is not configured in this environment.", "error");
      return;
    }

    const parsedAmount = Number(amountUsdt);
    if (!user?.id || !parsedAmount || parsedAmount <= 0 || !txid.trim()) {
      addToast("Enter a valid USDT amount and the transaction hash (TXID).", "error");
      return;
    }

    setSubmitting(true);
    try {
      await submitDepositRequest({
        amountUsdt: parsedAmount,
        txid,
        fromWalletAddress,
        note,
      });
      addToast("Deposit request submitted for review.", "success");
      setAmountUsdt("");
      setTxid("");
      setFromWalletAddress("");
      setNote("");
      await loadDepositRequests();
    } catch (error: any) {
      console.error("Deposit request failed:", error);
      addToast(error?.message || "Failed to submit deposit request.", "error");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      <div className="text-center space-y-4">
        <h3 className="text-4xl font-display font-bold uppercase tracking-tight text-white">USDT Deposit</h3>
        <p className="text-esport-text-muted max-w-xl mx-auto">
          Deposit USDT to the platform hot wallet on the {walletNetwork} network to fund your account.
          Credits should only be applied after backend-side verification and reconciliation.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        <div className="esport-card p-8 flex flex-col items-center justify-center space-y-6">
          <div className="bg-white p-4 rounded-2xl shadow-[0_0_50px_rgba(255,255,255,0.1)]">
            <img 
              src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${hotWalletAddress}`} 
              alt="USDT deposit wallet QR code" 
              className="w-48 h-48"
            />
          </div>
          <div className="text-center">
            <div className="text-[10px] font-bold text-esport-accent uppercase tracking-widest mb-1">Scan to Pay</div>
            <div className="text-xs text-esport-text-muted">Send USDT on {walletNetwork} only</div>
          </div>
        </div>

        <div className="esport-card p-8 space-y-8">
          <div className="space-y-4">
            <label className="text-[10px] font-bold text-esport-text-muted uppercase tracking-widest">Platform Hot Wallet Address</label>
            <div className="flex gap-2">
              <div className="flex-1 bg-black/40 border border-esport-border rounded-xl px-4 py-4 font-mono text-sm break-all text-white">
                {hotWalletAddress}
              </div>
              <button 
                onClick={copyToClipboard}
                className="p-4 bg-esport-accent/10 border border-esport-accent/20 rounded-xl text-esport-accent hover:bg-esport-accent hover:text-esport-bg transition-all"
              >
                <Copy size={20} />
              </button>
            </div>
          </div>

          <div className="space-y-4">
            <div className="flex items-center gap-3 p-4 bg-white/5 border border-esport-border rounded-xl">
              <div className="w-10 h-10 rounded-full bg-esport-secondary/10 flex items-center justify-center text-esport-secondary">
                <Shield size={20} />
              </div>
              <div>
                <div className="text-xs font-bold text-white">Hot Wallet Pool</div>
                <div className="text-[10px] text-esport-text-muted">User balances are credited internally after deposit verification</div>
              </div>
            </div>
            <div className="flex items-center gap-3 p-4 bg-white/5 border border-esport-border rounded-xl">
              <div className="w-10 h-10 rounded-full bg-esport-success/10 flex items-center justify-center text-esport-success">
                <Activity size={20} />
              </div>
              <div>
                <div className="text-xs font-bold text-white">Network Guardrail</div>
                <div className="text-[10px] text-esport-text-muted">Deposits sent on the wrong network should not be credited</div>
              </div>
            </div>
          </div>

          <div className="space-y-4 border-t border-esport-border pt-6">
            <div>
              <div className="text-[10px] font-bold text-esport-text-muted uppercase tracking-widest mb-2">Submit Deposit Confirmation</div>
              <p className="text-xs text-esport-text-muted">Paste your TXID after sending USDT so the platform can reconcile and credit your balance.</p>
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-bold text-esport-text-muted uppercase tracking-widest">Amount (USDT)</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={amountUsdt}
                onChange={(e) => setAmountUsdt(e.target.value)}
                className="w-full bg-white/5 border border-esport-border rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-esport-accent/50"
                placeholder="25.00"
              />
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-bold text-esport-text-muted uppercase tracking-widest">Transaction Hash (TXID)</label>
              <input
                type="text"
                value={txid}
                onChange={(e) => setTxid(e.target.value)}
                className="w-full bg-white/5 border border-esport-border rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-esport-accent/50 font-mono"
                placeholder="0x..."
              />
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-bold text-esport-text-muted uppercase tracking-widest">Sender Wallet Address (Optional)</label>
              <input
                type="text"
                value={fromWalletAddress}
                onChange={(e) => setFromWalletAddress(e.target.value)}
                className="w-full bg-white/5 border border-esport-border rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-esport-accent/50 font-mono"
                placeholder="0x..."
              />
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-bold text-esport-text-muted uppercase tracking-widest">Note (Optional)</label>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                className="w-full bg-white/5 border border-esport-border rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-esport-accent/50 min-h-[90px]"
                placeholder="Optional context for the admin review team"
              />
            </div>
            <button
              onClick={handleSubmitDepositRequest}
              disabled={submitting || !isSupabaseConfigured()}
              className="esport-btn-primary w-full disabled:opacity-50"
            >
              {submitting ? "Submitting..." : "Submit Deposit Request"}
            </button>
          </div>

          <div className="space-y-4 border-t border-esport-border pt-6">
            <div>
              <div className="text-[10px] font-bold text-esport-text-muted uppercase tracking-widest mb-2">Request Withdrawal</div>
              <p className="text-xs text-esport-text-muted">Request a USDT withdrawal to your wallet. An admin will review and queue payout execution.</p>
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-bold text-esport-text-muted uppercase tracking-widest">Amount (USDT)</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={withdrawalAmountUsdt}
                onChange={(e) => setWithdrawalAmountUsdt(e.target.value)}
                className="w-full bg-white/5 border border-esport-border rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-esport-accent/50"
                placeholder="25.00"
              />
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-bold text-esport-text-muted uppercase tracking-widest">Destination Wallet Address</label>
              <input
                type="text"
                value={destinationWalletAddress}
                onChange={(e) => setDestinationWalletAddress(e.target.value)}
                className="w-full bg-white/5 border border-esport-border rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-esport-accent/50 font-mono"
                placeholder="0x..."
              />
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-bold text-esport-text-muted uppercase tracking-widest">Note (Optional)</label>
              <textarea
                value={withdrawalNote}
                onChange={(e) => setWithdrawalNote(e.target.value)}
                className="w-full bg-white/5 border border-esport-border rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-esport-accent/50 min-h-[90px]"
                placeholder="Optional payout context"
              />
            </div>
            <button
              onClick={handleSubmitWithdrawalRequest}
              disabled={submittingWithdrawal || !isSupabaseConfigured()}
              className="esport-btn-secondary w-full disabled:opacity-50"
            >
              {submittingWithdrawal ? "Submitting..." : "Submit Withdrawal Request"}
            </button>
          </div>
        </div>
      </div>

      <div className="esport-card p-6">
        <h4 className="text-sm font-bold uppercase tracking-widest text-white mb-4">Recent Deposits</h4>
        {loadingRequests ? (
          <div className="text-center py-12 text-esport-text-muted text-sm italic">Loading deposit requests...</div>
        ) : depositRequests.length === 0 ? (
          <div className="text-center py-12 text-esport-text-muted text-sm italic">
            No deposit requests found.
          </div>
        ) : (
          <div className="space-y-3">
            {depositRequests.map((request) => (
              <div key={request.id} className="rounded-xl border border-esport-border bg-white/5 p-4 space-y-2">
                <div className="flex items-center justify-between gap-4">
                  <div className="font-bold text-white">{request.amountUsdt.toFixed(2)} USDT</div>
                  <span className={cn(
                    "badge",
                    request.status === "credited" ? "badge-success" : request.status === "rejected" ? "badge-danger" : "badge-accent"
                  )}>
                    {request.status}
                  </span>
                </div>
                <div className="text-xs text-esport-text-muted font-mono break-all">{request.txid}</div>
                <div className="text-[10px] uppercase tracking-widest text-esport-text-muted">
                  {request.network} • Requested {new Date(request.requestedAt).toLocaleString()}
                </div>
                {request.adminNote && (
                  <div className="text-xs text-esport-text-muted">Admin note: {request.adminNote}</div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="esport-card p-6">
        <h4 className="text-sm font-bold uppercase tracking-widest text-white mb-4">Recent Withdrawals</h4>
        {loadingRequests ? (
          <div className="text-center py-12 text-esport-text-muted text-sm italic">Loading withdrawal requests...</div>
        ) : withdrawalRequests.length === 0 ? (
          <div className="text-center py-12 text-esport-text-muted text-sm italic">
            No withdrawal requests found.
          </div>
        ) : (
          <div className="space-y-3">
            {withdrawalRequests.map((request) => (
              <div key={request.id} className="rounded-xl border border-esport-border bg-white/5 p-4 space-y-2">
                <div className="flex items-center justify-between gap-4">
                  <div className="font-bold text-white">{request.amountUsdt.toFixed(2)} USDT</div>
                  <span className={cn(
                    "badge",
                    request.status === "approved" ? "badge-success" : request.status === "rejected" ? "badge-danger" : "badge-accent"
                  )}>
                    {request.status}
                  </span>
                </div>
                <div className="text-xs text-esport-text-muted font-mono break-all">{request.destinationWalletAddress}</div>
                {request.payoutStatus && (
                  <div className="text-[10px] uppercase tracking-widest text-esport-accent">
                    Payout {request.payoutStatus}
                  </div>
                )}
                {request.payoutTxid && (
                  <div className="text-xs text-esport-text-muted font-mono break-all">TXID: {request.payoutTxid}</div>
                )}
                {request.payoutFailureReason && (
                  <div className="text-xs text-esport-danger">Payout issue: {request.payoutFailureReason}</div>
                )}
                <div className="text-[10px] uppercase tracking-widest text-esport-text-muted">
                  {request.network} • Requested {new Date(request.requestedAt).toLocaleString()}
                </div>
                {request.adminNote && (
                  <div className="text-xs text-esport-text-muted">Admin note: {request.adminNote}</div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export function AdminPanel({ addToast }: { addToast: any }) {
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [rejectingUser, setRejectingUser] = useState<any>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [editingUser, setEditingUser] = useState<any>(null);
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [depositRequests, setDepositRequests] = useState<any[]>([]);
  const [withdrawalRequests, setWithdrawalRequests] = useState<any[]>([]);
  const [payoutJobs, setPayoutJobs] = useState<PayoutJobView[]>([]);

  const loadSupabaseAdminData = async () => {
    const [usersList, depositList, withdrawalList, payoutJobList] = await Promise.all([
      fetchAdminProfiles(),
      fetchAdminDepositRequests(),
      fetchAdminWithdrawalRequests(),
      fetchAdminPayoutJobs(),
    ]);
    setUsers(usersList);
    setDepositRequests(depositList || []);
    setWithdrawalRequests(withdrawalList || []);
    setPayoutJobs((payoutJobList || []).map(mapPayoutJob));
    setLoading(false);
  };

  useEffect(() => {
    if (isSupabaseConfigured()) {
      let isMounted = true;
      const loadProfiles = async () => {
        try {
          const [usersList, depositList, withdrawalList, payoutJobList] = await Promise.all([
            fetchAdminProfiles(),
            fetchAdminDepositRequests(),
            fetchAdminWithdrawalRequests(),
            fetchAdminPayoutJobs(),
          ]);
          if (isMounted) {
            setUsers(usersList);
            setDepositRequests(depositList || []);
            setWithdrawalRequests(withdrawalList || []);
            setPayoutJobs((payoutJobList || []).map(mapPayoutJob));
            setLoading(false);
          }
        } catch (error) {
          console.error("Failed to load Supabase admin users:", error);
          if (isMounted) {
            setLoading(false);
          }
        }
      };
      void loadProfiles();
      return () => {
        isMounted = false;
      };
    }

    const q = query(collection(db, "users"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const usersList = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setUsers(usersList);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const handleKYC = async (userId: string, action: "approve" | "reject") => {
    try {
      if (isSupabaseConfigured()) {
        await updateAdminKycStatus(userId, action === "approve" ? "verified" : "rejected", rejectReason);
        await loadSupabaseAdminData();
        addToast(action === "approve" ? "KYC Approved successfully" : "KYC Rejected", action === "approve" ? "success" : "error");
        setRejectingUser(null);
        setRejectReason("");
      } else if (action === "approve") {
        await updateDoc(doc(db, "users", userId), {
          kycStatus: "verified",
          kycUpdatedAt: serverTimestamp(),
          kycMessage: null
        });
        addToast("KYC Approved successfully", "success");
      } else {
        await updateDoc(doc(db, "users", userId), {
          kycStatus: "rejected",
          kycUpdatedAt: serverTimestamp(),
          kycMessage: rejectReason
        });
        addToast("KYC Rejected", "error");
        setRejectingUser(null);
        setRejectReason("");
      }
    } catch (error) {
      console.error("Error updating KYC:", error);
      addToast("Failed to update KYC", "error");
    }
  };

  const updateUserField = async (userId: string, field: string, value: any) => {
    try {
      if (isSupabaseConfigured()) {
        await updateAdminUserField(userId, field, value);
        await loadSupabaseAdminData();
      } else {
        await updateDoc(doc(db, "users", userId), { [field]: value });
      }
      addToast(`User ${field} updated`, "success");
    } catch (error) {
      addToast("Update failed", "error");
    }
  };

  const filteredUsers = users.filter(user => {
    const matchesSearch = user.username?.toLowerCase().includes(searchQuery.toLowerCase()) || 
                         user.email?.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesFilter = filterStatus === "all" || user.kycStatus === filterStatus;
    return matchesSearch && matchesFilter;
  });

  const stats = {
    total: users.length,
    verified: users.filter(u => u.kycStatus === 'verified').length,
    pending: users.filter(u => u.kycStatus === 'pending').length,
    totalCredits: users.reduce((acc, u) => acc + (u.stats?.credits || 0), 0),
    admins: users.filter(u => u.role === 'admin').length
  };

  const pendingDepositRequests = depositRequests.filter((request) => request.status === "pending");
  const pendingWithdrawalRequests = withdrawalRequests.filter((request) => request.status === "pending");
  const activePayoutJobs = payoutJobs.filter((job) => job.status === "queued" || job.status === "broadcasted");

  const handleDepositDecision = async (requestId: number, action: "approve" | "reject") => {
    try {
      const adminNote = prompt(action === "approve" ? "Optional approval note:" : "Reason for rejection:") || "";
      if (action === "approve") {
        await approveDepositRequest(requestId, adminNote);
        addToast("Deposit request credited.", "success");
      } else {
        await rejectDepositRequest(requestId, adminNote);
        addToast("Deposit request rejected.", "info");
      }
      await loadSupabaseAdminData();
    } catch (error: any) {
      console.error("Deposit review failed:", error);
      addToast(error?.message || "Failed to process deposit request.", "error");
    }
  };

  const handleWithdrawalDecision = async (requestId: number, action: "approve" | "reject") => {
    try {
      const adminNote = prompt(action === "approve" ? "Optional approval note:" : "Reason for rejection:") || "";
      if (action === "approve") {
        await approveWithdrawalRequest(requestId, adminNote);
        addToast("Withdrawal request approved.", "success");
      } else {
        await rejectWithdrawalRequest(requestId, adminNote);
        addToast("Withdrawal request rejected.", "info");
      }
      await loadSupabaseAdminData();
    } catch (error: any) {
      console.error("Withdrawal review failed:", error);
      addToast(error?.message || "Failed to process withdrawal request.", "error");
    }
  };

  const handlePayoutStatusUpdate = async (payoutJobId: number, action: "broadcast" | "confirm" | "fail") => {
    try {
      if (action === "broadcast") {
        const txid = prompt("Enter payout transaction hash (TXID):")?.trim();
        if (!txid) {
          addToast("A payout TXID is required to mark the job as broadcasted.", "error");
          return;
        }
        const adminNote = prompt("Optional treasury note:") || "";
        await markPayoutBroadcasted(payoutJobId, txid, adminNote);
        addToast("Payout marked as broadcasted.", "success");
      } else if (action === "confirm") {
        const txid = prompt("Optional payout TXID override or confirmation hash:")?.trim() || "";
        const adminNote = prompt("Optional treasury confirmation note:") || "";
        await markPayoutConfirmed(payoutJobId, txid || undefined, adminNote);
        addToast("Payout marked as confirmed.", "success");
      } else {
        const failureReason = prompt("Why did this payout fail?")?.trim();
        if (!failureReason) {
          addToast("A failure reason is required.", "error");
          return;
        }
        const refundToAvailable = window.confirm("Refund the withdrawal amount back to the user's available balance?");
        const adminNote = prompt("Optional treasury failure note:") || "";
        await markPayoutFailed(payoutJobId, failureReason, adminNote, refundToAvailable);
        addToast(refundToAvailable ? "Payout failed and user balance was refunded." : "Payout failed and is awaiting manual handling.", "info");
      }
      await loadSupabaseAdminData();
    } catch (error: any) {
      console.error("Payout update failed:", error);
      addToast(error?.message || "Failed to update payout job.", "error");
    }
  };

  // Mock data for chart
  const chartData = [
    { name: 'Mon', users: 12, growth: 5 },
    { name: 'Tue', users: 19, growth: 8 },
    { name: 'Wed', users: 15, growth: 12 },
    { name: 'Thu', users: 22, growth: 15 },
    { name: 'Fri', users: 30, growth: 20 },
    { name: 'Sat', users: 45, growth: 25 },
    { name: 'Sun', users: stats.total, growth: 30 },
  ];

  return (
    <div className="space-y-8 pb-20">
      {/* Header & Stats Grid */}
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-6">
        <div>
          <h3 className="text-3xl font-display font-bold uppercase tracking-tight text-white">Admin Control Center</h3>
          <p className="text-sm text-esport-text-muted">Real-time platform monitoring and user management.</p>
        </div>
        <div className="flex flex-wrap gap-4">
          <div className="esport-card px-5 py-3 flex items-center gap-4 bg-white/5 border-esport-accent/20">
            <div className="w-10 h-10 rounded-lg bg-esport-accent/10 flex items-center justify-center">
              <Users className="text-esport-accent" size={20} />
            </div>
            <div>
              <div className="text-[10px] font-bold text-esport-text-muted uppercase">Total Users</div>
              <div className="text-xl font-display font-bold">{stats.total}</div>
            </div>
          </div>
          <div className="esport-card px-5 py-3 flex items-center gap-4 bg-white/5 border-esport-secondary/20">
            <div className="w-10 h-10 rounded-lg bg-esport-secondary/10 flex items-center justify-center">
              <ShieldAlert className="text-esport-secondary" size={20} />
            </div>
            <div>
              <div className="text-[10px] font-bold text-esport-text-muted uppercase">Pending KYC</div>
              <div className="text-xl font-display font-bold text-esport-secondary">{stats.pending}</div>
            </div>
          </div>
          <div className="esport-card px-5 py-3 flex items-center gap-4 bg-white/5 border-esport-success/20">
            <div className="w-10 h-10 rounded-lg bg-esport-success/10 flex items-center justify-center">
              <Star className="text-esport-success" size={20} />
            </div>
            <div>
              <div className="text-[10px] font-bold text-esport-text-muted uppercase">USDT Circ.</div>
              <div className="text-xl font-display font-bold">{stats.totalCredits.toLocaleString()}</div>
            </div>
          </div>
        </div>
      </div>

      {/* Charts Section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 esport-card p-6 min-h-[300px]">
          <div className="flex justify-between items-center mb-6">
            <h4 className="text-sm font-bold uppercase tracking-widest text-white">User Growth Trend</h4>
            <div className="flex gap-2">
              <span className="flex items-center gap-1 text-[10px] text-esport-accent uppercase font-bold">
                <div className="w-2 h-2 rounded-full bg-esport-accent" /> New Users
              </span>
            </div>
          </div>
          <div className="h-[250px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData}>
                <defs>
                  <linearGradient id="colorUsers" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#00f2ff" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#00f2ff" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" vertical={false} />
                <XAxis dataKey="name" stroke="#ffffff40" fontSize={10} tickLine={false} axisLine={false} />
                <YAxis stroke="#ffffff40" fontSize={10} tickLine={false} axisLine={false} />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#0a0a0c', border: '1px solid #ffffff10', borderRadius: '8px' }}
                  itemStyle={{ color: '#00f2ff', fontSize: '12px' }}
                />
                <Area type="monotone" dataKey="users" stroke="#00f2ff" strokeWidth={3} fillOpacity={1} fill="url(#colorUsers)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="esport-card p-6 flex flex-col">
          <h4 className="text-sm font-bold uppercase tracking-widest text-white mb-6">KYC Distribution</h4>
          <div className="flex-1 flex flex-col justify-center gap-6">
            <div className="space-y-2">
              <div className="flex justify-between text-[10px] font-bold uppercase tracking-widest">
                <span className="text-esport-success">Verified</span>
                <span>{Math.round((stats.verified / stats.total) * 100) || 0}%</span>
              </div>
              <div className="h-2 bg-white/5 rounded-full overflow-hidden">
                <div className="h-full bg-esport-success" style={{ width: `${(stats.verified / stats.total) * 100}%` }} />
              </div>
            </div>
            <div className="space-y-2">
              <div className="flex justify-between text-[10px] font-bold uppercase tracking-widest">
                <span className="text-esport-accent">Pending</span>
                <span>{Math.round((stats.pending / stats.total) * 100) || 0}%</span>
              </div>
              <div className="h-2 bg-white/5 rounded-full overflow-hidden">
                <div className="h-full bg-esport-accent" style={{ width: `${(stats.pending / stats.total) * 100}%` }} />
              </div>
            </div>
            <div className="space-y-2">
              <div className="flex justify-between text-[10px] font-bold uppercase tracking-widest">
                <span className="text-esport-text-muted">Unverified</span>
                <span>{Math.round(((stats.total - stats.verified - stats.pending) / stats.total) * 100) || 0}%</span>
              </div>
              <div className="h-2 bg-white/5 rounded-full overflow-hidden">
                <div className="h-full bg-white/20" style={{ width: `${((stats.total - stats.verified - stats.pending) / stats.total) * 100}%` }} />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* User Table Section */}
      {isSupabaseConfigured() && (
        <div className="esport-card overflow-hidden">
          <div className="p-6 border-b border-esport-border flex items-center justify-between gap-4">
            <div>
              <h4 className="text-sm font-bold uppercase tracking-widest text-white">Pending USDT Deposit Requests</h4>
              <p className="text-xs text-esport-text-muted mt-1">Review TXIDs before crediting platform balances.</p>
            </div>
            <span className="badge badge-accent">{pendingDepositRequests.length} pending</span>
          </div>
          {pendingDepositRequests.length === 0 ? (
            <div className="p-12 text-center text-esport-text-muted text-sm">No pending deposit requests.</div>
          ) : (
            <div className="divide-y divide-esport-border">
              {pendingDepositRequests.map((request) => (
                <div key={request.id} className="p-6 flex flex-col lg:flex-row lg:items-center gap-4">
                  <div className="flex-1 min-w-0 space-y-1">
                    <div className="font-bold text-white">{Number(request.amount_usdt).toFixed(2)} USDT</div>
                    <div className="text-xs text-esport-text-muted">
                      {(request.profiles as any)?.username || request.user_id} • {(request.profiles as any)?.email || ""}
                    </div>
                    <div className="text-xs text-esport-text-muted font-mono break-all">{request.txid}</div>
                    <div className="text-[10px] uppercase tracking-widest text-esport-text-muted">
                      {request.network} • {new Date(request.requested_at).toLocaleString()}
                    </div>
                    {request.note && <div className="text-xs text-esport-text-muted">User note: {request.note}</div>}
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleDepositDecision(request.id, "approve")}
                      className="p-2 bg-esport-success/10 text-esport-success hover:bg-esport-success hover:text-white rounded-lg transition-all"
                      title="Approve deposit"
                    >
                      <CheckCircle2 size={16} />
                    </button>
                    <button
                      onClick={() => handleDepositDecision(request.id, "reject")}
                      className="p-2 bg-esport-danger/10 text-esport-danger hover:bg-esport-danger hover:text-white rounded-lg transition-all"
                      title="Reject deposit"
                    >
                      <X size={16} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {isSupabaseConfigured() && (
        <div className="esport-card overflow-hidden">
          <div className="p-6 border-b border-esport-border flex items-center justify-between gap-4">
            <div>
              <h4 className="text-sm font-bold uppercase tracking-widest text-white">Pending USDT Withdrawal Requests</h4>
              <p className="text-xs text-esport-text-muted mt-1">Approve only after confirming payout can be executed from the hot wallet.</p>
            </div>
            <span className="badge badge-accent">{pendingWithdrawalRequests.length} pending</span>
          </div>
          {pendingWithdrawalRequests.length === 0 ? (
            <div className="p-12 text-center text-esport-text-muted text-sm">No pending withdrawal requests.</div>
          ) : (
            <div className="divide-y divide-esport-border">
              {pendingWithdrawalRequests.map((request) => (
                <div key={request.id} className="p-6 flex flex-col lg:flex-row lg:items-center gap-4">
                  <div className="flex-1 min-w-0 space-y-1">
                    <div className="font-bold text-white">{Number(request.amount_usdt).toFixed(2)} USDT</div>
                    <div className="text-xs text-esport-text-muted">
                      {(request.profiles as any)?.username || request.user_id} • {(request.profiles as any)?.email || ""}
                    </div>
                    <div className="text-xs text-esport-text-muted font-mono break-all">{request.destination_wallet_address}</div>
                    <div className="text-[10px] uppercase tracking-widest text-esport-text-muted">
                      {request.network} • {new Date(request.requested_at).toLocaleString()}
                    </div>
                    {request.note && <div className="text-xs text-esport-text-muted">User note: {request.note}</div>}
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleWithdrawalDecision(request.id, "approve")}
                      className="p-2 bg-esport-success/10 text-esport-success hover:bg-esport-success hover:text-white rounded-lg transition-all"
                      title="Approve withdrawal"
                    >
                      <CheckCircle2 size={16} />
                    </button>
                    <button
                      onClick={() => handleWithdrawalDecision(request.id, "reject")}
                      className="p-2 bg-esport-danger/10 text-esport-danger hover:bg-esport-danger hover:text-white rounded-lg transition-all"
                      title="Reject withdrawal"
                    >
                      <X size={16} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {isSupabaseConfigured() && (
        <div className="esport-card overflow-hidden">
          <div className="p-6 border-b border-esport-border flex items-center justify-between gap-4">
            <div>
              <h4 className="text-sm font-bold uppercase tracking-widest text-white">USDT Payout Queue</h4>
              <p className="text-xs text-esport-text-muted mt-1">Move approved withdrawals through broadcast, confirmation, or failure handling.</p>
            </div>
            <span className="badge badge-accent">{activePayoutJobs.length} active</span>
          </div>
          {activePayoutJobs.length === 0 ? (
            <div className="p-12 text-center text-esport-text-muted text-sm">No active payout jobs.</div>
          ) : (
            <div className="divide-y divide-esport-border">
              {activePayoutJobs.map((job) => (
                <div key={job.id} className="p-6 flex flex-col lg:flex-row lg:items-center gap-4">
                  <div className="flex-1 min-w-0 space-y-1">
                    <div className="flex items-center gap-3">
                      <div className="font-bold text-white">{job.amountUsdt.toFixed(2)} USDT</div>
                      <span className={cn("badge", job.status === "broadcasted" ? "badge-secondary" : "badge-accent")}>
                        {job.status}
                      </span>
                    </div>
                    <div className="text-xs text-esport-text-muted">
                      {job.username || job.userId}{job.email ? ` | ${job.email}` : ""}
                    </div>
                    <div className="text-xs text-esport-text-muted font-mono break-all">{job.destinationWalletAddress}</div>
                    <div className="text-[10px] uppercase tracking-widest text-esport-text-muted">
                      {job.network} | Queued {new Date(job.queuedAt).toLocaleString()}
                    </div>
                    {job.txid && <div className="text-xs text-esport-text-muted font-mono break-all">TXID: {job.txid}</div>}
                    {job.failureReason && <div className="text-xs text-esport-danger">Failure: {job.failureReason}</div>}
                    {job.adminNote && <div className="text-xs text-esport-text-muted">Treasury note: {job.adminNote}</div>}
                  </div>
                  <div className="flex gap-2">
                    {job.status === "queued" && (
                      <button
                        onClick={() => handlePayoutStatusUpdate(job.id, "broadcast")}
                        className="p-2 bg-esport-accent/10 text-esport-accent hover:bg-esport-accent hover:text-esport-bg rounded-lg transition-all"
                        title="Mark payout as broadcasted"
                      >
                        <Activity size={16} />
                      </button>
                    )}
                    {(job.status === "queued" || job.status === "broadcasted") && (
                      <>
                        <button
                          onClick={() => handlePayoutStatusUpdate(job.id, "confirm")}
                          className="p-2 bg-esport-success/10 text-esport-success hover:bg-esport-success hover:text-white rounded-lg transition-all"
                          title="Confirm payout"
                        >
                          <CheckCircle2 size={16} />
                        </button>
                        <button
                          onClick={() => handlePayoutStatusUpdate(job.id, "fail")}
                          className="p-2 bg-esport-danger/10 text-esport-danger hover:bg-esport-danger hover:text-white rounded-lg transition-all"
                          title="Mark payout as failed"
                        >
                          <X size={16} />
                        </button>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="esport-card overflow-hidden">
        <div className="p-6 border-b border-esport-border flex flex-col md:flex-row gap-4 justify-between items-center">
          <div className="relative w-full md:w-96">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-esport-text-muted" size={18} />
            <input 
              type="text" 
              placeholder="Search by username or email..." 
              className="w-full bg-white/5 border border-esport-border rounded-xl pl-12 pr-4 py-2.5 text-sm focus:outline-none focus:border-esport-accent/50 transition-all"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <div className="flex gap-2 w-full md:w-auto overflow-x-auto pb-2 md:pb-0">
            {['all', 'pending', 'verified', 'rejected', 'none'].map(status => (
              <button 
                key={status}
                onClick={() => setFilterStatus(status)}
                className={cn(
                  "px-4 py-2 rounded-lg text-[10px] font-bold uppercase tracking-widest transition-all border",
                  filterStatus === status 
                    ? "bg-esport-accent text-esport-bg border-esport-accent" 
                    : "bg-white/5 text-esport-text-muted border-esport-border hover:border-white/30"
                )}
              >
                {status}
              </button>
            ))}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-esport-border text-[10px] font-bold uppercase tracking-widest text-esport-text-muted">
                <th className="p-6">User</th>
                <th className="p-6">Role</th>
                <th className="p-6">USDT</th>
                <th className="p-6">KYC Status</th>
                <th className="p-6 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-esport-border">
              {loading ? (
                <tr><td colSpan={5} className="p-12 text-center text-esport-text-muted">Loading user data...</td></tr>
              ) : filteredUsers.length === 0 ? (
                <tr><td colSpan={5} className="p-12 text-center text-esport-text-muted">No users found matching your criteria.</td></tr>
              ) : (
                filteredUsers.map(user => (
                  <tr key={user.id} className="hover:bg-white/5 transition-colors group">
                    <td className="p-6">
                      <div className="flex items-center gap-3">
                        <div className="relative">
                          <img src={`https://ui-avatars.com/api/?name=${user.username}&background=random`} className="w-10 h-10 rounded-xl border border-white/10" />
                          {user.role === 'admin' && <div className="absolute -top-1 -right-1 w-4 h-4 bg-esport-secondary rounded-full flex items-center justify-center ring-2 ring-esport-bg"><Shield size={8} className="text-white" /></div>}
                        </div>
                        <div>
                          <div className="font-bold text-sm text-white">{user.username}</div>
                          <div className="text-xs text-esport-text-muted">{user.email}</div>
                        </div>
                      </div>
                    </td>
                    <td className="p-6">
                      <span className={cn(
                        "badge",
                        user.role === 'admin' ? "badge-secondary" : "bg-white/10 text-white"
                      )}>
                        {user.role}
                      </span>
                    </td>
                    <td className="p-6">
                      <div className="flex items-center gap-2 font-mono font-bold text-esport-accent">
                        <Star size={14} />
                        {user.stats?.credits?.toLocaleString() || 0}
                      </div>
                    </td>
                    <td className="p-6">
                      <div className="flex items-center gap-2">
                        <span className={cn(
                          "badge",
                          user.kycStatus === 'verified' ? 'badge-success' : 
                          user.kycStatus === 'pending' ? 'badge-accent' : 
                          user.kycStatus === 'rejected' ? 'badge-danger' : 
                          'bg-white/10 text-white'
                        )}>
                          {user.kycStatus || 'none'}
                        </span>
                        {user.kycDocuments && (
                          <div className="text-esport-accent" title="Documents Uploaded">
                            <FileText size={14} />
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="p-6 text-right">
                      <div className="flex justify-end gap-2">
                        {user.kycStatus === 'pending' && (
                          <>
                            <button 
                              onClick={() => handleKYC(user.id, "approve")} 
                              className="p-2 bg-esport-success/10 text-esport-success hover:bg-esport-success hover:text-white rounded-lg transition-all"
                              title="Approve KYC"
                            >
                              <CheckCircle2 size={16} />
                            </button>
                            <button 
                              onClick={() => setRejectingUser(user)} 
                              className="p-2 bg-esport-danger/10 text-esport-danger hover:bg-esport-danger hover:text-white rounded-lg transition-all"
                              title="Reject KYC"
                            >
                              <X size={16} />
                            </button>
                          </>
                        )}
                        <button 
                          onClick={() => setEditingUser(user)}
                          className="p-2 bg-white/5 text-esport-text-muted hover:text-white rounded-lg transition-all"
                          title="Manage User"
                        >
                          <Settings size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modals */}
      {rejectingUser && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <motion.div 
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="esport-card max-w-md w-full p-8 space-y-6"
          >
            <div className="flex justify-between items-center">
              <h3 className="text-xl font-display font-bold uppercase">Reject KYC</h3>
              <button onClick={() => setRejectingUser(null)}><X size={20} /></button>
            </div>
            <p className="text-sm text-esport-text-muted">Rejecting KYC for <span className="text-white font-bold">{rejectingUser.username}</span>. Please provide a reason.</p>
            <textarea 
              className="w-full bg-white/5 border border-esport-border rounded-xl p-4 text-sm focus:outline-none focus:border-esport-danger/50 min-h-[120px]"
              placeholder="e.g. ID photo is blurry, document expired..."
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
            />
            <div className="flex gap-4">
              <button onClick={() => setRejectingUser(null)} className="esport-btn-secondary flex-1">Cancel</button>
              <button 
                onClick={() => handleKYC(rejectingUser.id, "reject")} 
                disabled={!rejectReason}
                className="esport-btn-danger flex-1"
              >
                Confirm Rejection
              </button>
            </div>
          </motion.div>
        </div>
      )}

      {editingUser && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <motion.div 
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="esport-card max-w-lg w-full p-8 space-y-8"
          >
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-4">
                <img src={`https://ui-avatars.com/api/?name=${editingUser.username}&background=random`} className="w-12 h-12 rounded-xl" />
                <div>
                  <h3 className="text-xl font-display font-bold uppercase">Manage User</h3>
                  <p className="text-xs text-esport-text-muted">{editingUser.email}</p>
                </div>
              </div>
              <button onClick={() => setEditingUser(null)}><X size={20} /></button>
            </div>

            <div className="grid grid-cols-2 gap-6">
              <div className="space-y-2">
                <label className="text-[10px] font-bold text-esport-text-muted uppercase tracking-widest">Role</label>
                <select 
                  className="w-full bg-white/5 border border-esport-border rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-esport-accent/50"
                  value={editingUser.role}
                  onChange={(e) => updateUserField(editingUser.id, "role", e.target.value)}
                >
                  <option value="user">User</option>
                  <option value="admin">Admin</option>
                </select>
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-bold text-esport-text-muted uppercase tracking-widest">KYC Status</label>
                <select 
                  className="w-full bg-white/5 border border-esport-border rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-esport-accent/50"
                  value={editingUser.kycStatus}
                  onChange={(e) => updateUserField(editingUser.id, "kycStatus", e.target.value)}
                >
                  <option value="none">None</option>
                  <option value="pending">Pending</option>
                  <option value="verified">Verified</option>
                  <option value="rejected">Rejected</option>
                </select>
              </div>
            </div>

            {editingUser.kycDetails && (
              <div className="p-4 bg-white/5 rounded-xl space-y-3">
                <label className="text-[10px] font-bold text-esport-text-muted uppercase tracking-widest">Personal Details</label>
                <div className="grid grid-cols-2 gap-4 text-xs">
                  <div>
                    <div className="text-esport-text-muted uppercase text-[8px] font-bold">Name</div>
                    <div className="text-white">{editingUser.kycDetails.firstName} {editingUser.kycDetails.lastName}</div>
                  </div>
                  <div>
                    <div className="text-esport-text-muted uppercase text-[8px] font-bold">Phone</div>
                    <div className="text-white">{editingUser.kycDetails.phone}</div>
                  </div>
                  <div className="col-span-2">
                    <div className="text-esport-text-muted uppercase text-[8px] font-bold">Address</div>
                    <div className="text-white">{editingUser.kycDetails.address}</div>
                  </div>
                </div>
              </div>
            )}

            <div className="space-y-4">
              <label className="text-[10px] font-bold text-esport-text-muted uppercase tracking-widest">KYC Documents</label>
              {editingUser.kycDocuments ? (
                <div className="grid grid-cols-3 gap-2">
                  {Object.entries(editingUser.kycDocuments).map(([key, url]: [string, any]) => (
                    <div key={key} className="space-y-1">
                      <div className="text-[8px] uppercase font-bold text-esport-text-muted">{key}</div>
                      <div 
                        className="aspect-square bg-black/40 rounded-lg border border-esport-border overflow-hidden cursor-pointer hover:border-esport-accent transition-all"
                        onClick={() => window.open(url, '_blank')}
                      >
                        <img src={url} className="w-full h-full object-cover" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="p-4 bg-white/5 rounded-xl text-center text-xs text-esport-text-muted italic">
                  No documents uploaded.
                </div>
              )}
            </div>

            {editingUser.kycStatus === 'rejected' && (
              <div className="space-y-2">
                <label className="text-[10px] font-bold text-esport-danger uppercase tracking-widest">Rejection Reason</label>
                <textarea 
                  className="w-full bg-esport-danger/5 border border-esport-danger/30 rounded-xl px-4 py-2.5 text-xs text-white focus:outline-none focus:border-esport-danger/50 min-h-[80px]"
                  placeholder="Enter reason for rejection..."
                  value={editingUser.kycMessage || ""}
                  onChange={(e) => updateUserField(editingUser.id, "kycMessage", e.target.value)}
                />
              </div>
            )}

            <div className="space-y-4">
              <label className="text-[10px] font-bold text-esport-text-muted uppercase tracking-widest">Quick Actions</label>
              <div className="grid grid-cols-2 gap-4">
                <button 
                  onClick={() => {
                    const amount = prompt("Enter USDT to add:");
                    if (amount) {
                      const newCredits = (editingUser.stats?.credits || 0) + parseInt(amount);
                      updateUserField(editingUser.id, "stats", { ...editingUser.stats, credits: newCredits });
                    }
                  }}
                  className="flex items-center justify-center gap-2 p-4 bg-esport-accent/10 border border-esport-accent/20 rounded-xl text-esport-accent font-bold text-xs hover:bg-esport-accent hover:text-esport-bg transition-all"
                >
                  <Star size={16} /> Add USDT
                </button>
                <button 
                  onClick={() => {
                    if (confirm("Are you sure you want to reset this user's stats?")) {
                      updateUserField(editingUser.id, "stats", {
                        credits: 0,
                        level: 1,
                        rank: "Bronze I",
                        winRate: "0%",
                        kdRatio: 0,
                        headshotPct: "0%"
                      });
                    }
                  }}
                  className="flex items-center justify-center gap-2 p-4 bg-esport-danger/10 border border-esport-danger/20 rounded-xl text-esport-danger font-bold text-xs hover:bg-esport-danger hover:text-white transition-all"
                >
                  <ShieldAlert size={16} /> Reset Stats
                </button>
              </div>
            </div>

            <button onClick={() => setEditingUser(null)} className="esport-btn-primary w-full">Done</button>
          </motion.div>
        </div>
      )}
    </div>
  );
}
