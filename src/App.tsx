/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { GoogleGenAI } from "@google/genai";
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
  ChevronRight,
  Plus,
  Star,
  Sword,
  Filter,
  MoreVertical,
  User,
  X,
  CheckCircle2,
  AlertCircle,
  TrendingUp,
  Clock,
  MapPin,
  Gamepad2,
  LayoutDashboard,
  LogOut,
  ChevronDown
} from "lucide-react";
import React, { useState, useEffect, useMemo } from "react";
import { supabase } from "./lib/supabase";

// --- Types ---
interface UserStats {
  credits: number;
  level: number;
  rank: string;
  winRate: string;
  kdRatio: number;
  headshotPct: string;
}

interface Mission {
  id: number;
  title: string;
  reward: number;
  difficulty: string;
  time: string;
}

interface Toast {
  id: number;
  message: string;
  type: 'success' | 'error' | 'info';
}

// --- Main App Component ---
export default function App() {
  const [view, setView] = useState<"landing" | "dashboard" | "admin">("landing");
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [user, setUser] = useState<any>(null);
  const [activeTab, setActiveTab] = useState("Dashboard");
  const [stats, setStats] = useState<UserStats | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalContent, setModalContent] = useState<{title: string, body: React.ReactNode} | null>(null);

  // Fetch initial stats
  useEffect(() => {
    const checkSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        handleLogin(session.user);
      }
    };
    checkSession();
  }, []);

  useEffect(() => {
    if (isLoggedIn) {
      // For now, keep mock stats or fetch from Supabase if table exists
      // fetch("/api/user/stats")
      setStats({
        credits: 2450,
        level: 42,
        rank: "Diamond III",
        winRate: "64.5%",
        kdRatio: 1.42,
        headshotPct: "52.1%"
      });
    }
  }, [isLoggedIn]);

  const addToast = (message: string, type: 'success' | 'error' | 'info' = 'info') => {
    const id = Date.now();
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 3000);
  };

  const openModal = (title: string, body: React.ReactNode) => {
    setModalContent({ title, body });
    setIsModalOpen(true);
  };

  const menuItems = [
    { id: "Dashboard", icon: <LayoutDashboard size={20} />, label: "Dashboard" },
    { id: "Battlefield", icon: <Sword size={20} />, label: "Battlefield" },
    { id: "Squad Hub", icon: <Users size={20} />, label: "Squad Hub" },
    { id: "Apex List", icon: <Trophy size={20} />, label: "Apex List" },
    { id: "Neural Map", icon: <Activity size={20} />, label: "Neural Map" },
    { id: "Nexus TV", icon: <PlayCircle size={20} />, label: "Nexus TV" },
    { id: "Pulse", icon: <Zap size={20} />, label: "Pulse" },
  ];

  const collectiveItems = [
    { id: "Syndicates", icon: <Shield size={20} />, label: "Syndicates" },
    { id: "Missions", icon: <Target size={20} />, label: "Missions" },
    { id: "Vault", icon: <ShoppingBag size={20} />, label: "Vault" },
    { id: "Neon Prime", icon: <Crown size={20} />, label: "Neon Prime", highlight: true },
  ];

  const handleLogin = (userData: any) => {
    setIsLoggedIn(true);
    // Map Supabase user metadata or use defaults
    const userProfile = {
      id: userData.id,
      username: userData.user_metadata?.username || userData.email?.split('@')[0] || "Player",
      email: userData.email,
      role: userData.user_metadata?.role || "user",
      kycStatus: userData.user_metadata?.kycStatus || "none"
    };
    setIsAdmin(userProfile.role === "admin");
    setUser(userProfile);
    setView("dashboard");
    addToast(`Welcome back, ${userProfile.username}!`, "success");
    setIsModalOpen(false);
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setIsLoggedIn(false);
    setIsAdmin(false);
    setUser(null);
    setView("landing");
    addToast("Logged out successfully", "info");
  };

  if (view === "landing") {
    return <LandingPage onLogin={() => openModal("Access Arena", <AuthForm onLogin={handleLogin} />)} />;
  }

  return (
    <div className="flex h-screen bg-esport-bg text-white overflow-hidden font-sans">
      {/* Sidebar */}
      <aside className="w-64 bg-esport-sidebar flex flex-col border-r border-esport-border z-40 shrink-0">
        <div className="p-6">
          <div className="flex items-center gap-3 group cursor-pointer" onClick={() => setView("dashboard")}>
            <img src="/logo.png" alt="Hustle Arena" className="h-10 w-auto" onError={(e) => e.currentTarget.src = 'https://via.placeholder.com/150x50?text=HUSTLE+ARENA'} />
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
          <div className="flex items-center gap-3 p-2 rounded-xl hover:bg-white/5 cursor-pointer group transition-all">
            <div className="relative">
              <img src="https://picsum.photos/seed/pro/100/100" className="w-10 h-10 rounded-full border-2 border-esport-accent group-hover:border-white transition-colors" />
              <div className="absolute -bottom-1 -right-1 w-4 h-4 bg-esport-success border-2 border-esport-sidebar rounded-full" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-bold truncate">{user?.username || "CyberGhost_99"}</div>
              <div className="flex items-center gap-2">
                <div className="text-[10px] text-esport-accent font-bold uppercase tracking-wider">Level {stats?.level || 0}</div>
                {!isAdmin && (
                  <button 
                    onClick={() => openModal("KYC Verification", <KYCForm addToast={addToast} />)}
                    className="text-[8px] px-1.5 py-0.5 bg-esport-secondary/20 text-esport-secondary border border-esport-secondary/30 rounded uppercase font-bold hover:bg-esport-secondary hover:text-white transition-all"
                  >
                    Verify KYC
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
            <div className="flex items-center gap-3 px-4 py-1.5 bg-white/5 border border-esport-border rounded-full hover:bg-white/10 transition-colors cursor-pointer">
              <div className="w-5 h-5 bg-esport-secondary rounded-full flex items-center justify-center">
                <Star size={12} className="text-white fill-white" />
              </div>
              <span className="text-xs font-bold">{stats?.credits.toLocaleString() || 0} CR</span>
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

        <div className="flex-1 overflow-y-auto custom-scrollbar">
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
                {activeTab === "Battlefield" && <BattlefieldView addToast={addToast} openModal={openModal} />}
                {activeTab === "Squad Hub" && <SquadHubView addToast={addToast} />}
                {activeTab === "Apex List" && <ApexListView />}
                {activeTab === "Neural Map" && <NeuralMapView stats={stats} />}
                {activeTab === "Missions" && <MissionsView addToast={addToast} />}
                {activeTab === "Vault" && <VaultView addToast={addToast} />}
                {activeTab === "Pulse" && <PulseView />}
                {activeTab === "Syndicates" && <SyndicatesView />}
                {activeTab === "Neon Prime" && <NeonPrimeView />}
                {activeTab === "Dashboard" && <DashboardView stats={stats} />}
              </motion.div>
            </AnimatePresence>
          </div>
        </div>
      </main>

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

function SidebarItem({ icon, label, active, onClick, highlight }: any) {
  return (
    <div 
      onClick={onClick}
      className={`sidebar-item ${active ? 'active' : ''} ${highlight ? 'text-esport-secondary hover:text-esport-secondary' : ''}`}
    >
      <div className="shrink-0">{icon}</div>
      <span className="text-sm font-bold tracking-tight">{label}</span>
      {highlight && <div className="ml-auto w-2 h-2 bg-esport-secondary rounded-full shadow-[0_0_8px_rgba(249,115,22,0.6)]" />}
    </div>
  );
}

function DashboardView({ stats }: { stats: UserStats | null }) {
  return (
    <div className="space-y-8">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard label="Win Rate" value={stats?.winRate || "0%"} trend="+2.4%" icon={<TrendingUp size={20} />} color="accent" />
        <StatCard label="K/D Ratio" value={stats?.kdRatio.toString() || "0.0"} trend="+0.12" icon={<Activity size={20} />} color="secondary" />
        <StatCard label="Headshot %" value={stats?.headshotPct || "0%"} trend="-1.2%" icon={<Target size={20} />} color="success" />
        <StatCard label="Active Missions" value="3" trend="Daily" icon={<Clock size={20} />} color="info" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-8">
          <div className="esport-card p-8 relative overflow-hidden">
            <div className="absolute top-0 right-0 p-8 opacity-5">
              <Trophy size={160} />
            </div>
            <h3 className="text-xl font-display font-bold uppercase mb-6 flex items-center gap-2">
              <TrendingUp className="text-esport-accent" size={20} />
              Performance Overview
            </h3>
            <div className="h-64 flex items-end gap-4">
              {[40, 70, 45, 90, 65, 80, 95].map((h, i) => (
                <div key={i} className="flex-1 flex flex-col items-center gap-3 group">
                  <div className="w-full bg-esport-accent/10 rounded-t-lg relative overflow-hidden group-hover:bg-esport-accent/20 transition-all" style={{ height: `${h}%` }}>
                    <motion.div 
                      initial={{ height: 0 }}
                      animate={{ height: '100%' }}
                      transition={{ delay: i * 0.1, duration: 0.5 }}
                      className="absolute bottom-0 left-0 right-0 bg-esport-accent/40"
                    />
                  </div>
                  <span className="text-[10px] font-bold text-esport-text-muted uppercase">Day {i + 1}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="esport-card p-8">
            <h3 className="text-xl font-display font-bold uppercase mb-6">Recent Activity</h3>
            <div className="space-y-4">
              {[1, 2, 3].map(i => (
                <div key={i} className="flex items-center gap-4 p-4 rounded-xl bg-white/5 border border-esport-border hover:border-esport-accent/30 transition-all cursor-pointer group">
                  <div className="w-12 h-12 rounded-lg bg-esport-accent/10 flex items-center justify-center text-esport-accent">
                    <Gamepad2 size={24} />
                  </div>
                  <div className="flex-1">
                    <div className="text-sm font-bold">Competitive Match - Mirage</div>
                    <div className="text-xs text-esport-text-muted">Victory • 16 - 12 • 24 kills</div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-bold text-esport-success">+24 ELO</div>
                    <div className="text-[10px] text-esport-text-muted uppercase">2h ago</div>
                  </div>
                  <ChevronRight size={16} className="text-esport-text-muted group-hover:text-white transition-all" />
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="space-y-8">
          <div className="esport-card p-8 bg-gradient-to-br from-esport-accent/20 to-transparent">
            <Crown className="text-esport-accent mb-4" size={32} />
            <h3 className="text-xl font-display font-bold uppercase mb-2">Neon Prime</h3>
            <p className="text-xs text-esport-text-muted mb-6">Unlock advanced analytics and priority matchmaking.</p>
            <button className="esport-btn-primary w-full">Upgrade Now</button>
          </div>

          <div className="esport-card p-8">
            <h3 className="text-sm font-bold uppercase tracking-widest mb-6">Online Friends</h3>
            <div className="space-y-4">
              {[1, 2, 3, 4].map(i => (
                <div key={i} className="flex items-center gap-3 group cursor-pointer">
                  <div className="relative">
                    <img src={`https://picsum.photos/seed/f${i}/40/40`} className="w-8 h-8 rounded-full" />
                    <div className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 bg-esport-success border-2 border-esport-card rounded-full" />
                  </div>
                  <div className="flex-1">
                    <div className="text-xs font-bold group-hover:text-esport-accent transition-colors">ProPlayer_{i}</div>
                    <div className="text-[9px] text-esport-text-muted uppercase">In Match: Dust II</div>
                  </div>
                  <MessageSquare size={14} className="text-esport-text-muted opacity-0 group-hover:opacity-100 transition-all" />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value, trend, icon, color }: any) {
  const colorMap: any = {
    accent: "text-esport-accent",
    secondary: "text-esport-secondary",
    success: "text-esport-success",
    info: "text-blue-400"
  };

  return (
    <div className="esport-card p-6 esport-card-hover">
      <div className="flex items-center justify-between mb-4">
        <div className={`p-2 rounded-lg bg-white/5 ${colorMap[color]}`}>{icon}</div>
        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full bg-white/5 ${trend.startsWith('+') ? 'text-esport-success' : 'text-esport-danger'}`}>
          {trend}
        </span>
      </div>
      <div className="text-2xl font-display font-bold mb-1">{value}</div>
      <div className="text-[10px] font-bold text-esport-text-muted uppercase tracking-widest">{label}</div>
    </div>
  );
}

function BattlefieldView({ addToast, openModal }: any) {
  const modes = [
    { id: 1, title: "Competitive 5v5", desc: "Standard tactical combat. ELO at stake.", players: "12,450", image: "https://picsum.photos/seed/cs1/600/400" },
    { id: 2, title: "Wingman 2v2", desc: "High-intensity duo combat on small maps.", players: "4,210", image: "https://picsum.photos/seed/cs2/600/400" },
    { id: 3, title: "Nexus Royale", desc: "32-player tactical battle royale.", players: "8,900", image: "https://picsum.photos/seed/cs3/600/400" },
  ];

  return (
    <div className="space-y-12">
      {/* Hero Banner */}
      <div className="relative h-[400px] rounded-3xl overflow-hidden group">
        <img src="https://picsum.photos/seed/hero/1600/800" className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105" />
        <div className="absolute inset-0 bg-gradient-to-t from-esport-bg via-esport-bg/40 to-transparent" />
        <div className="absolute bottom-0 left-0 p-12 max-w-2xl">
          <div className="flex items-center gap-3 mb-4">
            <span className="badge badge-accent">Season 4 Live</span>
            <span className="text-xs font-bold text-white/60 uppercase tracking-widest">Nexus Championship Series</span>
          </div>
          <h2 className="text-5xl font-display font-extrabold uppercase tracking-tighter mb-6 leading-none">
            DOMINATE THE <span className="text-esport-accent italic">BATTLEFIELD</span>
          </h2>
          <div className="flex gap-4">
            <button 
              onClick={() => openModal("Deploy to Combat", <div className="text-center space-y-4">
                <p className="text-esport-text-muted">You are about to enter the matchmaking queue for Competitive 5v5. Estimated wait time: 1:42</p>
                <div className="flex justify-center gap-4 py-4">
                  <div className="w-12 h-12 rounded-full border-4 border-esport-accent border-t-transparent animate-spin" />
                </div>
              </div>)} 
              className="esport-btn-primary px-10 py-4 text-lg"
            >
              <Zap size={20} fill="currentColor" />
              Quick Deploy
            </button>
            <button className="esport-btn-secondary px-10 py-4 text-lg">Browse Events</button>
          </div>
        </div>
      </div>

      {/* Game Modes */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        {modes.map(mode => (
          <div key={mode.id} className="esport-card group overflow-hidden esport-card-hover cursor-pointer">
            <div className="relative h-48 overflow-hidden">
              <img src={mode.image} className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110" />
              <div className="absolute inset-0 bg-black/20 group-hover:bg-black/0 transition-all" />
              <div className="absolute top-4 right-4 flex items-center gap-2 px-2 py-1 bg-black/60 backdrop-blur-md rounded border border-white/10">
                <Users size={12} className="text-esport-accent" />
                <span className="text-[10px] font-bold">{mode.players}</span>
              </div>
            </div>
            <div className="p-6">
              <h4 className="text-lg font-display font-bold uppercase mb-2 group-hover:text-esport-accent transition-colors">{mode.title}</h4>
              <p className="text-xs text-esport-text-muted mb-6 leading-relaxed">{mode.desc}</p>
              <button 
                onClick={(e) => {
                  e.stopPropagation();
                  addToast(`Queuing for ${mode.title}...`, "info");
                }} 
                className="w-full py-3 bg-white/5 border border-esport-border hover:bg-esport-accent hover:border-esport-accent font-bold text-xs uppercase tracking-widest rounded-lg transition-all"
              >
                Enter Queue
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function SquadHubView({ addToast }: any) {
  const squads = [
    { id: 1, name: "Shadow Realm", leader: "imjozeph-", level: 9, members: 4, max: 5, tags: ["Competitive", "Mic Required"] },
    { id: 2, name: "Neon Knights", leader: "K1R0_16", level: 5, members: 2, max: 5, tags: ["Casual", "No Toxicity"] },
    { id: 3, name: "Cyber Strike", leader: "-Gutzz", level: 3, members: 3, max: 5, tags: ["Discord", "EU"] },
  ];

  return (
    <div className="space-y-8">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h3 className="text-2xl font-display font-bold uppercase tracking-tight">Active Squads</h3>
          <p className="text-sm text-esport-text-muted">Find a team and dominate together.</p>
        </div>
        <div className="flex gap-3 w-full md:w-auto">
          <button className="esport-btn-secondary flex-1 md:flex-none"><Filter size={16} /> Filters</button>
          <button onClick={() => addToast("Squad creation opened", "info")} className="esport-btn-primary flex-1 md:flex-none"><Plus size={16} /> Create Squad</button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {squads.map(squad => (
          <div key={squad.id} className="esport-card p-6 esport-card-hover group">
            <div className="flex items-center justify-between mb-6">
              <div className="flex -space-x-3">
                {[1, 2, 3, 4].map(i => (
                  <img key={i} src={`https://picsum.photos/seed/sq${squad.id}${i}/40/40`} className="w-10 h-10 rounded-full border-2 border-esport-card shadow-lg" />
                ))}
                {squad.members < squad.max && (
                  <div className="w-10 h-10 rounded-full border-2 border-dashed border-esport-border flex items-center justify-center bg-black/20 text-esport-text-muted text-xs font-bold">
                    +{squad.max - squad.members}
                  </div>
                )}
              </div>
              <div className="badge badge-accent">LVL {squad.level}</div>
            </div>
            <h4 className="text-lg font-display font-bold uppercase mb-1 group-hover:text-esport-accent transition-colors">{squad.name}</h4>
            <div className="text-xs text-esport-text-muted mb-6 flex items-center gap-2">
              <User size={12} />
              Leader: <span className="text-white font-bold">{squad.leader}</span>
            </div>
            <div className="flex flex-wrap gap-2 mb-8">
              {squad.tags.map(tag => (
                <span key={tag} className="px-2 py-1 bg-white/5 border border-esport-border rounded text-[9px] font-bold uppercase text-esport-text-muted">{tag}</span>
              ))}
            </div>
            <button 
              onClick={() => addToast(`Join request sent to ${squad.name}`, "success")}
              className="w-full py-3 bg-esport-accent/10 border border-esport-accent/30 hover:bg-esport-accent hover:text-white text-esport-accent font-bold text-xs uppercase tracking-widest rounded-lg transition-all"
            >
              Request to Join
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

function ApexListView() {
  const players = [
    { rank: 1, name: "qw1nk1", elo: "5,189", level: 10, winRate: "72%", avatar: "https://picsum.photos/seed/p1/100/100" },
    { rank: 2, name: "fame--", elo: "5,153", level: 10, winRate: "68%", avatar: "https://picsum.photos/seed/p2/100/100" },
    { rank: 3, name: "donk666", elo: "5,061", level: 10, winRate: "70%", avatar: "https://picsum.photos/seed/p3/100/100" },
    { rank: 4, name: "b1st-", elo: "5,060", level: 10, winRate: "65%", avatar: "https://picsum.photos/seed/p4/100/100" },
    { rank: 5, name: "executor", elo: "5,058", level: 10, winRate: "64%", avatar: "https://picsum.photos/seed/p5/100/100" },
  ];

  return (
    <div className="space-y-8">
      <div className="flex justify-between items-end">
        <div>
          <h3 className="text-2xl font-display font-bold uppercase tracking-tight">Apex List</h3>
          <p className="text-sm text-esport-text-muted">The top 1% of Nexus Arena combatants.</p>
        </div>
        <div className="flex gap-2">
          <button className="badge badge-accent">Season 4</button>
          <button className="badge bg-white/10 text-white">Global</button>
        </div>
      </div>

      <div className="esport-card overflow-hidden">
        <div className="grid grid-cols-[80px_1fr_120px_120px_120px] p-6 border-b border-esport-border text-[10px] font-bold uppercase tracking-widest text-esport-text-muted">
          <div className="px-4">Rank</div>
          <div>Player</div>
          <div className="text-center">Win Rate</div>
          <div className="text-center">Level</div>
          <div className="text-right px-4">Combat Rating</div>
        </div>
        <div className="divide-y divide-esport-border">
          {players.map(player => (
            <div key={player.rank} className="grid grid-cols-[80px_1fr_120px_120px_120px] p-6 items-center hover:bg-white/5 transition-colors group cursor-pointer">
              <div className="px-4 font-display font-bold text-2xl italic text-esport-text-muted group-hover:text-esport-accent transition-colors">
                {player.rank === 1 ? <Crown className="text-esport-secondary" size={24} /> : `#${player.rank}`}
              </div>
              <div className="flex items-center gap-4">
                <img src={player.avatar} className="w-10 h-10 rounded-full border-2 border-esport-border group-hover:border-esport-accent transition-colors" />
                <span className="font-bold text-sm group-hover:text-esport-accent transition-colors">{player.name}</span>
              </div>
              <div className="text-center text-xs font-bold text-esport-success">{player.winRate}</div>
              <div className="text-center">
                <span className="badge badge-accent">LVL {player.level}</span>
              </div>
              <div className="text-right px-4 font-mono font-bold text-esport-accent text-lg">{player.elo}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function NeuralMapView({ stats }: { stats: UserStats | null }) {
  return (
    <div className="space-y-8">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 esport-card p-8">
          <h3 className="text-xl font-display font-bold uppercase mb-8 flex items-center gap-2">
            <Activity className="text-esport-accent" size={20} />
            Combat DNA
          </h3>
          <div className="grid md:grid-cols-2 gap-12">
            <div className="relative aspect-square flex items-center justify-center bg-white/5 rounded-full border border-esport-border">
              <div className="absolute inset-0 flex items-center justify-center opacity-10">
                <Target size={200} />
              </div>
              <div className="text-center z-10">
                <div className="text-4xl font-display font-bold text-esport-accent">84.2</div>
                <div className="text-[10px] font-bold text-esport-text-muted uppercase tracking-widest">Efficiency Score</div>
              </div>
              {/* Simple SVG Radar Placeholder */}
              <svg className="absolute inset-0 w-full h-full -rotate-90" viewBox="0 0 100 100">
                <polygon points="50,10 90,50 50,90 10,50" fill="rgba(59, 130, 246, 0.1)" stroke="rgba(59, 130, 246, 0.5)" strokeWidth="1" />
                <circle cx="50" cy="50" r="40" fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="0.5" />
                <circle cx="50" cy="50" r="20" fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="0.5" />
              </svg>
            </div>
            <div className="space-y-6 flex flex-col justify-center">
              <StatProgress label="Aim Precision" value="78%" progress={78} color="accent" />
              <StatProgress label="Tactical Awareness" value="92%" progress={92} color="secondary" />
              <StatProgress label="Utility Usage" value="64%" progress={64} color="success" />
              <StatProgress label="Clutch Factor" value="88%" progress={88} color="accent" />
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <div className="esport-card p-6 bg-gradient-to-br from-esport-accent/10 to-transparent">
            <div className="text-[10px] font-bold text-esport-accent uppercase tracking-widest mb-1">Win Rate</div>
            <div className="text-3xl font-display font-bold">{stats?.winRate || "0%"}</div>
            <div className="mt-2 text-[10px] text-esport-text-muted">Last 20 Matches</div>
          </div>
          <div className="esport-card p-6 bg-gradient-to-br from-esport-secondary/10 to-transparent">
            <div className="text-[10px] font-bold text-esport-secondary uppercase tracking-widest mb-1">K/D Ratio</div>
            <div className="text-3xl font-display font-bold">{stats?.kdRatio || "0.0"}</div>
            <div className="mt-2 text-[10px] text-esport-text-muted">+0.12 from last week</div>
          </div>
          <div className="esport-card p-6">
            <div className="text-[10px] font-bold text-esport-text-muted uppercase tracking-widest mb-1">Headshot %</div>
            <div className="text-3xl font-display font-bold">{stats?.headshotPct || "0%"}</div>
            <div className="mt-2 text-[10px] text-esport-text-muted">Top 5% in Nexus</div>
          </div>
        </div>
      </div>
    </div>
  );
}

function StatProgress({ label, value, progress, color }: any) {
  const colorMap: any = {
    accent: "bg-esport-accent",
    secondary: "bg-esport-secondary",
    success: "bg-esport-success"
  };

  return (
    <div className="space-y-2">
      <div className="flex justify-between text-xs font-bold uppercase tracking-tight">
        <span className="text-esport-text-muted">{label}</span>
        <span>{value}</span>
      </div>
      <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
        <motion.div 
          initial={{ width: 0 }}
          animate={{ width: `${progress}%` }}
          transition={{ duration: 1, ease: "easeOut" }}
          className={`h-full ${colorMap[color]} shadow-lg`}
        />
      </div>
    </div>
  );
}

function MissionsView({ addToast }: any) {
  const [missions, setMissions] = useState<Mission[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchMissions = async () => {
      try {
        const { data, error } = await supabase.from('missions').select('*');
        if (error) throw error;
        if (data && data.length > 0) {
          setMissions(data);
        } else {
          // Fallback to mock if table empty or missing
          setMissions([
            { id: 1, title: 'Data Heist', reward: 500, difficulty: 'Hard', time: '2h left' },
            { id: 2, title: 'Nexus Defense', reward: 200, difficulty: 'Easy', time: '5h left' },
            { id: 3, title: 'Silent Assassin', reward: 1200, difficulty: 'Extreme', time: '12h left' }
          ]);
        }
      } catch (err) {
        console.warn("Supabase missions fetch failed, using mock data:", err);
        setMissions([
          { id: 1, title: 'Data Heist', reward: 500, difficulty: 'Hard', time: '2h left' },
          { id: 2, title: 'Nexus Defense', reward: 200, difficulty: 'Easy', time: '5h left' },
          { id: 3, title: 'Silent Assassin', reward: 1200, difficulty: 'Extreme', time: '12h left' }
        ]);
      } finally {
        setLoading(false);
      }
    };
    fetchMissions();
  }, []);

  const acceptMission = (id: number) => {
    addToast(`Mission ${id} accepted!`, "success");
  };

  return (
    <div className="space-y-8">
      <div className="flex justify-between items-center">
        <h3 className="text-2xl font-display font-bold uppercase tracking-tight">Daily Missions</h3>
        <span className="text-xs font-bold text-esport-text-muted uppercase tracking-widest">Resets in 14h 22m</span>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {[1, 2, 3].map(i => (
            <div key={i} className="esport-card h-48 animate-shimmer" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {missions.map(mission => (
            <div key={mission.id} className="esport-card p-8 esport-card-hover group">
              <div className="w-12 h-12 rounded-xl bg-esport-accent/10 border border-esport-accent/30 flex items-center justify-center text-esport-accent mb-6 group-hover:scale-110 transition-transform">
                <Target size={24} />
              </div>
              <h4 className="text-lg font-display font-bold uppercase mb-2">{mission.title}</h4>
              <div className="flex gap-4 text-[10px] font-bold uppercase text-esport-text-muted mb-6">
                <span className="flex items-center gap-1"><Activity size={10} /> {mission.difficulty}</span>
                <span className="flex items-center gap-1"><Clock size={10} /> {mission.time}</span>
              </div>
              <div className="flex items-center justify-between pt-6 border-t border-esport-border">
                <div className="text-esport-secondary font-display font-bold text-xl">{mission.reward} CR</div>
                <button 
                  onClick={() => acceptMission(mission.id)}
                  className="esport-btn-primary py-2 px-4 text-[10px]"
                >
                  Accept
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function VaultView({ addToast }: any) {
  const items = [
    { id: 1, name: "Neon Katana", price: 5000, type: "Melee", rarity: "Legendary" },
    { id: 2, name: "Pulse Rifle", price: 2500, type: "Weapon", rarity: "Epic" },
    { id: 3, name: "Ghost Cloak", price: 1200, type: "Utility", rarity: "Rare" },
    { id: 4, name: "Neural Link", price: 800, type: "Boost", rarity: "Uncommon" },
  ];

  const purchaseItem = (id: number, name: string) => {
    fetch("/api/vault/purchase", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ itemId: id })
    })
    .then(res => res.json())
    .then(data => {
      if (data.success) {
        addToast(`Successfully purchased ${name}!`, "success");
      }
    });
  };

  return (
    <div className="space-y-8">
      <div className="flex justify-between items-center">
        <h3 className="text-2xl font-display font-bold uppercase tracking-tight">The Vault</h3>
        <div className="flex gap-2">
          <button className="esport-btn-secondary py-1.5 px-4 text-[10px]">Weapons</button>
          <button className="esport-btn-secondary py-1.5 px-4 text-[10px] opacity-50">Skins</button>
          <button className="esport-btn-secondary py-1.5 px-4 text-[10px] opacity-50">Boosts</button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
        {items.map(item => (
          <div key={item.id} className="esport-card group overflow-hidden esport-card-hover">
            <div className="aspect-square bg-gradient-to-br from-white/5 to-transparent flex items-center justify-center relative">
              <ShoppingBag size={80} className="text-white/10 group-hover:scale-110 transition-transform duration-500" />
              <div className={`absolute top-4 right-4 badge ${
                item.rarity === 'Legendary' ? 'badge-secondary' : 
                item.rarity === 'Epic' ? 'badge-accent' : 
                'badge-success'
              }`}>
                {item.rarity}
              </div>
            </div>
            <div className="p-6">
              <h4 className="font-display font-bold uppercase mb-1">{item.name}</h4>
              <div className="text-[10px] text-esport-text-muted uppercase font-bold mb-6">{item.type}</div>
              <div className="flex justify-between items-center pt-4 border-t border-esport-border">
                <div className="flex items-center gap-1 text-esport-accent font-bold">
                  <Star size={14} fill="currentColor" />
                  {item.price.toLocaleString()}
                </div>
                <button 
                  onClick={() => purchaseItem(item.id, item.name)}
                  className="esport-btn-primary py-2 px-4 text-[10px]"
                >
                  Buy
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function PulseView() {
  return (
    <div className="max-w-2xl mx-auto space-y-8">
      <div className="esport-card p-6">
        <div className="flex gap-4">
          <img src="https://picsum.photos/seed/me/100/100" className="w-10 h-10 rounded-full border border-esport-border" />
          <div className="flex-1 space-y-4">
            <textarea placeholder="Share your latest victory..." className="w-full bg-white/5 border border-esport-border rounded-xl p-4 text-sm focus:outline-none focus:border-esport-accent/50 min-h-[100px] resize-none transition-all" />
            <div className="flex justify-between items-center">
              <div className="flex gap-4 text-esport-text-muted">
                <button className="hover:text-white transition-colors"><PlayCircle size={18} /></button>
                <button className="hover:text-white transition-colors"><Users size={18} /></button>
                <button className="hover:text-white transition-colors"><Target size={18} /></button>
              </div>
              <button className="esport-btn-primary px-8 py-2 text-xs">Post</button>
            </div>
          </div>
        </div>
      </div>

      <div className="space-y-6">
        {[1, 2, 3].map(i => (
          <div key={i} className="esport-card overflow-hidden">
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <img src={`https://picsum.photos/seed/u${i}/100/100`} className="w-10 h-10 rounded-full" />
                  <div>
                    <div className="text-sm font-bold">ProPlayer_{i}</div>
                    <div className="text-[10px] text-esport-text-muted uppercase font-bold">{i * 10}m ago</div>
                  </div>
                </div>
                <button className="text-esport-text-muted hover:text-white"><MoreVertical size={16} /></button>
              </div>
              <p className="text-sm text-white/90 leading-relaxed mb-4">
                Just hit a crazy 4k clutch in the Nexus Arena tournament! The competition is getting intense. Who else is grinding today?
              </p>
              <div className="rounded-xl overflow-hidden border border-esport-border mb-4">
                <img src={`https://picsum.photos/seed/feed${i}/800/400`} className="w-full h-auto" />
              </div>
              <div className="flex items-center gap-6 pt-4 border-t border-esport-border">
                <button className="flex items-center gap-2 text-xs text-esport-text-muted hover:text-esport-accent transition-colors">
                  <Zap size={16} /> 24
                </button>
                <button className="flex items-center gap-2 text-xs text-esport-text-muted hover:text-esport-accent transition-colors">
                  <MessageSquare size={16} /> 12
                </button>
                <button className="flex items-center gap-2 text-xs text-esport-text-muted hover:text-white transition-colors ml-auto">
                  <PlayCircle size={16} /> Share
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function SyndicatesView() {
  return (
    <div className="space-y-8">
      <div className="flex justify-between items-center">
        <h3 className="text-2xl font-display font-bold uppercase tracking-tight">Syndicates</h3>
        <button className="esport-btn-primary">Join Syndicate</button>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        {[1, 2, 3].map(i => (
          <div key={i} className="esport-card p-8 esport-card-hover group">
            <div className="w-16 h-16 rounded-2xl bg-white/5 border border-esport-border flex items-center justify-center mb-6 group-hover:border-esport-accent/50 transition-all">
              <Shield size={32} className="text-esport-accent" />
            </div>
            <h4 className="text-xl font-display font-bold uppercase mb-2">Shadow Protocol {i}</h4>
            <p className="text-xs text-esport-text-muted mb-6">The elite tactical syndicate of the Nexus.</p>
            <div className="flex justify-between text-[10px] font-bold uppercase text-esport-text-muted mb-6">
              <span>Members: <span className="text-white">124</span></span>
              <span>Rank: <span className="text-esport-accent">#12</span></span>
            </div>
            <button className="w-full py-2.5 bg-white/5 border border-esport-border hover:bg-white/10 rounded-lg font-bold text-[10px] uppercase tracking-widest transition-all">View Profile</button>
          </div>
        ))}
      </div>
    </div>
  );
}

function NeonPrimeView() {
  return (
    <div className="max-w-4xl mx-auto py-12">
      <div className="esport-card p-12 text-center relative overflow-hidden">
        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-esport-accent to-transparent" />
        <Crown size={64} className="text-esport-accent mx-auto mb-8 drop-shadow-[0_0_20px_rgba(59,130,246,0.5)]" />
        <h2 className="text-4xl font-display font-extrabold uppercase tracking-tighter mb-4">Elevate Your <span className="text-esport-accent">Experience</span></h2>
        <p className="text-esport-text-muted mb-12 max-w-lg mx-auto">Join the elite tier of Hustle Arena and unlock the full potential of your combat career.</p>
        
        <div className="grid md:grid-cols-3 gap-8 mb-12">
          <div className="p-6 bg-white/5 rounded-2xl border border-esport-border">
            <div className="font-bold uppercase text-esport-accent mb-2">Priority</div>
            <div className="text-xs text-esport-text-muted">Skip the matchmaking queues instantly.</div>
          </div>
          <div className="p-6 bg-white/5 rounded-2xl border border-esport-border">
            <div className="font-bold uppercase text-esport-accent mb-2">Analytics</div>
            <div className="text-xs text-esport-text-muted">Deep neural data on every match played.</div>
          </div>
          <div className="p-6 bg-white/5 rounded-2xl border border-esport-border">
            <div className="font-bold uppercase text-esport-accent mb-2">Exclusive</div>
            <div className="text-xs text-esport-text-muted">Monthly Prime-only weapon drops.</div>
          </div>
        </div>
        
        <button className="esport-btn-primary px-12 py-4 text-lg">Activate Neon Prime - $9.99/mo</button>
      </div>
    </div>
  );
}

// --- New Components ---

// --- Sub-Components ---

function DynamicImage({ prompt, className }: { prompt: string, className?: string }) {
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const generateImage = async () => {
      try {
        const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
        const response = await ai.models.generateContent({
          model: "gemini-2.5-flash-image",
          contents: { parts: [{ text: prompt }] },
          config: { imageConfig: { aspectRatio: "16:9" } }
        });

        for (const part of response.candidates[0].content.parts) {
          if (part.inlineData) {
            setImageUrl(`data:image/png;base64,${part.inlineData.data}`);
            setLoading(false);
            return;
          }
        }
      } catch (error) {
        console.error("Failed to generate image:", error);
        setImageUrl(`https://picsum.photos/seed/${encodeURIComponent(prompt)}/1920/1080`);
        setLoading(false);
      }
    };

    generateImage();
  }, [prompt]);

  if (loading) {
    return <div className={`${className} bg-white/5 animate-shimmer`} />;
  }

  return (
    <motion.img 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      src={imageUrl || ""} 
      className={className} 
      referrerPolicy="no-referrer"
    />
  );
}

function LandingPage({ onLogin }: { onLogin: () => void }) {
  return (
    <div className="min-h-screen bg-esport-bg overflow-x-hidden">
      {/* Navbar */}
      <nav className="glass-header h-20 flex items-center justify-between px-12 fixed w-full top-0 z-50">
        <div className="flex items-center gap-3">
          <img src="/logo.png" alt="Hustle Arena" className="h-12 w-auto" onError={(e) => e.currentTarget.src = 'https://via.placeholder.com/150x50?text=HUSTLE+ARENA'} />
        </div>
        <div className="hidden md:flex items-center gap-8 text-sm font-bold uppercase tracking-widest">
          <a href="#tournaments" className="hover:text-esport-accent transition-colors">Tournaments</a>
          <a href="#pro-gear" className="hover:text-esport-accent transition-colors">Pro Gear</a>
          <a href="#community" className="hover:text-esport-accent transition-colors">Community</a>
          <button onClick={onLogin} className="esport-btn-primary">Enter Arena</button>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="relative h-screen flex items-center justify-center pt-20">
        <div className="absolute inset-0 z-0">
          <DynamicImage 
            prompt="A cinematic, high-energy esports arena with neon lights, a large screen showing a competitive game, and a cheering crowd in the background. Futuristic aesthetic, 4k, professional photography." 
            className="w-full h-full object-cover opacity-40" 
          />
          <div className="absolute inset-0 bg-gradient-to-b from-esport-bg/20 via-esport-bg/60 to-esport-bg" />
        </div>
        
        <div className="container mx-auto px-6 relative z-10 text-center">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.8 }}
          >
            <span className="badge badge-accent mb-6 px-4 py-1 text-sm">Next-Gen Competitive Platform</span>
            <h1 className="text-6xl md:text-8xl font-display font-black uppercase tracking-tighter mb-8 leading-[0.9]">
              WHERE LEGENDS <br />
              <span className="text-esport-accent italic">ARE FORGED</span>
            </h1>
            <p className="text-xl text-esport-text-muted max-w-2xl mx-auto mb-12">
              The ultimate destination for competitive gamers. High-stakes tournaments, advanced neural analytics, and a global community of elite combatants.
            </p>
            <div className="flex flex-col md:flex-row items-center justify-center gap-6">
              <button onClick={onLogin} className="esport-btn-primary px-12 py-5 text-xl w-full md:w-auto">
                Start Your Career
              </button>
              <button className="esport-btn-secondary px-12 py-5 text-xl w-full md:w-auto">
                Explore Tournaments
              </button>
            </div>
          </motion.div>
        </div>

        <div className="absolute bottom-12 left-1/2 -translate-x-1/2 animate-bounce text-esport-text-muted">
          <ChevronDown size={32} />
        </div>
      </section>

      {/* Pro Gamers Section */}
      <section className="py-32 bg-esport-sidebar/30">
        <div className="container mx-auto px-6">
          <div className="flex flex-col md:flex-row items-center gap-16">
            <div className="flex-1">
              <DynamicImage 
                prompt="A professional esports player sitting in a high-tech gaming chair, wearing a headset, focused on a glowing monitor. Intense atmosphere, neon blue lighting, high detail." 
                className="w-full h-[500px] object-cover rounded-3xl border border-esport-accent/30 shadow-[0_0_50px_rgba(59,130,246,0.2)]" 
              />
            </div>
            <div className="flex-1 space-y-8">
              <h2 className="text-4xl md:text-5xl font-display font-black uppercase tracking-tighter">
                BUILT BY <span className="text-esport-accent">PROS</span> <br />
                FOR THE <span className="text-esport-secondary">ELITE</span>
              </h2>
              <p className="text-lg text-esport-text-muted leading-relaxed">
                Hustle Arena isn't just another platform. It's a neural-linked ecosystem designed by professional athletes to provide the most responsive, fair, and rewarding competitive experience in the world.
              </p>
              <ul className="space-y-4">
                {[
                  "Sub-millisecond latency infrastructure",
                  "AI-powered anti-cheat protocols",
                  "Direct path to professional scouting",
                  "Instant prize pool distributions"
                ].map((item, i) => (
                  <li key={i} className="flex items-center gap-3 font-bold uppercase tracking-wider text-sm">
                    <CheckCircle2 className="text-esport-accent" size={20} />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* Live Tournaments */}
      <section id="tournaments" className="py-32 container mx-auto px-6">
        <div className="text-center mb-20">
          <h2 className="text-4xl font-display font-black uppercase tracking-tighter mb-4">Live Tournaments</h2>
          <p className="text-esport-text-muted">Join the battle and claim your share of the massive prize pools.</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {[
            { title: "Neon Strike Invitational", prize: "$50,000", game: "Tactical Shooter", img: "esports tactical shooter tournament" },
            { title: "Cyber League Masters", prize: "$25,000", game: "Battle Royale", img: "esports battle royale tournament" },
            { title: "Hustle Arena Open", prize: "$10,000", game: "MOBA Championship", img: "esports moba tournament" }
          ].map((t, i) => (
            <div key={i} className="esport-card group overflow-hidden">
              <div className="h-48 overflow-hidden relative">
                <DynamicImage prompt={t.img} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" />
                <div className="absolute top-4 right-4 badge badge-accent">LIVE</div>
              </div>
              <div className="p-8 space-y-4">
                <div className="text-[10px] font-bold text-esport-accent uppercase tracking-widest">{t.game}</div>
                <h3 className="text-xl font-display font-bold uppercase">{t.title}</h3>
                <div className="flex justify-between items-center pt-4 border-t border-esport-border">
                  <div>
                    <div className="text-[10px] text-esport-text-muted uppercase">Prize Pool</div>
                    <div className="text-lg font-display font-bold text-esport-secondary">{t.prize}</div>
                  </div>
                  <button className="esport-btn-primary px-6 py-2 text-xs">Join Now</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Pro Gear Section */}
      <section id="pro-gear" className="py-32 bg-gradient-to-b from-transparent to-esport-sidebar/50">
        <div className="container mx-auto px-6">
          <div className="flex flex-col md:flex-row-reverse items-center gap-16">
            <div className="flex-1">
              <DynamicImage 
                prompt="A collection of high-end gaming peripherals: a glowing mechanical keyboard, a precision mouse, and a sleek headset on a dark desk. Cyberpunk aesthetic, neon cyan accents." 
                className="w-full h-[500px] object-cover rounded-3xl border border-esport-secondary/30 shadow-[0_0_50px_rgba(249,115,22,0.1)]" 
              />
            </div>
            <div className="flex-1 space-y-8">
              <h2 className="text-4xl md:text-5xl font-display font-black uppercase tracking-tighter">
                EQUIP THE <span className="text-esport-secondary">BEST</span> <br />
                DOMINATE THE <span className="text-esport-accent">REST</span>
              </h2>
              <p className="text-lg text-esport-text-muted leading-relaxed">
                Access exclusive gear drops and hardware discounts through the Hustle Arena Vault. Our partners provide the tools you need to reach the top of the leaderboard.
              </p>
              <div className="grid grid-cols-2 gap-6">
                <div className="p-6 bg-white/5 rounded-2xl border border-esport-border">
                  <div className="text-2xl font-display font-bold text-esport-accent mb-2">15% OFF</div>
                  <div className="text-xs text-esport-text-muted uppercase font-bold">Logitech G Series</div>
                </div>
                <div className="p-6 bg-white/5 rounded-2xl border border-esport-border">
                  <div className="text-2xl font-display font-bold text-esport-secondary mb-2">FREE</div>
                  <div className="text-xs text-esport-text-muted uppercase font-bold">Prime Gear Drops</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Community Section */}
      <section id="community" className="py-32 container mx-auto px-6 text-center">
        <div className="max-w-3xl mx-auto space-y-12">
          <h2 className="text-4xl md:text-6xl font-display font-black uppercase tracking-tighter">
            JOIN THE <span className="text-esport-accent italic">GLOBAL</span> SQUAD
          </h2>
          <p className="text-xl text-esport-text-muted">
            Connect with millions of players, form squads, and climb the global rankings together. The arena is waiting for you.
          </p>
          <div className="flex justify-center gap-12 py-8">
            <div className="space-y-2">
              <div className="text-4xl font-display font-black text-esport-accent">2.4M+</div>
              <div className="text-xs text-esport-text-muted uppercase font-bold">Active Players</div>
            </div>
            <div className="space-y-2">
              <div className="text-4xl font-display font-black text-esport-secondary">150K+</div>
              <div className="text-xs text-esport-text-muted uppercase font-bold">Daily Matches</div>
            </div>
            <div className="space-y-2">
              <div className="text-4xl font-display font-black text-white">$12M+</div>
              <div className="text-xs text-esport-text-muted uppercase font-bold">Prizes Paid</div>
            </div>
          </div>
          <button onClick={onLogin} className="esport-btn-primary px-16 py-6 text-2xl uppercase italic font-black tracking-tighter">
            Join Now
          </button>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-20 border-t border-esport-border bg-esport-sidebar/50">
        <div className="container mx-auto px-6 flex flex-col md:flex-row justify-between items-center gap-8">
          <div className="flex items-center gap-3">
            <img src="/logo.png" alt="Hustle Arena" className="h-8 w-auto" onError={(e) => e.currentTarget.src = 'https://via.placeholder.com/150x50?text=HUSTLE+ARENA'} />
          </div>
          <div className="text-esport-text-muted text-sm">
            © 2026 Hustle Arena. All rights reserved. Professional Esports Platform.
          </div>
          <div className="flex gap-6">
            <a href="#" className="text-esport-text-muted hover:text-white transition-colors">Twitter</a>
            <a href="#" className="text-esport-text-muted hover:text-white transition-colors">Discord</a>
            <a href="#" className="text-esport-text-muted hover:text-white transition-colors">Support</a>
          </div>
        </div>
      </footer>
    </div>
  );
}

function FeatureCard({ icon, title, desc }: any) {
  return (
    <div className="esport-card p-10 esport-card-hover group">
      <div className="w-16 h-16 bg-esport-accent/10 rounded-2xl flex items-center justify-center text-esport-accent mb-8 group-hover:scale-110 transition-transform">
        {icon}
      </div>
      <h3 className="text-2xl font-display font-bold uppercase mb-4">{title}</h3>
      <p className="text-esport-text-muted leading-relaxed">{desc}</p>
    </div>
  );
}

function AuthForm({ onLogin }: { onLogin: (user: any) => void }) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [username, setUsername] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    setError("");
    setLoading(true);

    try {
      if (mode === "login") {
        const { data, error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (error) throw error;
        if (data.user) {
          onLogin(data.user);
        }
      } else {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: {
              username: username,
              role: "user",
              kycStatus: "none"
            }
          }
        });
        if (error) throw error;
        if (data.user) {
          setMode("login");
          alert("Registration successful! Please check your email for verification (if enabled) or sign in.");
        }
      }
    } catch (err: any) {
      console.error("Auth error:", err);
      setError(err.message || "Authentication failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-8">
      <div className="flex gap-4 p-1 bg-white/5 rounded-xl border border-esport-border">
        <button 
          onClick={() => setMode("login")}
          className={`flex-1 py-2 text-xs font-bold uppercase tracking-widest rounded-lg transition-all ${mode === "login" ? "bg-esport-accent text-white" : "text-esport-text-muted hover:text-white"}`}
        >
          Login
        </button>
        <button 
          onClick={() => setMode("register")}
          className={`flex-1 py-2 text-xs font-bold uppercase tracking-widest rounded-lg transition-all ${mode === "register" ? "bg-esport-accent text-white" : "text-esport-text-muted hover:text-white"}`}
        >
          Register
        </button>
      </div>

      {error && <div className="p-3 bg-esport-danger/20 border border-esport-danger/50 text-esport-danger text-xs rounded-lg text-center font-bold uppercase tracking-widest">{error}</div>}

      <div className="space-y-4">
        {mode === "register" && (
          <div className="space-y-2">
            <label className="text-[10px] font-bold text-esport-text-muted uppercase tracking-widest">Username</label>
            <input 
              type="text" 
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="CyberGhost_99" 
              className="w-full bg-white/5 border border-esport-border rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-esport-accent/50 transition-all" 
            />
          </div>
        )}
        <div className="space-y-2">
          <label className="text-[10px] font-bold text-esport-text-muted uppercase tracking-widest">Email Address</label>
          <input 
            type="email" 
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="name@example.com" 
            className="w-full bg-white/5 border border-esport-border rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-esport-accent/50 transition-all" 
          />
        </div>
        <div className="space-y-2">
          <label className="text-[10px] font-bold text-esport-text-muted uppercase tracking-widest">Password</label>
          <input 
            type="password" 
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••" 
            className="w-full bg-white/5 border border-esport-border rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-esport-accent/50 transition-all" 
          />
        </div>
      </div>

      <button 
        onClick={handleSubmit} 
        disabled={loading}
        className="esport-btn-primary w-full py-4 uppercase tracking-widest text-sm disabled:opacity-50"
      >
        {loading ? "Processing..." : (mode === "login" ? "Sign In" : "Create Account")}
      </button>

      <div className="relative">
        <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-esport-border"></div></div>
        <div className="relative flex justify-center text-[10px] uppercase font-bold"><span className="bg-esport-card px-4 text-esport-text-muted">Or continue with</span></div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <button className="esport-btn-secondary py-3 text-xs flex items-center justify-center gap-2 group">
          <img src="https://upload.wikimedia.org/wikipedia/commons/8/83/Steam_icon_logo.svg" className="w-5 h-5 group-hover:scale-110 transition-transform" />
          Steam
        </button>
        <button className="esport-btn-secondary py-3 text-xs flex items-center justify-center gap-2 group">
          <img src="https://upload.wikimedia.org/wikipedia/commons/3/3a/Faceit_logo.svg" className="w-5 h-5 group-hover:scale-110 transition-transform" />
          FACEIT
        </button>
      </div>
    </div>
  );
}

function KYCForm({ addToast }: { addToast: any }) {
  const [step, setStep] = useState(1);

  return (
    <div className="space-y-6">
      <div className="flex justify-between mb-8">
        {[1, 2, 3].map(i => (
          <div key={i} className={`flex items-center gap-2 ${step >= i ? 'text-esport-accent' : 'text-esport-text-muted'}`}>
            <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center text-[10px] font-bold ${step >= i ? 'border-esport-accent bg-esport-accent/10' : 'border-esport-border'}`}>
              {i}
            </div>
            <span className="text-[10px] uppercase font-bold tracking-widest">{i === 1 ? 'Identity' : i === 2 ? 'Address' : 'Selfie'}</span>
          </div>
        ))}
      </div>

      {step === 1 && (
        <div className="space-y-4">
          <p className="text-sm text-esport-text-muted">Please upload a clear photo of your government-issued ID (Passport or Driver's License).</p>
          <div className="h-40 border-2 border-dashed border-esport-border rounded-xl flex flex-col items-center justify-center gap-3 hover:border-esport-accent/50 transition-all cursor-pointer bg-white/5">
            <Plus size={32} className="text-esport-text-muted" />
            <span className="text-xs font-bold text-esport-text-muted uppercase">Upload ID Front</span>
          </div>
          <button onClick={() => setStep(2)} className="esport-btn-primary w-full">Next Step</button>
        </div>
      )}

      {step === 2 && (
        <div className="space-y-4">
          <p className="text-sm text-esport-text-muted">Please provide a utility bill or bank statement from the last 3 months as proof of residence.</p>
          <div className="h-40 border-2 border-dashed border-esport-border rounded-xl flex flex-col items-center justify-center gap-3 hover:border-esport-accent/50 transition-all cursor-pointer bg-white/5">
            <Plus size={32} className="text-esport-text-muted" />
            <span className="text-xs font-bold text-esport-text-muted uppercase">Upload Proof of Address</span>
          </div>
          <div className="flex gap-4">
            <button onClick={() => setStep(1)} className="esport-btn-secondary flex-1">Back</button>
            <button onClick={() => setStep(3)} className="esport-btn-primary flex-1">Next Step</button>
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="space-y-4">
          <p className="text-sm text-esport-text-muted">Finally, take a live selfie holding your ID to verify your identity.</p>
          <div className="h-40 border-2 border-dashed border-esport-border rounded-xl flex flex-col items-center justify-center gap-3 hover:border-esport-accent/50 transition-all cursor-pointer bg-white/5">
            <User size={32} className="text-esport-text-muted" />
            <span className="text-xs font-bold text-esport-text-muted uppercase">Take Selfie</span>
          </div>
          <div className="flex gap-4">
            <button onClick={() => setStep(2)} className="esport-btn-secondary flex-1">Back</button>
            <button 
              onClick={() => {
                addToast("KYC Documents submitted for review!", "success");
              }} 
              className="esport-btn-primary flex-1"
            >
              Submit KYC
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function AdminPanel({ addToast }: { addToast: any }) {
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/admin/users")
      .then(res => res.json())
      .then(data => {
        setUsers(data);
        setLoading(false);
      });
  }, []);

  const handleKYC = (userId: number, action: "approve" | "reject") => {
    fetch(`/api/admin/kyc/${action}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId })
    })
    .then(res => res.json())
    .then(data => {
      if (data.success) {
        addToast(data.message, action === "approve" ? "success" : "error");
        setUsers(prev => prev.map(u => u.id === userId ? { ...u, kycStatus: action === "approve" ? "verified" : "rejected" } : u));
      }
    });
  };

  return (
    <div className="space-y-8">
      <div className="flex justify-between items-center">
        <div>
          <h3 className="text-2xl font-display font-bold uppercase tracking-tight">Admin Control Center</h3>
          <p className="text-sm text-esport-text-muted">Manage users, verify KYC, and monitor platform health.</p>
        </div>
        <div className="flex gap-3">
          <div className="esport-card px-6 py-3 flex items-center gap-4">
            <div className="text-right">
              <div className="text-[10px] font-bold text-esport-text-muted uppercase">Total Users</div>
              <div className="text-xl font-display font-bold">{users.length}</div>
            </div>
            <Users className="text-esport-accent" size={24} />
          </div>
        </div>
      </div>

      <div className="esport-card overflow-hidden">
        <div className="grid grid-cols-[1fr_1fr_150px_150px_200px] p-6 border-b border-esport-border text-[10px] font-bold uppercase tracking-widest text-esport-text-muted">
          <div className="px-4">User</div>
          <div>Email</div>
          <div className="text-center">Role</div>
          <div className="text-center">KYC Status</div>
          <div className="text-right px-4">Actions</div>
        </div>
        <div className="divide-y divide-esport-border">
          {loading ? (
            <div className="p-12 text-center text-esport-text-muted">Loading user data...</div>
          ) : (
            users.map(user => (
              <div key={user.id} className="grid grid-cols-[1fr_1fr_150px_150px_200px] p-6 items-center hover:bg-white/5 transition-colors">
                <div className="px-4 flex items-center gap-3">
                  <img src={`https://picsum.photos/seed/u${user.id}/40/40`} className="w-8 h-8 rounded-full" />
                  <span className="font-bold text-sm">{user.username}</span>
                </div>
                <div className="text-sm text-esport-text-muted">{user.email}</div>
                <div className="text-center">
                  <span className={`badge ${user.role === 'admin' ? 'badge-secondary' : 'bg-white/10 text-white'}`}>{user.role}</span>
                </div>
                <div className="text-center">
                  <span className={`badge ${
                    user.kycStatus === 'verified' ? 'badge-success' : 
                    user.kycStatus === 'pending' ? 'badge-accent' : 
                    user.kycStatus === 'rejected' ? 'badge-danger' : 
                    'bg-white/10 text-white'
                  }`}>
                    {user.kycStatus || 'none'}
                  </span>
                </div>
                <div className="text-right px-4 flex justify-end gap-2">
                  {user.kycStatus === 'pending' && (
                    <>
                      <button onClick={() => handleKYC(user.id, "approve")} className="p-2 bg-esport-success/10 text-esport-success hover:bg-esport-success hover:text-white rounded-lg transition-all">
                        <CheckCircle2 size={16} />
                      </button>
                      <button onClick={() => handleKYC(user.id, "reject")} className="p-2 bg-esport-danger/10 text-esport-danger hover:bg-esport-danger hover:text-white rounded-lg transition-all">
                        <X size={16} />
                      </button>
                    </>
                  )}
                  <button className="p-2 bg-white/5 text-esport-text-muted hover:text-white rounded-lg transition-all">
                    <MoreVertical size={16} />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
