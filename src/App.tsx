/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { motion, AnimatePresence } from "motion/react";
import { 
  Search, 
  Users, 
  Trophy, 
  Activity, 
  PlayCircle, 
  Zap, 
  Shield, 
  Target, 
  ShoppingBag, 
  Crown, 
  Bell, 
  MessageSquare, 
  Settings,
  Plus,
  Star,
  Sword,
  X,
  CheckCircle2,
  AlertCircle,
  LayoutDashboard,
  LogOut,
  ShieldAlert,
  Wallet,
} from "lucide-react";
import React, { useEffect, useRef, useState } from "react";
import hustleArenaLogo from "./assets/hustle-arena-logo.png";
import { auth, signOut } from "./firebase";
import { isSupabaseConfigured } from "./lib/env";
import { fetchMyReconnectableMatch, launchMatchServer, type ReconnectableMatch } from "./lib/supabase/matchmaking";
import type { Toast } from "./features/types";
import {
  AdminPanel,
  ApexListView,
  AuthForm,
  BattlefieldView,
  DashboardView,
  DepositPage,
  HustlePrimeView,
  KYCForm,
  LandingPage,
  MissionsView,
  NeuralMapView,
  PulseView,
  SidebarItem,
  SquadHubView,
  SyndicatesView,
  UserProfileView,
  VaultView,
} from "./features/app-sections";
import { usePlatformSession } from "./features/use-platform-session";

// --- Main App Component ---
export default function App() {
  const [view, setView] = useState<"landing" | "dashboard" | "admin">("landing");
  const [activeTab, setActiveTab] = useState("Dashboard");
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalContent, setModalContent] = useState<{title: string, body: React.ReactNode} | null>(null);
  const [reconnectMatch, setReconnectMatch] = useState<ReconnectableMatch | null>(null);
  const {
    isLoggedIn,
    isAdmin,
    user,
    stats,
    wallet,
    accountMode,
    visibleBalance,
    profileData,
    setProfileData,
    switchAccountMode,
    topUpDemoBalance,
    refreshSession,
  } = usePlatformSession();
  const previousUserIdRef = useRef<string | null>(null);

  const addToast = (message: string, type: 'success' | 'error' | 'info' = 'info') => {
    const id = Date.now();
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 3000);
  };

  const openModal = (title: string, body: React.ReactNode) => {
    console.log("Opening modal:", title);
    setModalContent({ title, body });
    setIsModalOpen(true);
  };

  const menuItems = [
    { id: "Dashboard", icon: <LayoutDashboard size={20} />, label: "Dashboard" },
    { id: "Battlefield", icon: <Sword size={20} />, label: "Battlefield" },
    { id: "Squad Hub", icon: <Users size={20} />, label: "Squad Hub" },
    { id: "Apex List", icon: <Trophy size={20} />, label: "Apex List" },
    { id: "Neural Map", icon: <Activity size={20} />, label: "Neural Map" },
    { id: "Live Matches TV", icon: <PlayCircle size={20} />, label: "Live Matches TV" },
    { id: "Pulse", icon: <Zap size={20} />, label: "Pulse" },
    { id: "Deposit", icon: <Wallet size={20} />, label: "Deposit", highlight: true },
  ];

  const collectiveItems = [
    { id: "Syndicates", icon: <Shield size={20} />, label: "Syndicates" },
    { id: "Missions", icon: <Target size={20} />, label: "Missions" },
    { id: "Vault", icon: <ShoppingBag size={20} />, label: "Vault" },
    { id: "Hustle Prime", icon: <Crown size={20} />, label: "Hustle Prime", highlight: true },
  ];

  useEffect(() => {
    if (user) {
      setView("dashboard");
      if (previousUserIdRef.current !== user.id) {
        addToast(`Welcome back, ${user.username}!`, "success");
      }
      previousUserIdRef.current = user.id;
      setIsModalOpen(false);
      return;
    }

    previousUserIdRef.current = null;
    setView("landing");
  }, [user]);

  useEffect(() => {
    if (!user || !isSupabaseConfigured()) {
      setReconnectMatch(null);
      return;
    }

    let isCancelled = false;

    const loadReconnectableMatch = async () => {
      try {
        const match = await fetchMyReconnectableMatch();
        if (!isCancelled) {
          setReconnectMatch(match);
        }
      } catch (error) {
        console.error("Failed to load reconnectable match:", error);
      }
    };

    void loadReconnectableMatch();
    const interval = window.setInterval(() => {
      void loadReconnectableMatch();
    }, 5000);

    return () => {
      isCancelled = true;
      window.clearInterval(interval);
    };
  }, [user?.id]);

  const handleLogout = async () => {
    await signOut(auth);
    addToast("Logged out successfully", "info");
  };

  return (
    <div className="min-h-screen bg-esport-bg text-white font-sans">
      {view === "landing" ? (
        <LandingPage onLogin={() => openModal("Access Arena", <AuthForm onLogin={() => undefined} />)} />
      ) : (
        <div className="flex h-screen overflow-hidden">
          {/* Sidebar */}
          <aside className="w-64 bg-esport-sidebar flex flex-col border-r border-esport-border z-40 shrink-0">
            <div className="p-6">
              <div className="flex items-center gap-3 group cursor-pointer" onClick={() => setView("dashboard")}>
                <div className="flex items-center gap-3 h-12">
                  <img
                    src={hustleArenaLogo}
                    alt="Hustle Arena"
                    className="h-full w-12 rounded-lg object-cover border border-esport-border"
                  />
                  <span className="font-display font-bold text-xl tracking-wider text-white">Hustle-Arena</span>
                </div>
              </div>
            </div>

            <nav className="flex-1 overflow-y-auto custom-scrollbar px-3 space-y-8 py-4">
              {isAdmin && (
                <div>
                  <div className="px-4 mb-3 text-[10px] font-bold text-esport-secondary uppercase tracking-[0.2em]">Administration</div>
                  <div className="space-y-1">
                    <SidebarItem 
                      icon={<Shield size={20} />} 
                      label="Admin Panel" 
                      active={activeTab === "Admin"} 
                      onClick={() => setActiveTab("Admin")} 
                      highlight
                    />
                  </div>
                </div>
              )}

              <div>
                <div className="px-4 mb-3 text-[10px] font-bold text-esport-text-muted uppercase tracking-[0.2em]">Navigation</div>
                <div className="space-y-1">
                  {menuItems.map(item => (
                    <SidebarItem 
                      key={item.id} 
                      {...item} 
                      active={activeTab === item.id} 
                      onClick={() => setActiveTab(item.id)} 
                    />
                  ))}
                </div>
              </div>

              <div>
                <div className="px-4 mb-3 text-[10px] font-bold text-esport-text-muted uppercase tracking-[0.2em]">Collective</div>
                <div className="space-y-1">
                  {collectiveItems.map(item => (
                    <SidebarItem 
                      key={item.id} 
                      {...item} 
                      active={activeTab === item.id} 
                      onClick={() => setActiveTab(item.id)} 
                    />
                  ))}
                </div>
              </div>
            </nav>

            <div className="p-4 border-t border-esport-border bg-black/20">
              <div className="flex items-center gap-3 p-2 rounded-xl hover:bg-white/5 cursor-pointer group transition-all" onClick={() => setActiveTab("Profile")}>
                <div className="relative">
                  <img src="https://ui-avatars.com/api/?name=Pro&background=random" className="w-10 h-10 rounded-full border-2 border-esport-accent group-hover:border-white transition-colors" />
                  <div className="absolute -bottom-1 -right-1 w-4 h-4 bg-esport-success border-2 border-esport-sidebar rounded-full" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-bold truncate">{user?.username || "CyberGhost_99"}</div>
                  <div className="flex items-center gap-2">
                  <div className="text-[10px] text-esport-accent font-bold uppercase tracking-wider">Level {stats?.level || 0}</div>
                  <div className={`text-[8px] px-1.5 py-0.5 border rounded uppercase font-bold ${accountMode === "demo" ? "bg-esport-secondary/20 text-esport-secondary border-esport-secondary/30" : "bg-esport-success/20 text-esport-success border-esport-success/30"}`}>
                    {accountMode}
                  </div>
                  {!isAdmin && (
                      <button 
                        onClick={() => openModal("KYC Verification", <KYCForm addToast={addToast} user={user} />)}
                        className={`text-[8px] px-1.5 py-0.5 border rounded uppercase font-bold transition-all ${
                          user?.kycStatus === 'verified' ? 'bg-esport-success/20 text-esport-success border-esport-success/30' :
                          user?.kycStatus === 'pending' ? 'bg-esport-accent/20 text-esport-accent border-esport-accent/30' :
                          user?.kycStatus === 'rejected' ? 'bg-esport-danger/20 text-esport-danger border-esport-danger/30' :
                          'bg-esport-secondary/20 text-esport-secondary border-esport-secondary/30 hover:bg-esport-secondary hover:text-white'
                        }`}
                      >
                        {user?.kycStatus === 'verified' ? 'Verified' : 
                         user?.kycStatus === 'pending' ? 'Pending' : 
                         user?.kycStatus === 'rejected' ? 'Rejected' : 
                         'Verify KYC'}
                      </button>
                    )}
                  </div>
                </div>
                <div className="flex gap-2">
                  <Settings size={16} className="text-esport-text-muted hover:text-white transition-colors" />
                  <LogOut size={16} className="text-esport-text-muted hover:text-esport-danger transition-colors" onClick={handleLogout} />
                </div>
              </div>
            </div>
          </aside>

          {/* Main Content */}
          <main className="flex-1 flex flex-col overflow-hidden relative">
            <header className="glass-header h-16 flex items-center justify-between px-8 shrink-0">
              <div className="flex items-center gap-8">
                <h2 className="text-xl font-display font-bold uppercase tracking-tight">{activeTab}</h2>
                <div className="hidden md:flex items-center gap-2 bg-white/5 border border-esport-border rounded-lg px-3 py-1.5 group focus-within:border-esport-accent/50 transition-all">
                  <Search size={16} className="text-esport-text-muted group-focus-within:text-esport-accent" />
                  <input type="text" placeholder="Search tournaments, players..." className="bg-transparent border-none outline-none text-sm w-64" />
                </div>
              </div>

              <div className="flex items-center gap-4">
                {reconnectMatch && (
                  <button
                    onClick={() => {
                      setActiveTab("Battlefield");
                      try {
                        launchMatchServer(reconnectMatch.dedicated_server_endpoint);
                      } catch (error: any) {
                        addToast(error?.message || "Reconnect endpoint is not available yet.", "error");
                      }
                    }}
                    className="flex items-center gap-2 px-4 py-1.5 bg-esport-accent/10 border border-esport-accent/30 rounded-full text-xs font-bold uppercase tracking-wider text-esport-accent hover:bg-esport-accent/20 transition-colors"
                  >
                    <PlayCircle size={14} />
                    Reconnect To Match
                  </button>
                )}
                <div className="flex items-center gap-3 px-4 py-1.5 bg-white/5 border border-esport-border rounded-full hover:bg-white/10 transition-colors cursor-pointer">
                  <div className="w-5 h-5 bg-esport-secondary rounded-full flex items-center justify-center">
                    <Star size={12} className="text-white fill-white" />
                  </div>
                  <span className="text-xs font-bold">
                    {accountMode === "demo" ? "Demo Balance" : "Live Balance"} {visibleBalance.toLocaleString()} USDT
                  </span>
                  <Plus size={14} className="text-esport-text-muted" />
                </div>
                
                <button className="relative p-2 text-esport-text-muted hover:text-white transition-colors">
                  <Bell size={20} />
                  <span className="absolute top-2 right-2 w-2 h-2 bg-esport-danger rounded-full ring-2 ring-esport-bg" />
                </button>
                
                <button className="p-2 text-esport-text-muted hover:text-white transition-colors">
                  <MessageSquare size={20} />
                </button>
              </div>
            </header>

            <div className="flex-1 overflow-y-auto custom-scrollbar relative">
              {isLoggedIn && !isAdmin && accountMode === "live" && user?.email?.toLowerCase() !== "danielnotexist@gmail.com" && user?.kycStatus !== 'verified' && (
                <div className="sticky top-0 z-[30] bg-esport-accent/10 border-b border-esport-accent/30 backdrop-blur-md p-3 flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-esport-accent/20 rounded-full flex items-center justify-center">
                      <ShieldAlert size={16} className="text-esport-accent" />
                    </div>
                    <div>
                      <div className="text-xs font-bold uppercase tracking-wider text-white">KYC Verification Required</div>
                      <p className="text-[10px] text-esport-text-muted">Verify your identity to unlock live-stakes matchmaking and other premium features. Demo mode stays available without KYC.</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    {user?.kycStatus === 'pending' && (
                      <span className="text-[10px] font-bold text-esport-accent uppercase tracking-widest bg-esport-accent/10 px-3 py-1 rounded-full border border-esport-accent/30">
                        Review Pending
                      </span>
                    )}
                    <button 
                      onClick={() => openModal("KYC Verification", <KYCForm addToast={addToast} user={user} />)}
                      className="px-4 py-1.5 bg-esport-accent text-esport-bg text-[10px] font-bold uppercase tracking-widest rounded-lg hover:scale-105 transition-all shadow-[0_0_15px_rgba(0,243,255,0.3)]"
                    >
                      {user?.kycStatus === 'rejected' ? 'Re-verify Now' : user?.kycStatus === 'pending' ? 'Update Info' : 'Verify Now'}
                    </button>
                  </div>
                </div>
              )}
              <div className="max-w-[1400px] mx-auto p-8">
                <AnimatePresence mode="wait">
                  <motion.div
                    key={activeTab}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    transition={{ duration: 0.2 }}
                  >
                    {activeTab === "Admin" && isAdmin && <AdminPanel addToast={addToast} />}
                    {activeTab === "Deposit" && <DepositPage addToast={addToast} user={user} />}
                    {activeTab === "Profile" && (
                      <UserProfileView
                        user={user}
                        stats={stats}
                        wallet={wallet}
                        accountMode={accountMode}
                        profileData={profileData}
                        setProfileData={setProfileData}
                        switchAccountMode={switchAccountMode}
                        topUpDemoBalance={topUpDemoBalance}
                        addToast={addToast}
                        openModal={openModal}
                      />
                    )}
                    {activeTab === "Battlefield" && <BattlefieldView addToast={addToast} openModal={openModal} user={user} accountMode={accountMode} refreshSession={refreshSession} />}
                    {activeTab === "Squad Hub" && <SquadHubView addToast={addToast} user={user} />}
                    {activeTab === "Apex List" && <ApexListView />}
                    {activeTab === "Neural Map" && <NeuralMapView stats={stats} />}
                    {activeTab === "Missions" && <MissionsView addToast={addToast} />}
                    {activeTab === "Vault" && <VaultView addToast={addToast} />}
                    {activeTab === "Pulse" && <PulseView />}
                    {activeTab === "Syndicates" && <SyndicatesView />}
                    {activeTab === "Hustle Prime" && <HustlePrimeView />}
                    {activeTab === "Dashboard" && <DashboardView stats={stats} />}
                  </motion.div>
                </AnimatePresence>
              </div>
            </div>
          </main>
        </div>
      )}

      {/* Toast System */}
      <div className="fixed bottom-8 right-8 z-[100] flex flex-col gap-3">
        <AnimatePresence>
          {toasts.map(toast => (
            <motion.div
              key={toast.id}
              initial={{ opacity: 0, x: 50, scale: 0.9 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9, transition: { duration: 0.2 } }}
              className={`flex items-center gap-3 p-4 rounded-xl shadow-2xl border min-w-[300px] ${
                toast.type === 'success' ? 'bg-esport-success/10 border-esport-success/50 text-esport-success' :
                toast.type === 'error' ? 'bg-esport-danger/10 border-esport-danger/50 text-esport-danger' :
                'bg-esport-accent/10 border-esport-accent/50 text-esport-accent'
              }`}
            >
              {toast.type === 'success' ? <CheckCircle2 size={20} /> : <AlertCircle size={20} />}
              <span className="text-sm font-bold text-white">{toast.message}</span>
              <button onClick={() => setToasts(prev => prev.filter(t => t.id !== toast.id))} className="ml-auto opacity-50 hover:opacity-100">
                <X size={16} />
              </button>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {/* Modal System */}
      <AnimatePresence>
        {isModalOpen && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsModalOpen(false)}
              className="absolute inset-0 bg-black/80 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="esport-card w-full max-w-lg relative z-10 overflow-hidden"
            >
              <div className="p-6 border-b border-esport-border flex items-center justify-between">
                <h3 className="text-xl font-display font-bold uppercase">{modalContent?.title}</h3>
                <button onClick={() => setIsModalOpen(false)} className="p-2 hover:bg-white/5 rounded-lg transition-colors">
                  <X size={20} />
                </button>
              </div>
              <div className="p-8">
                {modalContent?.body}
              </div>
              <div className="p-6 bg-black/20 border-t border-esport-border flex justify-end gap-3">
                <button onClick={() => setIsModalOpen(false)} className="esport-btn-secondary px-8">Cancel</button>
                <button 
                  onClick={() => {
                    addToast("Action confirmed!", "success");
                    setIsModalOpen(false);
                  }} 
                  className="esport-btn-primary px-8"
                >
                  Confirm
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

// --- Sub-Components ---

