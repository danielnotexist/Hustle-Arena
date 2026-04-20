import { motion } from "motion/react";
import {
  Activity,
  AlertCircle,
  Bell,
  CheckCircle2,
  ChevronRight,
  Clock,
  Copy,
  Crown,
  Filter,
  Gamepad2,
  Info,
  LayoutDashboard,
  Lock,
  Map,
  MapPin,
  MessageSquare,
  MoreVertical,
  PlayCircle,
  Plus,
  Search,
  Server,
  Settings,
  Shield,
  ShieldAlert,
  Star,
  Sword,
  Target,
  Trophy,
  Users,
  Wallet,
  X,
  Zap,
} from "lucide-react";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { COUNTRY_OPTIONS, normalizeSelectableCountry } from "../lib/countries";
import { isSupabaseConfigured } from "../lib/env";
import {
  addProfileComment,
  deleteProfileComment,
  fetchProfileComments,
  fetchPublicProfileBasics,
  findPublicProfileByUsername,
  type ProfileComment,
  respondFriendRequest as respondFriendRequestRpc,
  sendFriendRequest as sendFriendRequestRpc,
} from "../lib/supabase/social";
import { fetchUserMatchHistory, joinMatchmakingLobby, type UserMatchHistoryItem } from "../lib/supabase/matchmaking";
import { updateProfileBasics } from "../lib/supabase/profile";
import { supabase } from "../lib/supabase";
import { playChatMessageSound } from "../lib/sound";
import { db, doc, setDoc } from "../firebase";
import { cn } from "./shared-ui";
import type { AccountMode, Mission, UserStats, WalletSnapshot } from "./types";
import { DynamicImage, KYCForm } from "./landing-auth";
import { CustomLobbyView } from "./battlefield-view";

function formatCommentTimestamp(value: string) {
  const deltaMs = Date.now() - new Date(value).getTime();
  const minutes = Math.max(1, Math.floor(deltaMs / 60000));

  if (minutes < 60) {
    return `${minutes}m ago`;
  }

  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return `${hours}h ago`;
  }

  const days = Math.floor(hours / 24);
  if (days < 30) {
    return `${days}d ago`;
  }

  return new Date(value).toLocaleDateString();
}

function formatMatchHistoryTimestamp(value?: string | null) {
  if (!value) {
    return "Recently";
  }

  const deltaMs = Date.now() - new Date(value).getTime();
  const hours = Math.max(1, Math.floor(deltaMs / 3600000));
  if (hours < 24) {
    return `${hours}h ago`;
  }

  const days = Math.floor(hours / 24);
  if (days < 30) {
    return `${days}d ago`;
  }

  return new Date(value).toLocaleDateString();
}

function MatchHistorySection({
  profileUserId,
  accountMode,
  emptyLabel,
}: {
  profileUserId: string;
  accountMode: AccountMode;
  emptyLabel: string;
}) {
  const [matches, setMatches] = useState<UserMatchHistoryItem[]>([]);
  const [loadingMatches, setLoadingMatches] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const loadMatches = async () => {
      setLoadingMatches(true);
      try {
        const rows = await fetchUserMatchHistory(profileUserId, accountMode, 8);
        if (!cancelled) {
          setMatches(rows);
        }
      } catch (error) {
        console.error("Failed to load profile match history:", error);
        if (!cancelled) {
          setMatches([]);
        }
      } finally {
        if (!cancelled) {
          setLoadingMatches(false);
        }
      }
    };

    void loadMatches();
    return () => {
      cancelled = true;
    };
  }, [profileUserId, accountMode]);

  if (loadingMatches) {
    return (
      <div className="bg-white/5 border border-esport-border rounded-xl p-8 text-center text-sm text-esport-text-muted">
        Loading match history...
      </div>
    );
  }

  if (matches.length === 0) {
    return (
      <div className="bg-white/5 border border-esport-border rounded-xl p-8 text-center text-sm text-esport-text-muted">
        {emptyLabel}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {matches.map((match) => (
        <div key={match.id} className="flex items-center justify-between p-4 bg-white/5 border border-esport-border rounded-lg hover:border-esport-accent/50 transition-colors">
          <div className="flex items-center gap-4">
            <div className={`w-12 h-12 rounded flex items-center justify-center font-bold ${match.isWinner ? 'bg-esport-success/20 text-esport-success' : 'bg-esport-danger/20 text-esport-danger'}`}>
              {match.isWinner ? 'WIN' : 'LOSS'}
            </div>
            <div>
              <div className="font-bold text-white">{match.name}</div>
              <div className="text-xs text-esport-text-muted">
                {String(match.gameMode).toUpperCase()} · {match.selectedMap} · {formatMatchHistoryTimestamp(match.endedAt || match.startedAt)}
              </div>
            </div>
          </div>
          <div className="text-right">
            <div className="font-bold text-white">{match.winningScore} - {match.losingScore}</div>
            <div className={`text-xs font-bold ${match.payoutAmount >= 0 ? "text-esport-success" : "text-esport-danger"}`}>
              {match.payoutAmount >= 0 ? "+" : ""}{match.payoutAmount.toFixed(2)} USDT
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function ProfileCommentsSection({
  profileUserId,
  currentUser,
  addToast,
  allowPosting,
  onOpenPublicProfile,
}: {
  profileUserId: string;
  currentUser?: { id?: string; username?: string; avatarUrl?: string | null } | null;
  addToast: (message: string, type?: "success" | "error" | "info") => void;
  allowPosting: boolean;
  onOpenPublicProfile?: (userId: string) => void | Promise<void>;
}) {
  const [comments, setComments] = useState<ProfileComment[]>([]);
  const [loadingComments, setLoadingComments] = useState(true);
  const [commentDraft, setCommentDraft] = useState("");
  const [submittingComment, setSubmittingComment] = useState(false);
  const [deletingCommentId, setDeletingCommentId] = useState<number | null>(null);

  const loadComments = async () => {
    setLoadingComments(true);
    try {
      const rows = await fetchProfileComments(profileUserId, 50);
      setComments(rows);
    } catch (error) {
      console.error("Failed to load profile comments:", error);
      addToast("Failed to load profile comments.", "error");
    } finally {
      setLoadingComments(false);
    }
  };

  useEffect(() => {
    void loadComments();
  }, [profileUserId]);

  const handleSubmitComment = async () => {
    const body = commentDraft.trim();
    if (!body) {
      addToast("Comment cannot be empty.", "error");
      return;
    }

    setSubmittingComment(true);
    try {
      await addProfileComment(profileUserId, body);
      setCommentDraft("");
      await loadComments();
      addToast("Comment posted.", "success");
    } catch (error: any) {
      console.error("Failed to post profile comment:", error);
      addToast(error?.message || "Failed to post comment.", "error");
    } finally {
      setSubmittingComment(false);
    }
  };

  const handleDeleteComment = async (commentId: number) => {
    setDeletingCommentId(commentId);
    try {
      await deleteProfileComment(commentId);
      setComments((current) => current.filter((comment) => comment.id !== commentId));
      addToast("Comment removed.", "success");
    } catch (error: any) {
      console.error("Failed to delete profile comment:", error);
      addToast(error?.message || "Failed to remove comment.", "error");
    } finally {
      setDeletingCommentId(null);
    }
  };

  return (
    <div>
      <div className="mb-4 flex items-center justify-between gap-3">
        <h3 className="font-display font-bold uppercase tracking-wider text-white">Comments</h3>
        <div className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.2em] text-esport-text-muted">
          {comments.length} total
        </div>
      </div>

      {allowPosting && (
        <div className="mb-5 rounded-xl border border-esport-border bg-white/5 p-4">
          <div className="flex items-start gap-3">
            <img
              src={currentUser?.avatarUrl || `https://ui-avatars.com/api/?name=${encodeURIComponent(currentUser?.username || "Player")}&background=1f2937&color=ffffff&size=96`}
              alt={currentUser?.username || "You"}
              className="h-11 w-11 rounded-2xl border border-white/15 object-cover"
            />
            <div className="flex-1 space-y-3">
              <textarea
                value={commentDraft}
                onChange={(event) => setCommentDraft(event.target.value.slice(0, 500))}
                placeholder="Leave a public comment on this profile..."
                className="min-h-[110px] w-full rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white outline-none transition-colors placeholder:text-esport-text-muted focus:border-esport-accent/50"
              />
              <div className="flex items-center justify-between gap-3">
                <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-esport-text-muted">
                  {commentDraft.trim().length}/500
                </div>
                <button
                  type="button"
                  onClick={() => void handleSubmitComment()}
                  disabled={submittingComment || !commentDraft.trim()}
                  className="esport-btn-primary px-5 py-2.5 text-xs disabled:opacity-50"
                >
                  {submittingComment ? "Posting..." : "Post Comment"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="space-y-3">
        {loadingComments ? (
          <div className="rounded-xl border border-esport-border bg-white/5 p-8 text-center text-sm text-esport-text-muted">
            Loading comments...
          </div>
        ) : comments.length === 0 ? (
          <div className="rounded-xl border border-esport-border bg-white/5 p-8 text-center">
            <MessageSquare className="mx-auto mb-3 h-12 w-12 text-esport-text-muted opacity-50" />
            <div className="font-bold mb-1">No comments yet</div>
            <div className="text-sm text-esport-text-muted">
              {allowPosting ? "Be the first to leave a comment on this profile." : "No one has left a comment on your profile yet."}
            </div>
          </div>
        ) : (
          comments.map((comment) => {
            const canDelete =
              currentUser?.id === comment.author_user_id || currentUser?.id === profileUserId;
            const authorName =
              comment.author_username?.trim() || `Player ${comment.author_user_id.slice(0, 8)}`;
            const authorAvatar =
              comment.author_avatar_url ||
              `https://ui-avatars.com/api/?name=${encodeURIComponent(authorName)}&background=1f2937&color=ffffff&size=96`;

            return (
              <div key={comment.id} className="rounded-xl border border-esport-border bg-white/5 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-start gap-3">
                    <img
                      src={authorAvatar}
                      alt={authorName}
                      className="h-11 w-11 rounded-2xl border border-white/15 object-cover"
                    />
                    <div className="min-w-0">
                      <button
                        type="button"
                        disabled={!onOpenPublicProfile}
                        onClick={() => onOpenPublicProfile?.(comment.author_user_id)}
                        className="text-left text-sm font-bold text-white transition-colors hover:text-esport-accent disabled:pointer-events-none"
                      >
                        {authorName}
                      </button>
                      <div className="mt-1 text-[10px] uppercase tracking-[0.18em] text-esport-text-muted">
                        {formatCommentTimestamp(comment.created_at)}
                      </div>
                    </div>
                  </div>
                  {canDelete && (
                    <button
                      type="button"
                      onClick={() => void handleDeleteComment(comment.id)}
                      disabled={deletingCommentId === comment.id}
                      className="rounded-lg border border-rose-300/25 bg-rose-400/10 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.18em] text-rose-200 transition-colors hover:border-rose-300/50 disabled:opacity-50"
                    >
                      {deletingCommentId === comment.id ? "Removing..." : "Delete"}
                    </button>
                  )}
                </div>
                <div className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-white/90">
                  {comment.body}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

export function UserProfileView({
  user,
  stats,
  wallet,
  accountMode,
  profileData,
  setProfileData,
  switchAccountMode,
  topUpDemoBalance,
  addToast,
  openModal,
  initialTab = "overview",
}: {
  user: any;
  stats: UserStats;
  wallet: WalletSnapshot;
  accountMode: AccountMode;
  profileData: any;
  setProfileData: any;
  switchAccountMode: (mode: AccountMode) => Promise<void>;
  topUpDemoBalance: (amount: number) => Promise<void>;
  addToast: any;
  openModal: any;
  initialTab?: "overview" | "matches" | "highlights" | "settings";
}) {
  const [activeTab, setActiveTab] = useState(initialTab);
  const [isEditing, setIsEditing] = useState(initialTab === "settings");
  const [editForm, setEditForm] = useState(profileData);
  const [demoTopUpAmount, setDemoTopUpAmount] = useState("");
  const [isSwitchingMode, setIsSwitchingMode] = useState(false);
  const [isSavingDemoBalance, setIsSavingDemoBalance] = useState(false);

  useEffect(() => {
    setEditForm({
      ...profileData,
      country: normalizeSelectableCountry(profileData.country),
    });
  }, [profileData]);

  useEffect(() => {
    setActiveTab(initialTab);
    setIsEditing(initialTab === "settings");
  }, [initialTab]);

  const readImageAsDataUrl = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = () => reject(new Error("Failed to read image file."));
      reader.readAsDataURL(file);
    });

  const downscaleImageDataUrl = async (
    sourceDataUrl: string,
    targetWidth: number,
    targetHeight: number,
    quality = 0.82
  ) => {
    const image = new Image();
    image.src = sourceDataUrl;
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error("Failed to process image."));
    });

    const canvas = document.createElement("canvas");
    canvas.width = targetWidth;
    canvas.height = targetHeight;

    const context = canvas.getContext("2d");
    if (!context) {
      throw new Error("Failed to prepare image canvas.");
    }

    const scale = Math.max(targetWidth / image.width, targetHeight / image.height);
    const scaledWidth = image.width * scale;
    const scaledHeight = image.height * scale;
    const dx = (targetWidth - scaledWidth) / 2;
    const dy = (targetHeight - scaledHeight) / 2;
    context.drawImage(image, dx, dy, scaledWidth, scaledHeight);
    return canvas.toDataURL("image/jpeg", quality);
  };

  const handleImageUpload = async (
    event: React.ChangeEvent<HTMLInputElement>,
    mode: "avatar" | "cover"
  ) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      addToast("Please upload an image file.", "error");
      return;
    }

    try {
      const rawDataUrl = await readImageAsDataUrl(file);
      const normalizedDataUrl =
        mode === "avatar"
          ? await downscaleImageDataUrl(rawDataUrl, 256, 256, 0.86)
          : await downscaleImageDataUrl(rawDataUrl, 1400, 520, 0.82);

      if (mode === "avatar") {
        setEditForm((current: any) => ({ ...current, avatarUrl: normalizedDataUrl }));
      } else {
        setEditForm((current: any) => ({ ...current, coverUrl: normalizedDataUrl }));
      }
      addToast(mode === "avatar" ? "Profile image selected." : "Cover image selected.", "success");
    } catch (error) {
      console.error("Image upload error:", error);
      addToast("Failed to process image.", "error");
    } finally {
      event.target.value = "";
    }
  };

  const handleSave = async () => {
    if (!user?.id) return;
    const normalizedProfile = {
      ...editForm,
      country: normalizeSelectableCountry(editForm.country),
    };

    try {
      if (isSupabaseConfigured()) {
        await updateProfileBasics(user.id, normalizedProfile);
      } else {
        await setDoc(doc(db, "users", user.id), {
          ...normalizedProfile
        }, { merge: true });
      }
      setProfileData(normalizedProfile);
      setEditForm(normalizedProfile);
      setIsEditing(false);
      addToast("Profile updated successfully!", "success");
    } catch (error) {
      console.error("Error updating profile:", error);
      addToast("Failed to update profile", "error");
    }
  };

  const handleSwitchMode = async () => {
    const nextMode: AccountMode = accountMode === "live" ? "demo" : "live";
    setIsSwitchingMode(true);
    try {
      await switchAccountMode(nextMode);
      addToast(nextMode === "demo" ? "Switched to Demo Account." : "Switched to Live Account.", "success");
    } catch (error) {
      console.error("Error switching account mode:", error);
      addToast("Failed to switch account mode.", "error");
    } finally {
      setIsSwitchingMode(false);
    }
  };

  const handleTopUpDemoBalance = async () => {
    const amount = Number(demoTopUpAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      addToast("Enter a valid top-up amount greater than zero.", "error");
      return;
    }

    setIsSavingDemoBalance(true);
    try {
      await topUpDemoBalance(amount);
      setDemoTopUpAmount("");
      addToast(`Added ${amount.toFixed(2)} USDT to demo balance.`, "success");
    } catch (error) {
      console.error("Error updating demo balance:", error);
      addToast("Failed to update demo balance.", "error");
    } finally {
      setIsSavingDemoBalance(false);
    }
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6 pb-12">
      {/* Banner */}
      <div className="relative h-64 md:h-80 rounded-2xl overflow-hidden bg-esport-card border border-esport-border group">
        {profileData.coverUrl ? (
          <img
            src={profileData.coverUrl}
            alt="Profile cover"
            className="w-full h-full object-cover opacity-70 group-hover:opacity-85 transition-opacity"
          />
        ) : (
          <DynamicImage prompt="abstract dark blue neon cyberpunk landscape" className="w-full h-full object-cover opacity-60 group-hover:opacity-80 transition-opacity" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-[#0a0b0d] via-[#0a0b0d]/60 to-transparent" />
        
        <div className="absolute bottom-0 left-0 w-full p-6 md:p-10 flex flex-col md:flex-row items-end gap-6">
          <div className="relative">
            <img src={profileData.avatarUrl || `https://ui-avatars.com/api/?name=${user?.username || 'Player'}&background=random&size=128`} className="w-24 h-24 md:w-32 md:h-32 rounded-2xl border-4 border-[#0a0b0d] shadow-2xl object-cover" />
            <div className="absolute -bottom-2 -right-2 bg-esport-accent text-white text-xs font-bold px-2 py-1 rounded-lg border-2 border-[#0a0b0d]">
              LVL {stats?.level || 1}
            </div>
          </div>
          
          <div className="flex-1 pb-2">
            <h1 className="text-4xl md:text-5xl font-display font-bold tracking-tight mb-1">{user?.username || 'Player'}</h1>
            <div className="flex items-center gap-4 text-sm text-esport-text-muted font-bold uppercase tracking-wider">
              <span className="flex items-center gap-1"><MapPin size={14} /> {profileData.country}</span>
              <span className="flex items-center gap-1"><Clock size={14} /> Member since 2026</span>
            </div>
          </div>
          
          <div className="pb-2 w-full md:w-auto flex gap-3">
            <button onClick={() => { setActiveTab('settings'); setIsEditing(true); }} className="esport-btn-secondary flex-1 md:flex-none">
              <Settings size={16} /> Edit Profile
            </button>
          </div>
        </div>
      </div>

      {/* Grid Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Sidebar */}
        <div className="space-y-6">
          {/* KYC Status Card */}
          <div className="esport-card p-6 border-2 border-esport-accent/20">
            <h3 className="font-display font-bold uppercase tracking-wider mb-4 text-esport-text-muted text-sm">Identity Verification</h3>
            <div className="flex items-center justify-between mb-4">
              <span className="text-xs text-esport-text-muted uppercase font-bold">Status</span>
              <span className={cn(
                "badge text-[10px] font-bold uppercase tracking-widest",
                user?.kycStatus === 'verified' ? 'badge-success' : 
                user?.kycStatus === 'pending' ? 'badge-accent' : 
                user?.kycStatus === 'rejected' ? 'badge-danger' : 
                'bg-white/10 text-white'
              )}>
                {user?.kycStatus || 'none'}
              </span>
            </div>
            {user?.kycStatus !== 'verified' && (
              <button 
                onClick={() => openModal("KYC Verification", <KYCForm addToast={addToast} user={user} />)}
                className="esport-btn-primary w-full py-3 text-[10px] uppercase tracking-[0.2em]"
              >
                {user?.kycStatus === 'rejected' ? 'Re-verify Identity' : 'Verify Identity'}
              </button>
            )}
            {accountMode === "demo" && user?.kycStatus !== "verified" && (
              <p className="text-xs text-esport-text-muted mt-3">
                Demo mode stays playable without KYC. Verification is only required before switching into live-stakes play.
              </p>
            )}
          </div>

          <div className={`esport-card p-6 border-2 ${accountMode === "demo" ? "border-esport-secondary/30" : "border-esport-success/20"}`}>
            <div className="flex items-center justify-between mb-4 gap-3">
              <h3 className="font-display font-bold uppercase tracking-wider text-esport-text-muted text-sm">Account Mode</h3>
              <span className={cn(
                "badge text-[10px] font-bold uppercase tracking-widest",
                accountMode === "demo" ? "badge-secondary" : "badge-success"
              )}>
                {accountMode}
              </span>
            </div>

            {accountMode === "demo" ? (
              <div className="bg-white/5 rounded-xl border border-esport-border p-4 space-y-2">
                <div className="text-[10px] font-bold text-esport-text-muted uppercase tracking-widest">Account Demo Balance</div>
                <div className="text-2xl font-display font-bold text-esport-secondary">{wallet.demoBalance.toLocaleString()} USDT</div>
                <p className="text-xs text-esport-text-muted">Demo mode hides real funds and routes you into the isolated test environment.</p>
              </div>
            ) : (
              <div className="bg-white/5 rounded-xl border border-esport-border p-4 space-y-3">
                <div>
                  <div className="text-[10px] font-bold text-esport-text-muted uppercase tracking-widest">Live Available Balance</div>
                  <div className="text-2xl font-display font-bold text-esport-success">{wallet.availableBalance.toLocaleString()} USDT</div>
                </div>
                <div>
                  <div className="text-[10px] font-bold text-esport-text-muted uppercase tracking-widest">Locked Match Stakes</div>
                  <div className="text-sm font-bold text-white">{wallet.lockedBalance.toLocaleString()} USDT</div>
                </div>
              </div>
            )}

            <button
              onClick={handleSwitchMode}
              disabled={isSwitchingMode}
              className="esport-btn-primary w-full py-3 text-[10px] uppercase tracking-[0.2em] mt-4 disabled:opacity-50"
            >
              {isSwitchingMode
                ? "Switching..."
                : accountMode === "live"
                  ? "Switch to Demo Account"
                  : "Switch to Live Account"}
            </button>

            {accountMode === "demo" && (
              <div className="mt-4 pt-4 border-t border-esport-border space-y-3">
                <div className="text-[10px] font-bold text-esport-text-muted uppercase tracking-widest">Add Balance</div>
                <div className="flex gap-2">
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={demoTopUpAmount}
                    onChange={(e) => setDemoTopUpAmount(e.target.value)}
                      className="flex-1 bg-black/50 border border-esport-border rounded-lg px-3 py-2 text-sm text-white focus:border-esport-secondary outline-none transition-colors"
                      placeholder="Amount to add"
                    />
                  <button
                    onClick={handleTopUpDemoBalance}
                    disabled={isSavingDemoBalance}
                    className="esport-btn-secondary disabled:opacity-50"
                  >
                    {isSavingDemoBalance ? "Saving..." : "Apply"}
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Bio Card */}
          <div className="esport-card p-6">
            <h3 className="font-display font-bold uppercase tracking-wider mb-4 text-esport-text-muted text-sm">About Me</h3>
            <p className="text-sm leading-relaxed">{profileData.bio}</p>
            
            <div className="mt-6 pt-6 border-t border-esport-border space-y-3">
              <div className="flex items-center justify-between text-sm">
                <span className="text-esport-text-muted">Role</span>
                <span className="font-bold text-esport-accent capitalize">{user?.role || 'Player'}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-esport-text-muted">Status</span>
                <span className="font-bold text-esport-success flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-esport-success animate-pulse"/> Online</span>
              </div>
            </div>
          </div>

          {/* Quick Stats */}
          <div className="esport-card p-6">
            <div className="flex items-center justify-between gap-3 mb-4">
              <h3 className="font-display font-bold uppercase tracking-wider text-esport-text-muted text-sm">
                {accountMode === "demo" ? "Demo Combat Record" : "Live Combat Record"}
              </h3>
              <span className={cn("badge text-[10px] font-bold uppercase tracking-widest", accountMode === "demo" ? "badge-secondary" : "badge-success")}>
                {accountMode}
              </span>
            </div>
            <p className="text-xs text-esport-text-muted mb-4">
              {accountMode === "demo"
                ? "Demo progression and performance are displayed separately from your live account."
                : "These stats represent your live account progression and stake-enabled competitive record."}
            </p>
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-white/5 rounded-lg p-3 text-center">
                <div className="text-2xl font-bold text-esport-accent">{stats?.winRate || "0%"}</div>
                <div className="text-[10px] text-esport-text-muted uppercase tracking-wider">Win Rate</div>
              </div>
              <div className="bg-white/5 rounded-lg p-3 text-center">
                <div className="text-2xl font-bold text-white">{stats?.kdRatio || "0.00"}</div>
                <div className="text-[10px] text-esport-text-muted uppercase tracking-wider">K/D Ratio</div>
              </div>
              <div className="bg-white/5 rounded-lg p-3 text-center col-span-2">
                <div className="text-xl font-bold text-white">{stats?.rank || "Unranked"}</div>
                <div className="text-[10px] text-esport-text-muted uppercase tracking-wider">Current Rank</div>
              </div>
            </div>
          </div>
        </div>

        {/* Main Content Area */}
        <div className="lg:col-span-2 space-y-6">
          {/* Custom Tabs */}
          <div className="flex overflow-x-auto custom-scrollbar gap-2 p-1 bg-esport-card border border-esport-border rounded-xl">
            {['overview', 'matches', 'highlights', 'settings'].map(tab => (
              <button
                key={tab}
                onClick={() => { setActiveTab(tab); if(tab !== 'settings') setIsEditing(false); }}
                className={`flex-1 py-2.5 px-4 rounded-lg text-sm font-bold uppercase tracking-wider transition-all whitespace-nowrap ${activeTab === tab ? 'bg-esport-accent text-white shadow-lg' : 'text-esport-text-muted hover:text-white hover:bg-white/5'}`}
              >
                {tab}
              </button>
            ))}
          </div>

          {/* Tab Content */}
          <div className="esport-card p-6 min-h-[400px]">
            {activeTab === 'overview' && (
              <div className="space-y-8">
                <div>
                  <h3 className="font-display font-bold uppercase tracking-wider mb-4 text-white">Recent Performance</h3>
                  <div className="h-32 flex items-end gap-2">
                    {(stats?.performance || [0, 0, 0, 0, 0, 0, 0, 0, 0, 0]).map((h: number, i: number) => (
                      <div key={i} className="flex-1 bg-esport-accent/20 rounded-t-sm hover:bg-esport-accent transition-colors relative group" style={{ height: `${h || 2}%` }}>
                        <div className="absolute -top-8 left-1/2 -translate-x-1/2 bg-black text-white text-xs py-1 px-2 rounded opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                          {h}pts
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
                
                <div>
                  <ProfileCommentsSection
                    profileUserId={user?.id}
                    currentUser={user}
                    addToast={addToast}
                    allowPosting={false}
                  />
                </div>
              </div>
            )}

            {activeTab === 'matches' && (
              <div>
                <h3 className="font-display font-bold uppercase tracking-wider mb-4 text-white">Match History</h3>
                <MatchHistorySection
                  profileUserId={user?.id}
                  accountMode={accountMode}
                  emptyLabel="No completed matches yet."
                />
                {false && (
                <div className="space-y-3">
                  {[1, 2, 3, 4, 5].map(i => (
                    <div key={i} className="flex items-center justify-between p-4 bg-white/5 border border-esport-border rounded-lg hover:border-esport-accent/50 transition-colors cursor-pointer">
                      <div className="flex items-center gap-4">
                        <div className={`w-12 h-12 rounded flex items-center justify-center font-bold ${i % 2 === 0 ? 'bg-esport-danger/20 text-esport-danger' : 'bg-esport-success/20 text-esport-success'}`}>
                          {i % 2 === 0 ? 'DEFEAT' : 'VICTORY'}
                        </div>
                        <div>
                          <div className="font-bold">Ranked 5v5 • Cyberia</div>
                          <div className="text-xs text-esport-text-muted">{i} days ago</div>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="font-bold text-white">16 - {10 + i}</div>
                        <div className="text-xs text-esport-accent">+{25 - i} ELO</div>
                      </div>
                    </div>
                  ))}
                </div>
                )}
              </div>
            )}

            {activeTab === 'settings' && (
              <div className="max-w-xl">
                <h3 className="font-display font-bold uppercase tracking-wider mb-6 text-white">Edit Profile</h3>
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-bold text-esport-text-muted uppercase tracking-wider mb-2">Bio</label>
                    <textarea 
                      value={editForm.bio}
                      onChange={(e) => setEditForm({...editForm, bio: e.target.value})}
                      className="w-full bg-black/50 border border-esport-border rounded-lg p-3 text-white focus:border-esport-accent outline-none transition-colors min-h-[100px]"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-esport-text-muted uppercase tracking-wider mb-2">Country</label>
                    <select
                      value={editForm.country}
                      onChange={(e) => setEditForm({...editForm, country: e.target.value})}
                      className="w-full bg-black/50 border border-esport-border rounded-lg p-3 text-white focus:border-esport-accent outline-none transition-colors"
                    >
                      {COUNTRY_OPTIONS.map((country) => (
                        <option key={country} value={country} className="bg-esport-panel text-white">
                          {country}
                        </option>
                      ))}
                    </select>
                    <p className="mt-2 text-xs text-esport-text-muted">
                      Choose your country from the supported list.
                    </p>
                  </div>
                    <div>
                      <label className="block text-xs font-bold text-esport-text-muted uppercase tracking-wider mb-2">Avatar URL</label>
                      <input
                        type="text"
                        value={editForm.avatarUrl || ""}
                        onChange={(e) => setEditForm({ ...editForm, avatarUrl: e.target.value })}
                        placeholder="https://..."
                        className="w-full bg-black/50 border border-esport-border rounded-lg p-3 text-white focus:border-esport-accent outline-none transition-colors"
                      />
                      <div className="mt-2 flex items-center gap-3">
                        <label className="esport-btn-secondary cursor-pointer text-xs px-3 py-2">
                          Upload Profile Image
                          <input
                            type="file"
                            accept="image/*"
                            onChange={(event) => void handleImageUpload(event, "avatar")}
                            className="hidden"
                          />
                        </label>
                        {editForm.avatarUrl ? (
                          <img
                            src={editForm.avatarUrl}
                            alt="Avatar preview"
                            className="w-10 h-10 rounded-full border border-esport-border object-cover"
                          />
                        ) : null}
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-esport-text-muted uppercase tracking-wider mb-2">Cover Image URL</label>
                      <input
                        type="text"
                        value={editForm.coverUrl || ""}
                        onChange={(e) => setEditForm({ ...editForm, coverUrl: e.target.value })}
                        placeholder="https://..."
                        className="w-full bg-black/50 border border-esport-border rounded-lg p-3 text-white focus:border-esport-accent outline-none transition-colors"
                      />
                      <div className="mt-2 flex items-center gap-3">
                        <label className="esport-btn-secondary cursor-pointer text-xs px-3 py-2">
                          Upload Cover Image
                          <input
                            type="file"
                            accept="image/*"
                            onChange={(event) => void handleImageUpload(event, "cover")}
                            className="hidden"
                          />
                        </label>
                      </div>
                      {editForm.coverUrl ? (
                        <div className="mt-3 rounded-lg border border-esport-border overflow-hidden h-24">
                          <img
                            src={editForm.coverUrl}
                            alt="Cover preview"
                            className="w-full h-full object-cover"
                          />
                        </div>
                      ) : null}
                    </div>
                  <div className="pt-4 border-t border-esport-border flex gap-3">
                    <button onClick={handleSave} className="esport-btn-primary">Save Changes</button>
                    <button onClick={() => { setEditForm(profileData); setIsEditing(false); setActiveTab('overview'); }} className="esport-btn-secondary">Cancel</button>
                  </div>
                </div>
              </div>
            )}
            
            {activeTab === 'highlights' && (
              <div>
                 <h3 className="font-display font-bold uppercase tracking-wider mb-4 text-white">Video Highlights</h3>
                 <div className="grid grid-cols-2 gap-4">
                    <div className="relative aspect-video rounded-lg overflow-hidden border border-esport-border group cursor-pointer">
                       <DynamicImage prompt="esports highlight sniper shot" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                       <div className="absolute inset-0 bg-black/40 flex items-center justify-center group-hover:bg-black/20 transition-colors">
                          <PlayCircle className="w-12 h-12 text-white opacity-80 group-hover:opacity-100 group-hover:scale-110 transition-all" />
                       </div>
                       <div className="absolute bottom-2 left-2 text-xs font-bold bg-black/80 px-2 py-1 rounded">Clutch 1v3</div>
                    </div>
                    <div className="relative aspect-video rounded-lg overflow-hidden border border-esport-border group cursor-pointer">
                       <DynamicImage prompt="esports highlight team wipe" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                       <div className="absolute inset-0 bg-black/40 flex items-center justify-center group-hover:bg-black/20 transition-colors">
                          <PlayCircle className="w-12 h-12 text-white opacity-80 group-hover:opacity-100 group-hover:scale-110 transition-all" />
                       </div>
                       <div className="absolute bottom-2 left-2 text-xs font-bold bg-black/80 px-2 py-1 rounded">Ace Defense</div>
                    </div>
                 </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export function PublicProfileView({
  profile,
  displayName,
  avatarUrl,
  coverUrl,
  accountMode,
  currentUser,
  addToast,
  onOpenPublicProfile,
}: {
  profile: any;
  displayName: string;
  avatarUrl: string;
  coverUrl: string;
  accountMode: AccountMode;
  currentUser?: any;
  addToast: (message: string, type?: "success" | "error" | "info") => void;
  onOpenPublicProfile?: (userId: string) => void | Promise<void>;
}) {
  const [activeTab, setActiveTab] = useState<"overview" | "matches" | "highlights">("overview");

  return (
    <div className="max-w-6xl mx-auto space-y-6 pb-6">
      <div className="relative h-64 md:h-80 rounded-2xl overflow-hidden bg-esport-card border border-esport-border group">
        <img
          src={coverUrl}
          alt={`${displayName} cover`}
          className="w-full h-full object-cover opacity-70 group-hover:opacity-85 transition-opacity"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-[#0a0b0d] via-[#0a0b0d]/60 to-transparent" />

        <div className="absolute bottom-0 left-0 w-full p-6 md:p-10 flex flex-col md:flex-row items-end gap-6">
          <div className="relative">
            <img src={avatarUrl} alt={displayName} className="w-24 h-24 md:w-32 md:h-32 rounded-2xl border-4 border-[#0a0b0d] shadow-2xl object-cover" />
            <div className="absolute -bottom-2 -right-2 bg-esport-accent text-white text-xs font-bold px-2 py-1 rounded-lg border-2 border-[#0a0b0d]">
              LVL {profile.level ?? 1}
            </div>
          </div>

          <div className="flex-1 pb-2">
            <h1 className="text-4xl md:text-5xl font-display font-bold tracking-tight mb-1">{displayName}</h1>
            <div className="flex items-center gap-4 text-sm text-esport-text-muted font-bold uppercase tracking-wider">
              <span className="flex items-center gap-1"><MapPin size={14} /> {profile.country || "Unknown Region"}</span>
              <span className="flex items-center gap-1"><Clock size={14} /> Member since 2026</span>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="space-y-6">
          <div className="esport-card p-6 border-2 border-esport-accent/20">
            <h3 className="font-display font-bold uppercase tracking-wider mb-4 text-esport-text-muted text-sm">Public Rank Snapshot</h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-white/5 rounded-lg p-3 text-center">
                <div className="text-2xl font-bold text-esport-accent">{profile.win_rate || "0%"}</div>
                <div className="text-[10px] text-esport-text-muted uppercase tracking-wider">Win Rate</div>
              </div>
              <div className="bg-white/5 rounded-lg p-3 text-center">
                <div className="text-2xl font-bold text-white">{Number(profile.kd_ratio ?? 0).toFixed(2)}</div>
                <div className="text-[10px] text-esport-text-muted uppercase tracking-wider">K/D Ratio</div>
              </div>
              <div className="bg-white/5 rounded-lg p-3 text-center col-span-2">
                <div className="text-xl font-bold text-white">{profile.rank || "Unranked"}</div>
                <div className="text-[10px] text-esport-text-muted uppercase tracking-wider">Current Rank</div>
              </div>
            </div>
          </div>

          <div className="esport-card p-6">
            <h3 className="font-display font-bold uppercase tracking-wider mb-4 text-esport-text-muted text-sm">About Player</h3>
            <p className="text-sm leading-relaxed">{profile.bio || "No bio added yet."}</p>

            <div className="mt-6 pt-6 border-t border-esport-border space-y-3">
              <div className="flex items-center justify-between text-sm">
                <span className="text-esport-text-muted">Headshot Rate</span>
                <span className="font-bold text-white">{profile.headshot_pct || "0%"}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-esport-text-muted">Status</span>
                <span className="font-bold text-esport-success flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-esport-success animate-pulse" /> Public Profile</span>
              </div>
            </div>
          </div>
        </div>

        <div className="lg:col-span-2 space-y-6">
          <div className="flex overflow-x-auto custom-scrollbar gap-2 p-1 bg-esport-card border border-esport-border rounded-xl">
            {["overview", "matches", "highlights"].map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab as "overview" | "matches" | "highlights")}
                className={`flex-1 py-2.5 px-4 rounded-lg text-sm font-bold uppercase tracking-wider transition-all whitespace-nowrap ${activeTab === tab ? "bg-esport-accent text-white shadow-lg" : "text-esport-text-muted hover:text-white hover:bg-white/5"}`}
              >
                {tab}
              </button>
            ))}
          </div>

          <div className="esport-card p-6 min-h-[400px]">
            {activeTab === "overview" && (
              <div className="space-y-8">
                <div>
                  <h3 className="font-display font-bold uppercase tracking-wider mb-4 text-white">Recent Performance</h3>
                  <div className="h-32 flex items-end gap-2">
                    {(profile.performance || [0, 0, 0, 0, 0, 0, 0, 0, 0, 0]).map((h: number, i: number) => (
                      <div key={i} className="flex-1 bg-esport-accent/20 rounded-t-sm hover:bg-esport-accent transition-colors relative group" style={{ height: `${h || 2}%` }}>
                        <div className="absolute -top-8 left-1/2 -translate-x-1/2 bg-black text-white text-xs py-1 px-2 rounded opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                          {h}pts
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div>
                  <ProfileCommentsSection
                    profileUserId={profile.id}
                    currentUser={currentUser}
                    addToast={addToast}
                    allowPosting={!!currentUser?.id}
                    onOpenPublicProfile={onOpenPublicProfile}
                  />
                </div>
              </div>
            )}

            {activeTab === "matches" && (
              <div>
                <h3 className="font-display font-bold uppercase tracking-wider mb-4 text-white">Match History</h3>
                <MatchHistorySection
                  profileUserId={profile.id}
                  accountMode={accountMode}
                  emptyLabel="Public match history will appear here once matches are completed."
                />
              </div>
            )}

            {activeTab === "highlights" && (
              <div>
                <h3 className="font-display font-bold uppercase tracking-wider mb-4 text-white">Video Highlights</h3>
                <div className="bg-white/5 border border-esport-border rounded-xl p-8 text-center text-sm text-esport-text-muted">
                  Highlights are not available for this public profile yet.
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export function SocialView({ addToast, user, accountMode = 'demo', openModal, refreshSession, onOpenPublicProfile, refreshKey = 0, onlineUserIds = [], focusFriendId = null, onFocusFriendHandled }: any) {
  const [loading, setLoading] = useState(true);
  const [friendsList, setFriendsList] = useState<Array<{ id: string; username: string; avatarUrl: string | null; lastActiveAt: string | null }>>([]);
  const [pendingRequests, setPendingRequests] = useState<Array<{ id: number; requester_id: string; username: string }>>([]);
  const [pendingLobbyInvites, setPendingLobbyInvites] = useState<Array<{ id: number; lobby_id: string; lobby_name: string; from_user_id: string; from_username: string; password_required: boolean }>>([]);
  const [selectedFriendId, setSelectedFriendId] = useState<string | null>(null);
  const [threadMessages, setThreadMessages] = useState<Array<{ id: number; sender_id: string; receiver_id: string; message: string; message_type: string; metadata: any; created_at: string }>>([]);
  const [unreadByFriend, setUnreadByFriend] = useState<Record<string, number>>({});
  const [messageDraft, setMessageDraft] = useState('');
  const [addFriendUsername, setAddFriendUsername] = useState('');
  const socialRealtimeChannelRef = useRef<any>(null);
  const typingRealtimeChannelRef = useRef<any>(null);
  const selectedFriendIdRef = useRef<string | null>(null);
  const threadLoadFriendIdRef = useRef<string | null>(null);
  const threadLoadInFlightRef = useRef<Promise<void> | null>(null);
  const unreadCountsLoadInFlightRef = useRef<Promise<void> | null>(null);
  const [isSelectedFriendTyping, setIsSelectedFriendTyping] = useState(false);
  const threadScrollContainerRef = useRef<HTMLDivElement | null>(null);
  const threadBottomRef = useRef<HTMLDivElement | null>(null);
  const playedIncomingMessageIdsRef = useRef<Set<number>>(new Set());
  const [presenceNow, setPresenceNow] = useState(() => Date.now());

  const getAvatarUrl = (friend: { username: string; avatarUrl: string | null }) =>
    friend.avatarUrl || `https://ui-avatars.com/api/?name=${encodeURIComponent(friend.username || "Player")}&background=1f2937&color=ffffff&size=96`;
  const isWithinOnlineWindow = (lastActiveAt?: string | null) => {
    if (!lastActiveAt) return false;
    const diffMs = presenceNow - new Date(lastActiveAt).getTime();
    return diffMs <= 10 * 60 * 1000;
  };
  const onlineFriendIds = useMemo(
    () =>
      friendsList
        .filter((friend) => onlineUserIds.includes(friend.id) || isWithinOnlineWindow(friend.lastActiveAt))
        .map((friend) => friend.id),
    [friendsList, onlineUserIds, presenceNow]
  );
  const isFriendOnline = (friendId: string) => onlineFriendIds.includes(friendId);

  const openFriendProfile = async (friendId: string) => {
    try {
      if (typeof onOpenPublicProfile === "function") {
        await onOpenPublicProfile(friendId);
        return;
      }
      addToast('Profile page is not available right now.', 'error');
    } catch (error) {
      console.error('Failed to open public profile:', error);
      addToast('Failed to open profile.', 'error');
    }
  };

  const selectedFriend = useMemo(
    () => friendsList.find((f) => f.id === selectedFriendId) ?? null,
    [friendsList, selectedFriendId]
  );
  const friendNameById = useMemo(
    () =>
      friendsList.reduce<Record<string, string>>((acc, friend) => {
        acc[friend.id] = friend.username;
        return acc;
      }, {}),
    [friendsList]
  );
  const friendAvatarById = useMemo(
    () =>
      friendsList.reduce<Record<string, string>>((acc, friend) => {
        if (friend.avatarUrl) {
          acc[friend.id] = friend.avatarUrl;
        }
        return acc;
      }, {}),
    [friendsList]
  );
  useEffect(() => {
    selectedFriendIdRef.current = selectedFriendId;
  }, [selectedFriendId]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      setPresenceNow(Date.now());
    }, 30000);
    return () => {
      window.clearInterval(interval);
    };
  }, []);

  const selectedFriendLastSeen = useMemo(() => {
    if (isSelectedFriendTyping) {
      return "Typing...";
    }
    if (selectedFriend && isFriendOnline(selectedFriend.id)) {
      return "Online now";
    }
    if (!selectedFriend?.lastActiveAt) {
      return "Away";
    }
    const diffMs = presenceNow - new Date(selectedFriend.lastActiveAt).getTime();
    const diffMinutes = Math.max(0, Math.floor(diffMs / 60000));
    if (diffMinutes < 60) return `Away for ${diffMinutes || 1}m`;
    const diffHours = Math.floor(diffMinutes / 60);
    if (diffHours < 24) return `Away for ${diffHours}h`;
    const diffDays = Math.floor(diffHours / 24);
    return `Away for ${diffDays}d`;
  }, [isSelectedFriendTyping, selectedFriend, onlineFriendIds, presenceNow]);
  const loadFriends = async () => {
    if (!user?.id) return;

    const [asOwnerRes, asPeerRes] = await Promise.all([
      supabase.from('friends').select('friend_id').eq('user_id', user.id),
      supabase.from('friends').select('user_id').eq('friend_id', user.id)
    ]);

    const ids = new Set<string>();
    (asOwnerRes.data ?? []).forEach((r: any) => ids.add(r.friend_id));
    (asPeerRes.data ?? []).forEach((r: any) => ids.add(r.user_id));

    if (!ids.size) {
      setFriendsList([]);
      setSelectedFriendId(null);
      return;
    }

    const idList = Array.from(ids);
    const profileMap = await fetchPublicProfileBasics(idList);
    const mapped = idList
      .map((id) => {
        const profile = profileMap.get(id);
        const username = profile?.username?.trim() || profile?.email?.split('@')[0]?.trim() || `Player ${id.slice(0, 8)}`;
        const avatarUrl = profile?.avatar_url || null;
        return { id, username, avatarUrl, lastActiveAt: profile?.last_active_at || null };
      })
      .sort((a, b) => a.username.localeCompare(b.username));
    setFriendsList(mapped);

    if (!selectedFriendId || !mapped.some((f) => f.id === selectedFriendId)) {
      setSelectedFriendId(mapped[0]?.id ?? null);
    }
  };

  const loadPendingRequests = async () => {
    if (!user?.id) return;

    const { data } = await supabase
      .from('friend_requests')
      .select('id,requester_id,status')
      .eq('target_id', user.id)
      .eq('status', 'pending')
      .order('created_at', { ascending: false });

    const rows = data ?? [];
    if (!rows.length) {
      setPendingRequests([]);
      return;
    }

    const requesterIds = rows.map((r: any) => r.requester_id as string);
    const profileMap = await fetchPublicProfileBasics(requesterIds);

    setPendingRequests(
      rows.map((r: any) => ({
        id: r.id,
        requester_id: r.requester_id,
        username:
          profileMap.get(r.requester_id)?.username?.trim() ||
          profileMap.get(r.requester_id)?.email?.split('@')[0]?.trim() ||
          `Player ${String(r.requester_id).slice(0, 8)}`
      }))
    );
  };

  const loadPendingLobbyInvites = async () => {
    if (!user?.id) return;

    const { data, error } = await supabase
      .from('lobby_invites')
      .select('id,lobby_id,from_user_id,status,lobbies!inner(name,password_required,status)')
      .eq('to_user_id', user.id)
      .eq('status', 'pending');

    if (error) {
      throw error;
    }

    const rows = (data ?? []).filter((invite: any) => invite.lobbies?.status === 'open');
    if (!rows.length) {
      setPendingLobbyInvites([]);
      return;
    }

    const inviterIds = rows.map((invite: any) => invite.from_user_id as string);
    const inviterMap = await fetchPublicProfileBasics(inviterIds);

    setPendingLobbyInvites(
      rows.map((invite: any) => ({
        id: invite.id,
        lobby_id: invite.lobby_id,
        lobby_name: invite.lobbies?.name ?? 'Squad Lobby',
        from_user_id: invite.from_user_id,
        from_username:
          inviterMap.get(invite.from_user_id)?.username?.trim() ||
          inviterMap.get(invite.from_user_id)?.email?.split('@')[0]?.trim() ||
          `Player ${String(invite.from_user_id).slice(0, 8)}`,
        password_required: !!invite.lobbies?.password_required,
      }))
    );
  };

  const handleFriendRequest = async (request: { id: number; requester_id: string }, action: 'accept' | 'ignore' | 'block') => {
    if (!user?.id) return;

    const result = await respondFriendRequestRpc(request.id, action);

    if (result === 'accepted') {
      addToast('Friend request accepted', 'success');
    } else if (result === 'ignored') {
      addToast('Friend request ignored', 'info');
    } else if (result === 'blocked') {
      addToast('User blocked', 'info');
    } else {
      addToast('This friend request was already resolved.', 'info');
    }

    await Promise.all([loadPendingRequests(), loadFriends()]);
  };

  const sendFriendRequest = async () => {
    const username = addFriendUsername.trim();
    if (!username || !user?.id) return;

    const target = await findPublicProfileByUsername(username);

    if (!target?.id || target.id === user.id) {
      addToast('User not found', 'error');
      return;
    }

    const result = await sendFriendRequestRpc(target.id);

    setAddFriendUsername('');
    if (result === 'already_friends' || result === 'friends') {
      addToast(result === 'friends' ? 'Friend request matched. You are now friends.' : 'You are already friends.', 'info');
      await loadFriends();
      return;
    }

    addToast(result === 'already_requested' ? 'Friend request already sent' : 'Friend request sent', 'success');
  };

  const handleLobbyInvite = async (
    invite: { id: number; lobby_id: string; password_required: boolean; lobby_name: string },
    action: 'accept' | 'ignore'
  ) => {
    if (!user?.id) return;

    try {
      if (action === 'accept') {
        const password = invite.password_required ? window.prompt(`Enter the password for ${invite.lobby_name}`) || '' : null;
        await joinMatchmakingLobby(invite.lobby_id, password);
        await supabase
          .from('lobby_invites')
          .update({ status: 'accepted', responded_at: new Date().toISOString() })
          .eq('id', invite.id)
          .eq('to_user_id', user.id);
        addToast('Joined squad lobby.', 'success');
      } else {
        await supabase
          .from('lobby_invites')
          .update({ status: 'ignored', responded_at: new Date().toISOString() })
          .eq('id', invite.id)
          .eq('to_user_id', user.id);
        addToast('Lobby invite ignored.', 'info');
      }

      await loadPendingLobbyInvites();
    } catch (error: any) {
      console.error('Failed to respond to lobby invite:', error);
      addToast(error?.message || 'Failed to respond to the squad invite.', 'error');
    }
  };

  useEffect(() => {
    let isCancelled = false;

    const bootstrapSquadHub = async () => {
      if (!user?.id) {
        setFriendsList([]);
        setPendingRequests([]);
        setSelectedFriendId(null);
        setThreadMessages([]);
        setUnreadByFriend({});
        setLoading(false);
        return;
      }

      setLoading(true);
      try {
        await Promise.all([loadFriends(), loadPendingRequests(), loadPendingLobbyInvites(), loadUnreadCounts()]);
      } catch (error) {
        console.error('Failed to bootstrap Squad Hub:', error);
        if (!isCancelled) {
          addToast('Failed to load Squad Hub data.', 'error');
        }
      } finally {
        if (!isCancelled) {
          setLoading(false);
        }
      }
    };

    void bootstrapSquadHub();

    return () => {
      isCancelled = true;
    };
  }, [user?.id, refreshKey]);

  useEffect(() => {
    if (!focusFriendId) {
      return;
    }

    if (!friendsList.some((friend) => friend.id === focusFriendId)) {
      return;
    }

    if (selectedFriendId !== focusFriendId) {
      setSelectedFriendId(focusFriendId);
    }

    onFocusFriendHandled?.();
  }, [focusFriendId, friendsList, onFocusFriendHandled, selectedFriendId]);

  useEffect(() => {
    void loadThread(selectedFriendId);
  }, [selectedFriendId, user?.id]);

  useEffect(() => {
    setIsSelectedFriendTyping(false);
  }, [selectedFriendId]);

  useEffect(() => {
    if (!user?.id) {
      return;
    }

    if (typingRealtimeChannelRef.current) {
      supabase.removeChannel(typingRealtimeChannelRef.current);
      typingRealtimeChannelRef.current = null;
    }

    const channel = supabase.channel('social-typing');
    channel
      .on('broadcast', { event: 'typing' }, ({ payload }: any) => {
        const senderId = payload?.sender_id as string | undefined;
        const receiverId = payload?.receiver_id as string | undefined;
        const isTyping = Boolean(payload?.is_typing);

        if (!senderId || !receiverId) return;
        if (receiverId !== user.id) return;
        if (!selectedFriendId || senderId !== selectedFriendId) return;

        if (isTyping) {
          setIsSelectedFriendTyping(true);
        } else {
          setIsSelectedFriendTyping(false);
        }
      })
      .subscribe();

    typingRealtimeChannelRef.current = channel;

    return () => {
      if (typingRealtimeChannelRef.current) {
        supabase.removeChannel(typingRealtimeChannelRef.current);
        typingRealtimeChannelRef.current = null;
      }
    };
  }, [user?.id, selectedFriendId]);

  useEffect(() => {
    if (!user?.id) {
      return;
    }

    if (socialRealtimeChannelRef.current) {
      supabase.removeChannel(socialRealtimeChannelRef.current);
      socialRealtimeChannelRef.current = null;
    }

    const channel = supabase.channel(`social-direct-messages-${user.id}`);

    channel
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'direct_messages',
          filter: `sender_id=eq.${user.id}`,
        },
        (payload) => {
          const row = payload.new as {
            id: number;
            sender_id: string;
            receiver_id: string;
            message: string;
            message_type: string;
            metadata: any;
            created_at: string;
          };

          if (row.receiver_id === user.id && row.sender_id !== user.id && !playedIncomingMessageIdsRef.current.has(row.id)) {
            playedIncomingMessageIdsRef.current.add(row.id);
            playChatMessageSound();
          }

          const activeFriendId = selectedFriendIdRef.current;
          if (
            activeFriendId &&
            ((row.sender_id === user.id && row.receiver_id === activeFriendId) ||
              (row.sender_id === activeFriendId && row.receiver_id === user.id))
          ) {
            setThreadMessages((current) =>
              current.some((entry) => entry.id === row.id) ? current : [...current, row]
            );
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'direct_messages',
          filter: `receiver_id=eq.${user.id}`,
        },
        (payload) => {
          const row = payload.new as {
            id: number;
            sender_id: string;
            receiver_id: string;
            message: string;
            message_type: string;
            metadata: any;
            created_at: string;
          };

          if (row.sender_id !== user.id && !playedIncomingMessageIdsRef.current.has(row.id)) {
            playedIncomingMessageIdsRef.current.add(row.id);
            playChatMessageSound();
          }

          const activeFriendId = selectedFriendIdRef.current;
          if (
            activeFriendId &&
            ((row.sender_id === user.id && row.receiver_id === activeFriendId) ||
              (row.sender_id === activeFriendId && row.receiver_id === user.id))
          ) {
            setThreadMessages((current) =>
              current.some((entry) => entry.id === row.id) ? current : [...current, row]
            );
          }

          void loadUnreadCounts();
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'friend_requests',
          filter: `target_id=eq.${user.id}`,
        },
        (_payload) => {
          playChatMessageSound();
          void loadPendingRequests();
        }
      )
      .subscribe();

    socialRealtimeChannelRef.current = channel;

    return () => {
      if (socialRealtimeChannelRef.current) {
        supabase.removeChannel(socialRealtimeChannelRef.current);
        socialRealtimeChannelRef.current = null;
      }
    };
  }, [user?.id]);

  useEffect(() => {
    if (!threadBottomRef.current) return;
    threadBottomRef.current.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [threadMessages.length, selectedFriendId]);

  useEffect(() => {
    if (!user?.id || !selectedFriendId || !typingRealtimeChannelRef.current) return;
    return () => {
      if (!typingRealtimeChannelRef.current) return;
      void typingRealtimeChannelRef.current.send({
        type: 'broadcast',
        event: 'typing',
        payload: {
          sender_id: user.id,
          receiver_id: selectedFriendId,
          is_typing: false,
        },
      });
    };
  }, [user?.id, selectedFriendId]);

  useEffect(() => {
    if (!user?.id || !selectedFriendId) {
      return;
    }

    const interval = window.setInterval(() => {
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') {
        return;
      }
      void loadThread(selectedFriendId);
    }, 10000);

    return () => {
      window.clearInterval(interval);
    };
  }, [user?.id, selectedFriendId]);

  useEffect(() => {
    if (!user?.id) {
      return;
    }

    const handleVisibilityChange = () => {
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') {
        return;
      }
      void loadUnreadCounts();
      if (selectedFriendIdRef.current) {
        void loadThread(selectedFriendIdRef.current);
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [user?.id]);

  const loadUnreadCounts = async () => {
    if (!user?.id) return;

    if (unreadCountsLoadInFlightRef.current) {
      return unreadCountsLoadInFlightRef.current;
    }

    const loadPromise = (async () => {
      const { data } = await supabase
        .from('direct_messages')
        .select('sender_id')
        .eq('receiver_id', user.id)
        .eq('is_read', false);

      const counts: Record<string, number> = {};
      (data ?? []).forEach((row: any) => {
        const sender = row.sender_id as string;
        counts[sender] = (counts[sender] ?? 0) + 1;
      });

      setUnreadByFriend(counts);
    })();

    unreadCountsLoadInFlightRef.current = loadPromise.finally(() => {
      if (unreadCountsLoadInFlightRef.current === loadPromise) {
        unreadCountsLoadInFlightRef.current = null;
      }
    });

    return unreadCountsLoadInFlightRef.current;
  };

  const loadThread = async (friendId: string | null) => {
    if (!user?.id || !friendId) {
      setThreadMessages([]);
      return;
    }

    if (threadLoadInFlightRef.current && threadLoadFriendIdRef.current === friendId) {
      return threadLoadInFlightRef.current;
    }

    const loadPromise = (async () => {
      const condition =
        'and(sender_id.eq.' + user.id + ',receiver_id.eq.' + friendId + '),and(sender_id.eq.' + friendId + ',receiver_id.eq.' + user.id + ')';

      const { data } = await supabase
        .from('direct_messages')
        .select('id,sender_id,receiver_id,message,message_type,metadata,created_at')
        .or(condition)
        .order('created_at', { ascending: true })
        .limit(200);

      if (selectedFriendIdRef.current === friendId) {
        setThreadMessages((data ?? []) as any);
      }

      await supabase
        .from('direct_messages')
        .update({ is_read: true })
        .eq('receiver_id', user.id)
        .eq('sender_id', friendId)
        .eq('is_read', false);

      await loadUnreadCounts();
    })();

    threadLoadFriendIdRef.current = friendId;
    threadLoadInFlightRef.current = loadPromise.finally(() => {
      if (threadLoadInFlightRef.current === loadPromise) {
        threadLoadInFlightRef.current = null;
        threadLoadFriendIdRef.current = null;
      }
    });

    return threadLoadInFlightRef.current;
  };

  const sendMessage = async () => {
    const text = messageDraft.trim();
    if (!text || !selectedFriendId || !user?.id) return;

    const { data, error } = await supabase
      .from('direct_messages')
      .insert({
        sender_id: user.id,
        receiver_id: selectedFriendId,
        message: text,
        message_type: 'text',
        metadata: {}
      })
      .select('id,sender_id,receiver_id,message,message_type,metadata,created_at')
      .single();

    if (error) {
      addToast('Failed to send message', 'error');
      return;
    }

    if (data) {
      setThreadMessages((current) =>
        current.some((entry) => entry.id === data.id) ? current : [...current, data as any]
      );
      playChatMessageSound();
    }

    setMessageDraft('');
    setIsSelectedFriendTyping(false);

    if (typingRealtimeChannelRef.current && selectedFriendId) {
      void typingRealtimeChannelRef.current.send({
        type: 'broadcast',
        event: 'typing',
        payload: {
          sender_id: user.id,
          receiver_id: selectedFriendId,
          is_typing: false,
        },
      });
    }
  };

  const totalUnreadCount = Object.values(unreadByFriend as Record<string, number>).reduce(
    (sum: number, count: number) => sum + count,
    0
  );

  return (
    <div className="space-y-6">
      <div className="overflow-hidden rounded-[28px] border border-esport-accent/20 bg-[radial-gradient(circle_at_top_left,rgba(59,130,246,0.18),transparent_35%),linear-gradient(180deg,rgba(15,23,42,0.98),rgba(7,10,18,0.98))] p-6 shadow-[0_25px_70px_rgba(0,0,0,0.35)]">
        <div className="flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
          <div className="max-w-3xl">
            <div className="inline-flex items-center gap-2 rounded-full border border-esport-accent/25 bg-esport-accent/10 px-4 py-2 text-[11px] font-bold uppercase tracking-[0.24em] text-esport-accent">
              <Activity size={14} />
              Live Squad Network
            </div>
            <h3 className="mt-5 text-4xl font-display font-bold uppercase tracking-tight text-white">Social Command</h3>
            <p className="mt-3 text-base text-esport-text-muted">
              Manage friends, direct messages, and incoming invites from one richer social control room.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {[
              { label: "Friends", value: friendsList.length, tone: "text-white" },
              { label: "Online", value: onlineFriendIds.length, tone: "text-emerald-300" },
              { label: "Unread", value: totalUnreadCount, tone: "text-esport-accent" },
              { label: "Invites", value: pendingRequests.length + pendingLobbyInvites.length, tone: "text-amber-200" },
            ].map((card) => (
              <div key={card.label} className="min-w-[128px] rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3">
                <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-esport-text-muted">{card.label}</div>
                <div className={`mt-2 text-2xl font-display font-bold ${card.tone}`}>{card.value}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-6 grid gap-4 xl:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
          <div className="rounded-[24px] border border-white/10 bg-black/20 p-4">
            <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-esport-text-muted">Add Friend</div>
            <div className="mt-3 flex flex-col gap-3 sm:flex-row">
              <input
                value={addFriendUsername}
                onChange={(e) => setAddFriendUsername(e.target.value)}
                placeholder="Enter exact username"
                className="h-12 flex-1 rounded-xl border border-white/10 bg-white/[0.05] px-4 text-sm text-white outline-none transition-colors placeholder:text-esport-text-muted focus:border-esport-accent/50"
              />
              <button onClick={() => sendFriendRequest().catch((err) => console.error(err))} className="h-12 rounded-xl bg-esport-accent px-5 text-sm font-bold text-white shadow-[0_0_20px_rgba(59,130,246,0.28)] transition-transform hover:scale-[1.01]">
                Send Request
              </button>
            </div>
          </div>

          <div className="rounded-[24px] border border-white/10 bg-black/20 p-4">
            <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-esport-text-muted">Presence Status</div>
            <div className="mt-3 flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-emerald-400/30 bg-emerald-400/10">
                <Bell size={18} className="text-emerald-300" />
              </div>
              <div>
                <div className="text-sm font-bold text-white">Live across the entire site</div>
                <div className="text-xs text-esport-text-muted">Players stay online while browsing any section and only fall back to last seen after leaving the site.</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="esport-card p-12 text-center animate-shimmer">Loading chats...</div>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-[320px_minmax(0,1fr)_300px] gap-6">
          <div className="rounded-[24px] border border-white/10 bg-[linear-gradient(180deg,rgba(18,24,37,0.98),rgba(11,15,24,0.98))] p-4 shadow-[0_18px_40px_rgba(0,0,0,0.25)]">
            <div className="text-[10px] font-bold uppercase tracking-widest text-esport-text-muted mb-3">Your Friends</div>
            {!friendsList.length ? (
              <div className="text-sm text-esport-text-muted">No friends yet. Add friends to start direct messaging.</div>
            ) : (
              <div className="space-y-2">
                {friendsList.map((friend) => {
                  const unread = unreadByFriend[friend.id] ?? 0;
                  const active = selectedFriendId === friend.id;
                  return (
                    <button
                      key={friend.id}
                      onClick={() => setSelectedFriendId(friend.id)}
                      className={'w-full text-left p-3 rounded-2xl border transition-all ' + (active ? 'border-esport-accent bg-esport-accent/10 shadow-[0_0_0_1px_rgba(59,130,246,0.12)]' : 'border-white/10 bg-white/[0.03] hover:border-white/20 hover:bg-white/[0.05]')}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex min-w-0 items-center gap-3">
                          <div className="relative shrink-0">
                            <img
                              src={getAvatarUrl(friend)}
                              alt={friend.username}
                              className="h-11 w-11 rounded-2xl border border-white/15 object-cover"
                              role="button"
                              tabIndex={0}
                              onClick={(event) => {
                                event.stopPropagation();
                                void openFriendProfile(friend.id);
                              }}
                              onKeyDown={(event) => {
                                if (event.key === 'Enter' || event.key === ' ') {
                                  event.preventDefault();
                                  event.stopPropagation();
                                  void openFriendProfile(friend.id);
                                }
                              }}
                            />
                            {isFriendOnline(friend.id) && (
                              <span className="absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full border-2 border-[#1d2129] bg-emerald-400 shadow-[0_0_10px_rgba(74,222,128,0.55)]" />
                            )}
                          </div>
                          <div
                            className="min-w-0 cursor-pointer font-bold text-sm truncate hover:text-esport-accent"
                            role="button"
                            tabIndex={0}
                            onClick={(event) => {
                              event.stopPropagation();
                              void openFriendProfile(friend.id);
                            }}
                            onKeyDown={(event) => {
                              if (event.key === 'Enter' || event.key === ' ') {
                                event.preventDefault();
                                event.stopPropagation();
                                void openFriendProfile(friend.id);
                              }
                            }}
                          >
                            {friend.username}
                          </div>
                        </div>
                        <div className="flex flex-col items-end gap-1">
                          <span className={cn("rounded-full px-2 py-1 text-[10px] font-bold uppercase tracking-[0.18em]", isFriendOnline(friend.id) ? "bg-emerald-400/10 text-emerald-300" : "bg-white/[0.06] text-esport-text-muted")}>
                            {isFriendOnline(friend.id) ? "Online" : "Away"}
                          </span>
                          {unread > 0 ? (
                            <span className="min-w-[20px] h-5 px-1 bg-esport-danger text-white text-[10px] font-bold rounded-full flex items-center justify-center">
                              {unread > 99 ? '99+' : unread}
                            </span>
                          ) : null}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <div className="rounded-[26px] border border-white/10 bg-[linear-gradient(180deg,rgba(18,24,37,0.98),rgba(8,11,18,0.98))] p-0 overflow-hidden flex flex-col h-[640px] max-h-[74vh] shadow-[0_20px_50px_rgba(0,0,0,0.3)]">
            <div className="px-4 py-3 border-b border-esport-border flex items-center justify-between bg-white/[0.02]">
              <div className="flex items-center gap-3">
                {selectedFriend && (
                  <div className="relative">
                    <img
                      src={getAvatarUrl(selectedFriend)}
                      alt={selectedFriend.username}
                      className="h-11 w-11 cursor-pointer rounded-2xl border border-white/15 object-cover transition-transform hover:scale-105"
                      onClick={() => void openFriendProfile(selectedFriend.id)}
                    />
                    {isFriendOnline(selectedFriend.id) && (
                      <span className="absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full border-2 border-[#1d2129] bg-emerald-400 shadow-[0_0_10px_rgba(74,222,128,0.55)]" />
                    )}
                  </div>
                )}
                <div>
                  <div className="text-xs font-bold uppercase tracking-widest text-esport-text-muted">Direct Messages</div>
                  <div
                    className={cn(
                      "text-sm font-bold",
                      selectedFriend ? "cursor-pointer text-white hover:text-esport-accent" : "text-white"
                    )}
                    onClick={() => {
                      if (selectedFriend) {
                        void openFriendProfile(selectedFriend.id);
                      }
                    }}
                  >
                    {selectedFriend?.username ?? 'Select a friend'}
                  </div>
                  {selectedFriend && (
                    <div className="text-[10px] text-esport-text-muted mt-1">{selectedFriendLastSeen}</div>
                  )}
                </div>
              </div>
            </div>

            <div ref={threadScrollContainerRef} className="flex-1 p-4 overflow-y-auto custom-scrollbar space-y-3 bg-[radial-gradient(circle_at_top,rgba(59,130,246,0.08),transparent_32%),linear-gradient(180deg,rgba(8,11,18,0.4),rgba(3,5,10,0.65))]">
              {!selectedFriend ? (
                <div className="text-sm text-esport-text-muted">Choose a friend from the left to open your chat.</div>
              ) : threadMessages.length === 0 ? (
                <div className="text-sm text-esport-text-muted">No messages yet. Say hi.</div>
              ) : (
                threadMessages.map((msg) => {
                  const mine = msg.sender_id === user?.id;
                  const isInvite = msg.message_type === 'game_invite';
                  const senderName = mine
                    ? (user?.username || user?.email?.split('@')[0] || 'You')
                    : (friendNameById[msg.sender_id] || selectedFriend?.username || `Player ${msg.sender_id.slice(0, 8)}`);
                  const avatarUrl =
                    (mine
                      ? (user?.avatarUrl || null)
                      : (friendAvatarById[msg.sender_id] || null)) ||
                    `https://ui-avatars.com/api/?name=${encodeURIComponent(senderName)}&background=1f2937&color=ffffff&size=64`;
                  return (
                    <div key={msg.id} className={'flex ' + (mine ? 'justify-end' : 'justify-start')}>
                      <div className={'flex items-end gap-2 max-w-[75%] ' + (mine ? 'flex-row-reverse' : 'flex-row')}>
                        <img
                          src={avatarUrl}
                          alt={senderName}
                          className="w-8 h-8 rounded-full border border-white/15 object-cover shrink-0"
                        />
                        <div className={'px-4 py-3 rounded-2xl text-sm shadow-[0_10px_24px_rgba(0,0,0,0.18)] ' + (mine ? 'bg-esport-accent text-white' : 'bg-white/10 text-white border border-esport-border')}>
                          <div>{msg.message}</div>
                          {isInvite ? (
                            <div className="mt-2">
                              <button className="esport-btn-primary" onClick={() => addToast('Lobby invite flow will open here', 'info')}>Join</button>
                            </div>
                          ) : null}
                          <div className={'text-[10px] mt-1 ' + (mine ? 'text-white/70' : 'text-esport-text-muted')}>
                            {new Date(msg.created_at).toLocaleTimeString()}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
              {selectedFriend && isSelectedFriendTyping ? (
                <div className="text-xs text-esport-text-muted italic">{selectedFriend.username} is typing...</div>
              ) : null}
              <div ref={threadBottomRef} />
            </div>

            <div className="p-3 border-t border-esport-border flex items-center gap-2">
              <input
                value={messageDraft}
                onChange={(e) => {
                  const value = e.target.value;
                  setMessageDraft(value);
                  if (!user?.id || !selectedFriendId || !typingRealtimeChannelRef.current) {
                    return;
                  }

                  void typingRealtimeChannelRef.current.send({
                    type: 'broadcast',
                    event: 'typing',
                    payload: {
                      sender_id: user.id,
                      receiver_id: selectedFriendId,
                      is_typing: value.trim().length > 0,
                    },
                  });
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    sendMessage().catch((err) => console.error(err));
                  }
                }}
                placeholder={selectedFriend ? ('Message ' + selectedFriend.username + '...') : 'Select a friend first'}
                disabled={!selectedFriend}
                className="h-12 flex-1 bg-white/5 border border-esport-border rounded-xl px-4 py-2 text-sm focus:outline-none focus:border-esport-accent/50 disabled:opacity-50"
              />
              <button
                onClick={() => sendMessage().catch((err) => console.error(err))}
                disabled={!selectedFriend || !messageDraft.trim()}
                className="h-12 rounded-xl bg-esport-accent px-5 text-sm font-bold text-white disabled:opacity-40"
              >
                Send
              </button>
            </div>
          </div>

          <div className="space-y-5">
            <div className="rounded-[24px] border border-white/10 bg-[linear-gradient(180deg,rgba(18,24,37,0.98),rgba(11,15,24,0.98))] p-4 shadow-[0_18px_40px_rgba(0,0,0,0.22)]">
              <div className="flex items-center justify-between">
                <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-esport-text-muted">Friend Requests</div>
                <div className="rounded-full bg-white/[0.06] px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-white">{pendingRequests.length}</div>
              </div>
              <div className="mt-4 space-y-3">
                {pendingRequests.length ? pendingRequests.map((req) => (
                  <div key={req.id} className="rounded-2xl border border-white/10 bg-white/[0.04] p-3">
                    <div className="text-sm text-white">
                      <span className="font-bold">{req.username}</span> sent you a friend request.
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button className="rounded-xl bg-esport-success px-3 py-2 text-xs font-bold uppercase tracking-[0.18em] text-black" onClick={() => handleFriendRequest(req, 'accept').catch((err) => console.error(err))}>Accept</button>
                      <button className="rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-xs font-bold uppercase tracking-[0.18em] text-white" onClick={() => handleFriendRequest(req, 'ignore').catch((err) => console.error(err))}>Ignore</button>
                      <button className="rounded-xl border border-esport-danger/25 bg-esport-danger/10 px-3 py-2 text-xs font-bold uppercase tracking-[0.18em] text-rose-200" onClick={() => handleFriendRequest(req, 'block').catch((err) => console.error(err))}>Block</button>
                    </div>
                  </div>
                )) : (
                  <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.02] px-4 py-5 text-sm text-esport-text-muted">
                    No pending friend requests right now.
                  </div>
                )}
              </div>
            </div>

            <div className="rounded-[24px] border border-white/10 bg-[linear-gradient(180deg,rgba(18,24,37,0.98),rgba(11,15,24,0.98))] p-4 shadow-[0_18px_40px_rgba(0,0,0,0.22)]">
              <div className="flex items-center justify-between">
                <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-esport-text-muted">Squad Invites</div>
                <div className="rounded-full bg-white/[0.06] px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-white">{pendingLobbyInvites.length}</div>
              </div>
              <div className="mt-4 space-y-3">
                {pendingLobbyInvites.length ? pendingLobbyInvites.map((invite) => (
                  <div key={invite.id} className="rounded-2xl border border-white/10 bg-white/[0.04] p-3">
                    <div className="text-sm text-white">
                      <span className="font-bold">{invite.from_username}</span> invited you to <span className="font-bold">{invite.lobby_name}</span>.
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button className="rounded-xl bg-esport-accent px-3 py-2 text-xs font-bold uppercase tracking-[0.18em] text-white" onClick={() => handleLobbyInvite(invite, 'accept').catch((err) => console.error(err))}>Join</button>
                      <button className="rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-xs font-bold uppercase tracking-[0.18em] text-white" onClick={() => handleLobbyInvite(invite, 'ignore').catch((err) => console.error(err))}>Ignore</button>
                    </div>
                  </div>
                )) : (
                  <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.02] px-4 py-5 text-sm text-esport-text-muted">
                    No squad invites waiting for you.
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export function SquadHubView({
  addToast,
  user,
  accountMode = 'demo',
  openModal,
  refreshSession,
  showJoinTransition = false,
  onJoinTransitionDone,
}: any) {
  return (
    <CustomLobbyView
      addToast={addToast}
      openModal={openModal}
      user={user}
      accountMode={accountMode}
      refreshSession={refreshSession || (async () => undefined)}
      showJoinTransition={showJoinTransition}
      onJoinTransitionDone={onJoinTransitionDone}
    />
  );
}
