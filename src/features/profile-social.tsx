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
  User,
  Users,
  Wallet,
  X,
  Zap,
} from "lucide-react";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { isSupabaseConfigured } from "../lib/env";
import {
  completeDemoMatchForTesting,
  createMatchmakingLobby,
  fetchMyActiveLobby,
  fetchMyActiveMatch,
  fetchOpenMatchmakingLobbies,
  joinMatchmakingLobby,
  leaveMatchmakingLobby,
  setLobbyMemberReady,
  startLobbyMatch,
  type ActiveMatch,
  type MatchmakingLobby,
} from "../lib/supabase/matchmaking";
import { updateProfileBasics } from "../lib/supabase/profile";
import { supabase } from "../lib/supabase";
import { auth, collection, createUserWithEmailAndPassword, db, doc, getDoc, getDocs, googleProvider, limit, onSnapshot, orderBy, query, serverTimestamp, setDoc, signInWithEmailAndPassword, signInWithPopup, updateDoc } from "../firebase";
import { cn } from "./shared-ui";
import type { AccountMode, Mission, UserStats, WalletSnapshot } from "./types";
import { DynamicImage, KYCForm } from "./landing-auth";

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
}) {
  const [activeTab, setActiveTab] = useState('overview');
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState(profileData);
  const [demoTopUpAmount, setDemoTopUpAmount] = useState(wallet.demoBalance > 0 ? wallet.demoBalance.toString() : "");
  const [isSwitchingMode, setIsSwitchingMode] = useState(false);
  const [isSavingDemoBalance, setIsSavingDemoBalance] = useState(false);

  useEffect(() => {
    setDemoTopUpAmount(wallet.demoBalance > 0 ? wallet.demoBalance.toString() : "");
  }, [wallet.demoBalance]);

  const handleSave = async () => {
    if (!user?.id) return;
    try {
      if (isSupabaseConfigured()) {
        await updateProfileBasics(user.id, editForm);
      } else {
        await setDoc(doc(db, "users", user.id), {
          ...editForm
        }, { merge: true });
      }
      setProfileData(editForm);
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
    if (!Number.isFinite(amount) || amount < 0) {
      addToast("Enter a valid non-negative demo balance amount.", "error");
      return;
    }

    setIsSavingDemoBalance(true);
    try {
      await topUpDemoBalance(amount);
      addToast("Demo balance updated.", "success");
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
        <DynamicImage prompt="abstract dark blue neon cyberpunk landscape" className="w-full h-full object-cover opacity-60 group-hover:opacity-80 transition-opacity" />
        <div className="absolute inset-0 bg-gradient-to-t from-[#0a0b0d] via-[#0a0b0d]/60 to-transparent" />
        
        <div className="absolute bottom-0 left-0 w-full p-6 md:p-10 flex flex-col md:flex-row items-end gap-6">
          <div className="relative">
            <img src={`https://ui-avatars.com/api/?name=${user?.username || 'Player'}&background=random&size=128`} className="w-24 h-24 md:w-32 md:h-32 rounded-2xl border-4 border-[#0a0b0d] shadow-2xl" />
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
            <button className="esport-btn-primary flex-1 md:flex-none">
              <User size={16} /> Add Friend
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
                <div className="text-[10px] font-bold text-esport-text-muted uppercase tracking-widest">Top Balance</div>
                <div className="flex gap-2">
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={demoTopUpAmount}
                    onChange={(e) => setDemoTopUpAmount(e.target.value)}
                    className="flex-1 bg-black/50 border border-esport-border rounded-lg px-3 py-2 text-sm text-white focus:border-esport-secondary outline-none transition-colors"
                    placeholder="1000.00"
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
                  <h3 className="font-display font-bold uppercase tracking-wider mb-4 text-white">Guestbook</h3>
                  <div className="bg-white/5 border border-esport-border rounded-xl p-8 text-center">
                    <MessageSquare className="w-12 h-12 text-esport-text-muted mx-auto mb-3 opacity-50" />
                    <div className="font-bold mb-1">No messages yet</div>
                    <div className="text-sm text-esport-text-muted mb-4">Be the first to leave a message on this profile.</div>
                    <button className="esport-btn-secondary mx-auto text-sm py-2">Sign Guestbook</button>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'matches' && (
              <div>
                <h3 className="font-display font-bold uppercase tracking-wider mb-4 text-white">Match History</h3>
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
                    <input 
                      type="text"
                      value={editForm.country}
                      onChange={(e) => setEditForm({...editForm, country: e.target.value})}
                      className="w-full bg-black/50 border border-esport-border rounded-lg p-3 text-white focus:border-esport-accent outline-none transition-colors"
                    />
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

export function BattlefieldView({ addToast, openModal, user, accountMode }: { addToast: any; openModal: any; user: any; accountMode: AccountMode }) {
  const isKycVerified = user?.kycStatus === 'verified' || user?.email?.toLowerCase() === "danielnotexist@gmail.com";
  const requiresKyc = accountMode === "live";
  const [matchState, setMatchState] = useState<'idle' | 'searching' | 'found' | 'accepted' | 'connecting'>('idle');
  const [searchTime, setSearchTime] = useState(0);
  const [acceptedCount, setAcceptedCount] = useState(0);
  const [matchType, setMatchType] = useState('standard');

  useEffect(() => {
    let interval: any;
    if (matchState === 'searching') {
      interval = setInterval(() => {
        setSearchTime(prev => {
          if (prev >= 5) { // Found match after 5 seconds
            setMatchState('found');
            return 0;
          }
          return prev + 1;
        });
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [matchState]);

  useEffect(() => {
    let interval: any;
    if (matchState === 'accepted') {
      interval = setInterval(() => {
        setAcceptedCount(prev => {
          if (prev >= 10) {
            setTimeout(() => setMatchState('connecting'), 1000);
            return 10;
          }
          return prev + 1;
        });
      }, 400); // Simulate other players accepting
    }
    return () => clearInterval(interval);
  }, [matchState]);

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60).toString().padStart(2, '0');
    const s = (seconds % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  const startSearch = () => {
    if (requiresKyc && !isKycVerified) {
      addToast("KYC Verification required to play", "error");
      return;
    }
    if (accountMode !== "demo") {
      addToast("Switch to Demo Account from Profile before entering matchmaking.", "error");
      return;
    }
    setSearchTime(0);
    setMatchState('searching');
    addToast("Searching for match...", "info");
  };

  const acceptMatch = () => {
    setMatchState('accepted');
    setAcceptedCount(1); // You accepted
  };

  const cancelSearch = () => {
    setMatchState('idle');
    setSearchTime(0);
  };

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
    <div className="max-w-5xl mx-auto space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-display font-bold uppercase tracking-tight">Battlefield</h2>
          <p className="text-esport-text-muted">
            {accountMode === "demo"
              ? "Demo matchmaking is active. You are inside the isolated testing environment."
              : "Matchmaking is currently restricted to Demo Accounts so payout and server flows can be tested safely."}
          </p>
        </div>
        <div className="flex items-center gap-4 bg-esport-card border border-esport-border px-4 py-2 rounded-lg">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-esport-success animate-pulse" />
            <span className="text-sm font-bold">{accountMode === "demo" ? "Demo Queue Online" : "Live Queue Locked"}</span>
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
                Server allocation, matchmaking, and post-match settlement testing are isolated to demo-mode users only. Switch from the Profile section to enter the demo environment.
              </p>
            </div>
          </div>
        </div>
      )}

      {matchState === 'idle' && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Game Modes */}
          <div className="md:col-span-2 space-y-4">
            <div 
              onClick={() => setMatchType('standard')}
              className={`esport-card p-6 border relative overflow-hidden group cursor-pointer transition-colors ${matchType === 'standard' ? 'border-esport-accent' : 'border-esport-border hover:border-white/20'}`}
            >
              <div className={`absolute inset-0 bg-gradient-to-r from-esport-accent/20 to-transparent transition-opacity ${matchType === 'standard' ? 'opacity-100' : 'opacity-0 group-hover:opacity-50'}`} />
              <div className="flex items-center justify-between relative z-10">
                <div>
                  <h3 className="text-2xl font-bold font-display uppercase mb-1">Ranked 5v5</h3>
                  <p className="text-sm text-esport-text-muted">Competitive matchmaking. Affects your ELO.</p>
                </div>
                <div className={`w-12 h-12 rounded-full flex items-center justify-center border transition-colors ${matchType === 'standard' ? 'bg-esport-accent/20 border-esport-accent' : 'bg-black/50 border-esport-border'}`}>
                  <Sword className={matchType === 'standard' ? 'text-esport-accent' : 'text-esport-text-muted'} />
                </div>
              </div>
            </div>
            
            <div 
              onClick={() => setMatchType('unranked')}
              className={`esport-card p-6 border relative overflow-hidden group cursor-pointer transition-colors ${matchType === 'unranked' ? 'border-esport-accent' : 'border-esport-border hover:border-white/20'}`}
            >
              <div className={`absolute inset-0 bg-gradient-to-r from-esport-accent/20 to-transparent transition-opacity ${matchType === 'unranked' ? 'opacity-100' : 'opacity-0 group-hover:opacity-50'}`} />
              <div className="flex items-center justify-between relative z-10">
                <div>
                  <h3 className="text-xl font-bold font-display uppercase mb-1">Unranked</h3>
                  <p className="text-sm text-esport-text-muted">Casual play. Try new strategies.</p>
                </div>
                <div className={`w-12 h-12 rounded-full flex items-center justify-center border transition-colors ${matchType === 'unranked' ? 'bg-esport-accent/20 border-esport-accent' : 'bg-black/50 border-esport-border'}`}>
                  <Users className={matchType === 'unranked' ? 'text-esport-accent' : 'text-esport-text-muted'} />
                </div>
              </div>
            </div>
          </div>

          {/* Action Panel */}
          <div className="esport-card p-6 flex flex-col justify-center items-center text-center space-y-6">
            <div className="w-24 h-24 rounded-full border-4 border-esport-border flex items-center justify-center bg-black/50">
              <Target className="w-10 h-10 text-esport-text-muted" />
            </div>
            <div>
              <div className="text-sm text-esport-text-muted mb-1">Estimated Wait</div>
              <div className="text-2xl font-bold font-mono">01:15</div>
            </div>
            <button onClick={startSearch} className="esport-btn-primary w-full py-4 text-lg animate-pulse hover:animate-none shadow-[0_0_20px_rgba(59,130,246,0.4)]">
              FIND MATCH
            </button>
          </div>
        </div>
      )}

      {matchState === 'searching' && (
        <div className="esport-card p-12 flex flex-col items-center justify-center min-h-[400px] relative overflow-hidden">
          {/* Radar Animation */}
          <div className="absolute inset-0 flex items-center justify-center opacity-20 pointer-events-none">
            <div className="w-96 h-96 border border-esport-accent rounded-full animate-[ping_3s_linear_infinite]" />
            <div className="w-64 h-64 border border-esport-accent rounded-full absolute animate-[ping_3s_linear_infinite_1s]" />
            <div className="w-32 h-32 border border-esport-accent rounded-full absolute animate-[ping_3s_linear_infinite_2s]" />
          </div>
          
          <div className="relative z-10 text-center space-y-6">
            <div className="w-20 h-20 mx-auto bg-esport-accent/20 rounded-full flex items-center justify-center border border-esport-accent animate-spin-slow">
              <Search className="w-8 h-8 text-esport-accent" />
            </div>
            <div>
              <h3 className="text-2xl font-bold font-display uppercase tracking-widest text-esport-accent mb-2">Searching for Players</h3>
              <div className="text-4xl font-mono font-bold text-white">{formatTime(searchTime)}</div>
            </div>
            <button onClick={cancelSearch} className="esport-btn-secondary text-esport-danger border-esport-danger/30 hover:bg-esport-danger/10">
              Cancel Search
            </button>
          </div>
        </div>
      )}

      {matchState === 'found' && (
        <div className="esport-card p-12 flex flex-col items-center justify-center min-h-[400px] border-esport-success shadow-[0_0_50px_rgba(16,185,129,0.2)]">
          <div className="w-24 h-24 mx-auto bg-esport-success/20 rounded-full flex items-center justify-center border-2 border-esport-success mb-6 animate-bounce">
            <CheckCircle2 className="w-12 h-12 text-esport-success" />
          </div>
          <h3 className="text-4xl font-bold font-display uppercase tracking-widest text-white mb-2">Match Found!</h3>
          <p className="text-esport-text-muted mb-8">Please accept to join the lobby.</p>
          
          <div className="flex gap-4">
            <button onClick={acceptMatch} className="bg-esport-success hover:bg-emerald-400 text-black font-bold py-4 px-12 rounded-lg text-xl transition-transform active:scale-95 shadow-[0_0_20px_rgba(16,185,129,0.4)]">
              ACCEPT
            </button>
            <button onClick={cancelSearch} className="esport-btn-secondary py-4 px-8">
              DECLINE
            </button>
          </div>
        </div>
      )}

      {matchState === 'accepted' && (
        <div className="esport-card p-12 flex flex-col items-center justify-center min-h-[400px]">
          <h3 className="text-2xl font-bold font-display uppercase tracking-widest text-white mb-8">Waiting for players...</h3>
          
          <div className="flex gap-2 mb-8">
            {Array.from({ length: 10 }).map((_, i) => (
              <div key={i} className={`w-12 h-16 rounded border-2 flex items-center justify-center transition-all duration-300 ${i < acceptedCount ? 'bg-esport-success/20 border-esport-success text-esport-success shadow-[0_0_10px_rgba(16,185,129,0.5)]' : 'bg-black/50 border-esport-border text-esport-border'}`}>
                {i < acceptedCount ? <CheckCircle2 className="w-6 h-6" /> : <Clock className="w-6 h-6" />}
              </div>
            ))}
          </div>
          
          <div className="text-xl font-mono font-bold text-esport-accent">
            {acceptedCount} / 10 Accepted
          </div>
        </div>
      )}

      {matchState === 'connecting' && (
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
          <button onClick={cancelSearch} className="mt-8 esport-btn-secondary text-sm">
            Disconnect
          </button>
        </div>
      )}
    </div>
  );
}

export function SquadHubView({ addToast, user, accountMode = 'demo', onOpenBattlefield }: any) {
  const [loading, setLoading] = useState(true);
  const [friendsList, setFriendsList] = useState<Array<{ id: string; username: string }>>([]);
  const [pendingRequests, setPendingRequests] = useState<Array<{ id: number; requester_id: string; username: string }>>([]);
  const [pendingLobbyInvites, setPendingLobbyInvites] = useState<Array<{ id: number; lobby_id: string; lobby_name: string; from_user_id: string; from_username: string; password_required: boolean }>>([]);
  const [selectedFriendId, setSelectedFriendId] = useState<string | null>(null);
  const [threadMessages, setThreadMessages] = useState<Array<{ id: number; sender_id: string; receiver_id: string; message: string; message_type: string; metadata: any; created_at: string }>>([]);
  const [unreadByFriend, setUnreadByFriend] = useState<Record<string, number>>({});
  const [messageDraft, setMessageDraft] = useState('');
  const [addFriendUsername, setAddFriendUsername] = useState('');
  const [queuedMode, setQueuedMode] = useState<'solo' | 'squad' | null>(null);
  const [selectedSquadIds, setSelectedSquadIds] = useState<string[]>([]);

  const selectedFriend = useMemo(
    () => friendsList.find((f) => f.id === selectedFriendId) ?? null,
    [friendsList, selectedFriendId]
  );
  const selectedSquadFriends = useMemo(
    () => friendsList.filter((friend) => selectedSquadIds.includes(friend.id)),
    [friendsList, selectedSquadIds]
  );
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
    const { data: profilesData } = await supabase
      .from('profiles')
      .select('id,username')
      .in('id', idList)
      .order('username', { ascending: true });

    const mapped = (profilesData ?? []).map((p: any) => ({ id: p.id as string, username: p.username as string }));
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

    const requesterIds = rows.map((r: any) => r.requester_id);
    const { data: requesterProfiles } = await supabase
      .from('profiles')
      .select('id,username')
      .in('id', requesterIds);

    const lookup: Record<string, string> = {};
    (requesterProfiles ?? []).forEach((p: any) => {
      lookup[p.id] = p.username;
    });

    setPendingRequests(
      rows.map((r: any) => ({
        id: r.id,
        requester_id: r.requester_id,
        username: lookup[r.requester_id] ?? 'Unknown'
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

    const inviterIds = rows.map((invite: any) => invite.from_user_id);
    const { data: inviterProfiles, error: inviterError } = await supabase
      .from('profiles')
      .select('id,username')
      .in('id', inviterIds);

    if (inviterError) {
      throw inviterError;
    }

    const inviterLookup: Record<string, string> = {};
    (inviterProfiles ?? []).forEach((profile: any) => {
      inviterLookup[profile.id] = profile.username;
    });

    setPendingLobbyInvites(
      rows.map((invite: any) => ({
        id: invite.id,
        lobby_id: invite.lobby_id,
        lobby_name: invite.lobbies?.name ?? 'Squad Lobby',
        from_user_id: invite.from_user_id,
        from_username: inviterLookup[invite.from_user_id] ?? 'Unknown',
        password_required: !!invite.lobbies?.password_required,
      }))
    );
  };

  const handleFriendRequest = async (request: { id: number; requester_id: string }, action: 'accept' | 'ignore' | 'block') => {
    if (!user?.id) return;

    if (action === 'accept') {
      await supabase.from('friend_requests').update({ status: 'accepted' }).eq('id', request.id).eq('target_id', user.id);
      await supabase.from('friends').upsert([
        { user_id: user.id, friend_id: request.requester_id },
        { user_id: request.requester_id, friend_id: user.id }
      ]);
      addToast('Friend request accepted', 'success');
    }

    if (action === 'ignore') {
      await supabase.from('friend_requests').update({ status: 'ignored' }).eq('id', request.id).eq('target_id', user.id);
      addToast('Friend request ignored', 'info');
    }

    if (action === 'block') {
      await supabase.from('friend_requests').update({ status: 'blocked' }).eq('id', request.id).eq('target_id', user.id);
      await supabase.from('blocked_users').upsert({ user_id: user.id, blocked_user_id: request.requester_id });
      addToast('User blocked', 'info');
    }

    await Promise.all([loadPendingRequests(), loadFriends()]);
  };

  const sendFriendRequest = async () => {
    const username = addFriendUsername.trim();
    if (!username || !user?.id) return;

    const { data: target } = await supabase
      .from('profiles')
      .select('id,username')
      .eq('username', username)
      .neq('id', user.id)
      .maybeSingle();

    if (!target?.id) {
      addToast('User not found', 'error');
      return;
    }

    const { error } = await supabase.from('friend_requests').upsert({
      requester_id: user.id,
      target_id: target.id,
      status: 'pending'
    }, { onConflict: 'requester_id,target_id' });

    if (error) {
      addToast('Unable to send friend request', 'error');
      return;
    }

    await supabase.from('notifications').insert({
      user_id: target.id,
      notice_type: 'friend_request',
      title: 'Friend Request',
      body: user.username + ' sent you a friend request',
      link_target: '/squad-hub',
      is_read: false,
      metadata: {}
    });

    setAddFriendUsername('');
    addToast('Friend request sent', 'success');
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
        onOpenBattlefield?.();
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

  const toggleSquadMember = (friendId: string) => {
    setSelectedSquadIds((current) => {
      if (current.includes(friendId)) {
        return current.filter((id) => id !== friendId);
      }

      if (current.length >= 4) {
        addToast('You can only stage up to 4 friends for a 5-player squad.', 'info');
        return current;
      }

      return [...current, friendId];
    });
  };

  const startQueue = async (mode: 'solo' | 'squad') => {
    if (!user?.id) return;
    if (mode === 'squad' && selectedSquadIds.length === 0) {
      addToast('Select at least one friend before searching as a squad.', 'error');
      return;
    }

    try {
      setQueuedMode(mode);

      if (mode === 'solo') {
        const openQueues = await fetchOpenMatchmakingLobbies(accountMode);
        const joinableQueue = openQueues.find((lobby) => {
          const memberCount = (lobby.lobby_members || []).filter((member) => !member.left_at && !member.kicked_at).length;
          return lobby.kind === 'public' && memberCount < lobby.max_players;
        });

        if (joinableQueue) {
          await joinMatchmakingLobby(joinableQueue.id);
          addToast('Joined an open public matchmaking queue.', 'success');
        } else {
          await createMatchmakingLobby({
            mode: accountMode,
            kind: 'public',
            name: `CS2 ${accountMode === 'demo' ? 'Demo' : 'Live'} Solo Queue`,
            teamSize: 5,
            gameMode: 'competitive',
            stakeAmount: 0,
          });
          addToast('Created a new public solo queue.', 'success');
        }
      } else {
        const lobbyId = await createMatchmakingLobby({
          mode: accountMode,
          kind: 'public',
          name: `${user.username || 'Squad'} CS2 Queue`,
          teamSize: 5,
          gameMode: 'competitive',
          stakeAmount: 0,
        });

        if (selectedSquadIds.length) {
          await supabase.from('lobby_invites').insert(
            selectedSquadIds.map((friendId) => ({
              lobby_id: lobbyId,
              from_user_id: user.id,
              to_user_id: friendId,
              status: 'pending'
            }))
          );

          await supabase.from('notifications').insert(
            selectedSquadIds.map((friendId) => ({
              user_id: friendId,
              notice_type: 'lobby_invite',
              title: 'Squad Match Invite',
              body: `${user.username} invited you to join a CS2 squad queue.`,
              link_target: '/squad-hub',
              metadata: { lobby_id: lobbyId, inviter_id: user.id }
            }))
          );
        }

        addToast(`Created a squad queue and sent ${selectedSquadIds.length} invite${selectedSquadIds.length === 1 ? '' : 's'}.`, 'success');
      }

      onOpenBattlefield?.();
    } catch (error: any) {
      console.error('Failed to start queue:', error);
      setQueuedMode(null);
      addToast(error?.message || 'Failed to start matchmaking queue.', 'error');
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
  }, [user?.id]);

  useEffect(() => {
    void loadThread(selectedFriendId);
  }, [selectedFriendId, user?.id]);

  const loadUnreadCounts = async () => {
    if (!user?.id) return;

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
  };

  const loadThread = async (friendId: string | null) => {
    if (!user?.id || !friendId) {
      setThreadMessages([]);
      return;
    }

    const condition =
      'and(sender_id.eq.' + user.id + ',receiver_id.eq.' + friendId + '),and(sender_id.eq.' + friendId + ',receiver_id.eq.' + user.id + ')';

    const { data } = await supabase
      .from('direct_messages')
      .select('id,sender_id,receiver_id,message,message_type,metadata,created_at')
      .or(condition)
      .order('created_at', { ascending: true })
      .limit(200);

    setThreadMessages((data ?? []) as any);

    await supabase
      .from('direct_messages')
      .update({ is_read: true })
      .eq('receiver_id', user.id)
      .eq('sender_id', friendId)
      .eq('is_read', false);

    await loadUnreadCounts();
  };

  const sendMessage = async () => {
    const text = messageDraft.trim();
    if (!text || !selectedFriendId || !user?.id) return;

    const { error } = await supabase.from('direct_messages').insert({
      sender_id: user.id,
      receiver_id: selectedFriendId,
      message: text,
      message_type: 'text',
      metadata: {}
    });

    if (error) {
      addToast('Failed to send message', 'error');
      return;
    }

    setMessageDraft('');
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h3 className="text-2xl font-display font-bold uppercase tracking-tight">Squad Hub</h3>
          <p className="text-sm text-esport-text-muted">Build your squad, stage solo or party matchmaking, and manage DMs and friend requests.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <div className="esport-card p-5 space-y-4">
          <div className="text-[10px] font-bold uppercase tracking-widest text-esport-accent">Solo Queue</div>
          <div className="rounded-xl border border-esport-border bg-white/5 p-4">
            <div className="text-sm font-bold text-white">Search alone</div>
            <div className="text-xs text-esport-text-muted mt-1">Jump into matchmaking with only your own profile staged.</div>
            <div className="mt-4 flex items-center justify-between">
              <div className="text-[10px] uppercase tracking-widest text-esport-text-muted">Players ready</div>
              <div className="text-sm font-bold text-white">1 / 1</div>
            </div>
          </div>
          <button onClick={() => startQueue('solo').catch((err) => console.error(err))} className="esport-btn-primary w-full">
            {queuedMode === 'solo' ? 'Solo Queue Staged' : 'Search Solo Match'}
          </button>
        </div>

        <div className="esport-card p-5 space-y-4">
          <div className="text-[10px] font-bold uppercase tracking-widest text-esport-accent">Squad Queue</div>
          <div className="rounded-xl border border-esport-border bg-white/5 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-bold text-white">Invite your friends</div>
                <div className="text-xs text-esport-text-muted mt-1">Stage up to 4 friends and enter matchmaking as a squad.</div>
              </div>
              <div className="text-sm font-bold text-white">{selectedSquadIds.length + 1} / 5</div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {friendsList.length === 0 ? (
                <div className="text-xs text-esport-text-muted col-span-full">No friends available yet. Add friends below to build your squad.</div>
              ) : (
                friendsList.map((friend) => {
                  const selected = selectedSquadIds.includes(friend.id);
                  return (
                    <button
                      key={friend.id}
                      onClick={() => toggleSquadMember(friend.id)}
                      className={cn(
                        "rounded-lg border px-3 py-2 text-left transition-all",
                        selected
                          ? "border-esport-accent bg-esport-accent/10"
                          : "border-esport-border bg-black/20 hover:border-white/30"
                      )}
                    >
                      <div className="font-bold text-sm text-white">{friend.username}</div>
                      <div className="text-[10px] uppercase tracking-widest text-esport-text-muted">
                        {selected ? 'Selected' : 'Available'}
                      </div>
                    </button>
                  );
                })
              )}
            </div>
            {selectedSquadFriends.length > 0 && (
              <div className="rounded-lg border border-esport-border bg-black/20 px-3 py-3">
                <div className="text-[10px] uppercase tracking-widest text-esport-text-muted mb-2">Current squad</div>
                <div className="flex flex-wrap gap-2">
                  <span className="px-2 py-1 rounded bg-esport-accent/20 text-white text-xs font-bold">{user?.username || 'You'} (Leader)</span>
                  {selectedSquadFriends.map((friend) => (
                    <span key={friend.id} className="px-2 py-1 rounded bg-white/10 text-white text-xs font-bold">{friend.username}</span>
                  ))}
                </div>
              </div>
            )}
          </div>
          <button onClick={() => startQueue('squad').catch((err) => console.error(err))} className="esport-btn-primary w-full">
            {queuedMode === 'squad' ? 'Squad Queue Staged' : 'Search Squad Match'}
          </button>
        </div>
      </div>

      <div className="esport-card p-4">
        <div className="text-[10px] font-bold uppercase tracking-widest text-esport-text-muted mb-3">Add Friend</div>
        <div className="flex gap-2">
          <input
            value={addFriendUsername}
            onChange={(e) => setAddFriendUsername(e.target.value)}
            placeholder="Enter exact username"
            className="flex-1 bg-white/5 border border-esport-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-esport-accent/50"
          />
          <button onClick={() => sendFriendRequest().catch((err) => console.error(err))} className="esport-btn-primary">Send Request</button>
        </div>
      </div>

      {pendingRequests.length ? (
        <div className="esport-card p-4">
          <div className="text-[10px] font-bold uppercase tracking-widest text-esport-text-muted mb-3">Friend Requests</div>
          <div className="space-y-2">
            {pendingRequests.map((req) => (
              <div key={req.id} className="p-3 rounded-lg border border-esport-border bg-white/5 flex items-center justify-between gap-3">
                <div className="text-sm"><span className="font-bold">{req.username}</span> sent you a friend request</div>
                <div className="flex gap-2">
                  <button className="esport-btn-primary" onClick={() => handleFriendRequest(req, 'accept').catch((err) => console.error(err))}>Accept</button>
                  <button className="esport-btn-secondary" onClick={() => handleFriendRequest(req, 'ignore').catch((err) => console.error(err))}>Ignore</button>
                  <button className="esport-btn-secondary" onClick={() => handleFriendRequest(req, 'block').catch((err) => console.error(err))}>Block</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {pendingLobbyInvites.length ? (
        <div className="esport-card p-4">
          <div className="text-[10px] font-bold uppercase tracking-widest text-esport-text-muted mb-3">Squad Invites</div>
          <div className="space-y-2">
            {pendingLobbyInvites.map((invite) => (
              <div key={invite.id} className="p-3 rounded-lg border border-esport-border bg-white/5 flex items-center justify-between gap-3">
                <div className="text-sm">
                  <span className="font-bold">{invite.from_username}</span> invited you to join <span className="font-bold">{invite.lobby_name}</span>
                </div>
                <div className="flex gap-2">
                  <button className="esport-btn-primary" onClick={() => handleLobbyInvite(invite, 'accept').catch((err) => console.error(err))}>Join</button>
                  <button className="esport-btn-secondary" onClick={() => handleLobbyInvite(invite, 'ignore').catch((err) => console.error(err))}>Ignore</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {loading ? (
        <div className="esport-card p-12 text-center animate-shimmer">Loading chats...</div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-6">
          <div className="esport-card p-4">
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
                      className={'w-full text-left p-3 rounded-lg border transition-all ' + (active ? 'border-esport-accent bg-esport-accent/10' : 'border-esport-border hover:border-white/30 hover:bg-white/5')}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="font-bold text-sm truncate">{friend.username}</div>
                        {unread > 0 ? (
                          <span className="min-w-[20px] h-5 px-1 bg-esport-danger text-white text-[10px] font-bold rounded-full flex items-center justify-center">
                            {unread > 99 ? '99+' : unread}
                          </span>
                        ) : null}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <div className="esport-card p-0 overflow-hidden flex flex-col min-h-[520px]">
            <div className="px-4 py-3 border-b border-esport-border flex items-center justify-between">
              <div>
                <div className="text-xs font-bold uppercase tracking-widest text-esport-text-muted">Direct Messages</div>
                <div className="text-sm font-bold text-white">{selectedFriend?.username ?? 'Select a friend'}</div>
              </div>
            </div>

            <div className="flex-1 p-4 overflow-y-auto custom-scrollbar space-y-3 bg-black/10">
              {!selectedFriend ? (
                <div className="text-sm text-esport-text-muted">Choose a friend from the left to open your chat.</div>
              ) : threadMessages.length === 0 ? (
                <div className="text-sm text-esport-text-muted">No messages yet. Say hi.</div>
              ) : (
                threadMessages.map((msg) => {
                  const mine = msg.sender_id === user?.id;
                  const isInvite = msg.message_type === 'game_invite';
                  return (
                    <div key={msg.id} className={'flex ' + (mine ? 'justify-end' : 'justify-start')}>
                      <div className={'max-w-[75%] px-3 py-2 rounded-xl text-sm ' + (mine ? 'bg-esport-accent text-white' : 'bg-white/10 text-white border border-esport-border')}>
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
                  );
                })
              )}
            </div>

            <div className="p-3 border-t border-esport-border flex items-center gap-2">
              <input
                value={messageDraft}
                onChange={(e) => setMessageDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    sendMessage().catch((err) => console.error(err));
                  }
                }}
                placeholder={selectedFriend ? ('Message ' + selectedFriend.username + '...') : 'Select a friend first'}
                disabled={!selectedFriend}
                className="flex-1 bg-white/5 border border-esport-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-esport-accent/50 disabled:opacity-50"
              />
              <button
                onClick={() => sendMessage().catch((err) => console.error(err))}
                disabled={!selectedFriend || !messageDraft.trim()}
                className="esport-btn-primary disabled:opacity-40"
              >
                Send
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
