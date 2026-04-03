/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { motion, AnimatePresence } from "motion/react";
import { 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  Cell
} from 'recharts';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
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
  ChevronDown,
  Lock,
  Info,
  Map,
  Server,
  ShieldAlert,
  Wallet,
  Copy,
  FileText
} from "lucide-react";
import React, { useState, useEffect, useMemo, useRef } from "react";
import { 
  auth, 
  db, 
  googleProvider, 
  signInWithPopup, 
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  onAuthStateChanged, 
  signOut,
  doc,
  getDoc,
  setDoc,
  serverTimestamp,
  onSnapshot,
  updateDoc,
  getDocs,
  collection,
  query,
  storage,
  ref,
  uploadString,
  getDownloadURL
} from "./firebase";

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

const ADMIN_EMAIL = "danielnotexist@gmail.com";

// --- Main App Component ---
export default function App() {
  const [view, setView] = useState<"landing" | "dashboard" | "admin">("landing");
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [user, setUser] = useState<any>(null);
  const [activeTab, setActiveTab] = useState("Dashboard");
  const [isDepositOpen, setIsDepositOpen] = useState(false);
  const [stats, setStats] = useState<UserStats | null>(null);
  const [profileData, setProfileData] = useState({ bio: "Ready to dominate the arena. Tactical shooter veteran.", country: "Israel", twitter: "", twitch: "" });
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalContent, setModalContent] = useState<{title: string, body: React.ReactNode} | null>(null);

  // Fetch initial session and profile
  useEffect(() => {
    let profileUnsubscribe: (() => void) | null = null;
    
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        try {
          // Check if profile exists
          const userDocRef = doc(db, "users", firebaseUser.uid);
          const userDoc = await getDoc(userDocRef);
          
          if (!userDoc.exists()) {
            // Create initial profile if it doesn't exist
            const initialProfile = {
              username: firebaseUser.displayName || firebaseUser.email?.split('@')[0] || "Player",
              email: firebaseUser.email,
              role: firebaseUser.email?.toLowerCase() === ADMIN_EMAIL ? "admin" : "user",
              kycStatus: firebaseUser.email?.toLowerCase() === ADMIN_EMAIL ? "verified" : "none",
              bio: "Ready to dominate the arena. Tactical shooter veteran.",
              country: "Israel",
              twitter: "",
              twitch: "",
              createdAt: serverTimestamp(),
              stats: {
                credits: 0,
                level: 1,
                rank: "Bronze I",
                winRate: "0%",
                kdRatio: 0,
                headshotPct: "0%"
              }
            };
            await setDoc(userDocRef, initialProfile);
          } else if (firebaseUser.email?.toLowerCase() === ADMIN_EMAIL) {
            const profile = userDoc.data();
            if (profile.role !== "admin" || profile.kycStatus !== "verified") {
              await setDoc(userDocRef, { role: "admin", kycStatus: "verified" }, { merge: true });
            }
          }

          // Real-time profile listener
          profileUnsubscribe = onSnapshot(userDocRef, (snapshot) => {
            if (snapshot.exists()) {
              const profile = snapshot.data();
              handleLogin({ ...firebaseUser, ...profile });
              setProfileData({
                bio: profile.bio || "Ready to dominate the arena. Tactical shooter veteran.",
                country: profile.country || "Israel",
                twitter: profile.twitter || "",
                twitch: profile.twitch || ""
              });
            }
          }, (err) => {
            console.error("Profile snapshot error:", err);
          });
        } catch (err) {
          console.error("Auth state change error:", err);
        }
      } else {
        setIsLoggedIn(false);
        setUser(null);
        setIsAdmin(false);
        if (profileUnsubscribe) profileUnsubscribe();
      }
    });
    return () => {
      unsubscribe();
      if (profileUnsubscribe) profileUnsubscribe();
    };
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
    { id: "Nexus TV", icon: <PlayCircle size={20} />, label: "Nexus TV" },
    { id: "Pulse", icon: <Zap size={20} />, label: "Pulse" },
    { id: "Deposit", icon: <Wallet size={20} />, label: "Deposit", highlight: true },
  ];

  const collectiveItems = [
    { id: "Syndicates", icon: <Shield size={20} />, label: "Syndicates" },
    { id: "Missions", icon: <Target size={20} />, label: "Missions" },
    { id: "Vault", icon: <ShoppingBag size={20} />, label: "Vault" },
    { id: "Hustle Prime", icon: <Crown size={20} />, label: "Hustle Prime", highlight: true },
  ];

  const handleLogin = (userData: any) => {
    setIsLoggedIn(true);
    const userProfile = {
      id: userData.uid || userData.id,
      username: userData.username || userData.displayName || userData.email?.split('@')[0] || "Player",
      email: userData.email,
      role: userData.role || "user",
      kycStatus: userData.kycStatus || "none"
    };
    setIsAdmin(userProfile.role === "admin" || userProfile.email?.toLowerCase() === ADMIN_EMAIL);
    setUser(userProfile);
    setView("dashboard");
    addToast(`Welcome back, ${userProfile.username}!`, "success");
    setIsModalOpen(false);
  };

  const handleLogout = async () => {
    await signOut(auth);
    setIsLoggedIn(false);
    setIsAdmin(false);
    setUser(null);
    setView("landing");
    addToast("Logged out successfully", "info");
  };

  return (
    <div className="min-h-screen bg-esport-bg text-white font-sans">
      {view === "landing" ? (
        <LandingPage onLogin={() => openModal("Access Arena", <AuthForm onLogin={handleLogin} />)} />
      ) : (
        <div className="flex h-screen overflow-hidden">
          {/* Sidebar */}
          <aside className="w-64 bg-esport-sidebar flex flex-col border-r border-esport-border z-40 shrink-0">
            <div className="p-6">
              <div className="flex items-center gap-3 group cursor-pointer" onClick={() => setView("dashboard")}>
                <div className="flex items-center gap-2 h-10">
                  <div className="h-full aspect-square rounded bg-esport-accent flex items-center justify-center">
                    <Gamepad2 className="text-black w-3/4 h-3/4" />
                  </div>
                  <span className="font-display font-bold text-xl tracking-wider text-white">HUSTLE</span>
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

            <div className="flex-1 overflow-y-auto custom-scrollbar relative">
              {isLoggedIn && !isAdmin && user?.email?.toLowerCase() !== ADMIN_EMAIL && user?.kycStatus !== 'verified' && (
                <div className="sticky top-0 z-[30] bg-esport-accent/10 border-b border-esport-accent/30 backdrop-blur-md p-3 flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-esport-accent/20 rounded-full flex items-center justify-center">
                      <ShieldAlert size={16} className="text-esport-accent" />
                    </div>
                    <div>
                      <div className="text-xs font-bold uppercase tracking-wider text-white">KYC Verification Required</div>
                      <p className="text-[10px] text-esport-text-muted">Verify your identity to unlock Battlefield and other premium features.</p>
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
                    {activeTab === "Deposit" && <DepositPage addToast={addToast} />}
                    {activeTab === "Profile" && <UserProfileView user={user} stats={stats} profileData={profileData} setProfileData={setProfileData} addToast={addToast} openModal={openModal} />}
                    {activeTab === "Battlefield" && <BattlefieldView addToast={addToast} openModal={openModal} user={user} />}
                    {activeTab === "Squad Hub" && <SquadHubView addToast={addToast} />}
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
            <h3 className="text-xl font-display font-bold uppercase mb-2">Hustle Prime</h3>
            <p className="text-xs text-esport-text-muted mb-6">Unlock advanced analytics and priority matchmaking.</p>
            <button className="esport-btn-primary w-full">Upgrade Now</button>
          </div>

          <div className="esport-card p-8">
            <h3 className="text-sm font-bold uppercase tracking-widest mb-6">Online Friends</h3>
            <div className="space-y-4">
              {[1, 2, 3, 4].map(i => (
                <div key={i} className="flex items-center gap-3 group cursor-pointer">
                  <div className="relative">
                    <img src={`https://ui-avatars.com/api/?name=Friend+${i}&background=random`} className="w-8 h-8 rounded-full" />
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

function UserProfileView({ user, stats, profileData, setProfileData, addToast, openModal }: any) {
  const [activeTab, setActiveTab] = useState('overview');
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState(profileData);

  const handleSave = async () => {
    if (!user?.id) return;
    try {
      await setDoc(doc(db, "users", user.id), {
        ...editForm
      }, { merge: true });
      setProfileData(editForm);
      setIsEditing(false);
      addToast("Profile updated successfully!", "success");
    } catch (error) {
      console.error("Error updating profile:", error);
      addToast("Failed to update profile", "error");
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
            <h3 className="font-display font-bold uppercase tracking-wider mb-4 text-esport-text-muted text-sm">Combat Record</h3>
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
                    {[40, 70, 45, 90, 65, 85, 100, 50, 75, 60].map((h, i) => (
                      <div key={i} className="flex-1 bg-esport-accent/20 rounded-t-sm hover:bg-esport-accent transition-colors relative group" style={{ height: `${h}%` }}>
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

function BattlefieldView({ addToast, openModal, user }: any) {
  const isKycVerified = user?.kycStatus === 'verified' || user?.email?.toLowerCase() === ADMIN_EMAIL;
  const kycStatus = user?.kycStatus || "none";
  const isKycPending = kycStatus === "pending";
  const isKycRejected = kycStatus === "rejected";
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
    if (!isKycVerified) {
      addToast("KYC Verification required to play", "error");
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

  if (!isKycVerified) {
    return (
      <div className="max-w-5xl mx-auto h-[60vh] flex flex-col items-center justify-center text-center space-y-6">
        <div className="w-24 h-24 bg-esport-danger/10 rounded-full flex items-center justify-center">
          <Lock size={48} className="text-esport-danger" />
        </div>
        <div className="space-y-2">
          <h2 className="text-3xl font-display font-bold uppercase tracking-tight">Battlefield Locked</h2>
          <p className="text-esport-text-muted max-w-md mx-auto">
            {isKycPending
              ? "Your KYC is currently under review. You'll unlock Battlefield as soon as verification is approved."
              : isKycRejected
              ? "Your KYC was rejected. Please update your information and submit again to unlock Battlefield."
              : "You must complete your KYC verification before you can enter the battlefield and compete for prizes."}
          </p>
        </div>
        {isKycPending ? (
          <div className="px-8 py-4 uppercase tracking-widest text-sm font-bold rounded-lg border border-esport-accent/40 bg-esport-accent/10 text-esport-accent">
            Under Review
          </div>
        ) : (
          <button 
            onClick={() => openModal("KYC Verification", <KYCForm addToast={addToast} user={user} />)}
            className="esport-btn-primary px-8 py-4 uppercase tracking-widest text-sm"
          >
            {isKycRejected ? "Update KYC Info" : "Verify Identity Now"}
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-display font-bold uppercase tracking-tight">Battlefield</h2>
          <p className="text-esport-text-muted">Enter the arena and prove your worth.</p>
        </div>
        <div className="flex items-center gap-4 bg-esport-card border border-esport-border px-4 py-2 rounded-lg">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-esport-success animate-pulse" />
            <span className="text-sm font-bold">12,458 Players Online</span>
          </div>
        </div>
      </div>

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

function SquadHubView({ addToast }: any) {
  const squads = [
    { id: 1, name: "Shadow Realm", leader: "imjozeph-", level: 9, members: 4, max: 5, tags: ["Competitive", "Mic Required"] },
    { id: 2, name: "Hustle Knights", leader: "K1R0_16", level: 5, members: 2, max: 5, tags: ["Casual", "No Toxicity"] },
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
                  <img key={i} src={`https://ui-avatars.com/api/?name=Player+${i}&background=random`} className="w-10 h-10 rounded-full border-2 border-esport-card shadow-lg" />
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
    { rank: 1, name: "qw1nk1", elo: "5,189", level: 10, winRate: "72%", avatar: "https://ui-avatars.com/api/?name=qw1nk1&background=random" },
    { rank: 2, name: "fame--", elo: "5,153", level: 10, winRate: "68%", avatar: "https://ui-avatars.com/api/?name=fame--&background=random" },
    { rank: 3, name: "donk666", elo: "5,061", level: 10, winRate: "70%", avatar: "https://ui-avatars.com/api/?name=donk666&background=random" },
    { rank: 4, name: "b1st-", elo: "5,060", level: 10, winRate: "65%", avatar: "https://ui-avatars.com/api/?name=b1st-&background=random" },
    { rank: 5, name: "executor", elo: "5,058", level: 10, winRate: "64%", avatar: "https://ui-avatars.com/api/?name=executor&background=random" },
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
        // For now, use mock data. In a real app, we'd fetch from Firestore.
        setMissions([
          { id: 1, title: 'Data Heist', reward: 500, difficulty: 'Hard', time: '2h left' },
          { id: 2, title: 'Nexus Defense', reward: 200, difficulty: 'Easy', time: '5h left' },
          { id: 3, title: 'Silent Assassin', reward: 1200, difficulty: 'Extreme', time: '12h left' }
        ]);
      } catch (err) {
        console.error("Missions fetch failed:", err);
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
    { id: 1, name: "Hustle Katana", price: 5000, type: "Melee", rarity: "Legendary" },
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
          <img src="https://ui-avatars.com/api/?name=Me&background=random" className="w-10 h-10 rounded-full border border-esport-border" />
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
                  <img src={`https://ui-avatars.com/api/?name=User+${i}&background=random`} className="w-10 h-10 rounded-full" />
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
                <DynamicImage prompt={`esports gameplay highlight screenshot ${i}`} className="w-full h-auto" />
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

function HustlePrimeView() {
  const [activeTab, setActiveTab] = useState('serious');
  
  return (
    <div className="min-h-screen bg-esport-bg text-white pb-24 font-sans">
      {/* Hero Section */}
      <div className="relative pt-20 pb-16 text-center px-4">
        {/* Background glow */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full max-w-4xl h-96 bg-esport-accent/20 blur-[120px] rounded-full pointer-events-none" />
        
        <div className="relative z-10">
          <div className="w-20 h-20 mx-auto bg-esport-card border-2 border-esport-accent rounded-xl flex items-center justify-center mb-8 transform rotate-45">
            <Crown className="text-esport-accent w-10 h-10 -rotate-45" fill="currentColor" />
          </div>
          
          <h1 className="text-5xl md:text-6xl font-bold mb-4 tracking-tight font-display uppercase">
            Dominate the Arena<br />with HUSTLE PRIME
          </h1>
          
          <div className="text-2xl font-bold mb-2">$7.99/month</div>
          <div className="text-sm text-esport-text-muted mb-8">Per month billed annually, not including taxes • Cancel anytime</div>
          
          <button className="esport-btn-primary py-3 px-8 text-lg mb-4">
            UPGRADE TO PRIME
          </button>
          
          <div>
            <button className="text-sm text-esport-text-muted hover:text-white flex items-center justify-center mx-auto gap-1 transition-colors">
              Compare plans <ChevronDown className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Tabs Section */}
      <div className="max-w-6xl mx-auto px-4 mt-12">
        <h2 className="text-3xl font-bold text-center mb-8 font-display uppercase tracking-tight">Unlock your true potential. Go Prime.</h2>
        
        <div className="flex justify-center gap-4 mb-16">
          <button 
            onClick={() => setActiveTab('serious')}
            className={`flex items-center gap-2 px-6 py-2 rounded-full border transition-colors ${activeTab === 'serious' ? 'border-esport-accent bg-esport-accent/10 text-white' : 'border-esport-border text-esport-text-muted hover:text-white hover:border-gray-600'}`}
          >
            <Sword className="w-4 h-4" /> Elite Matches
          </button>
          <button 
            onClick={() => setActiveTab('settings')}
            className={`flex items-center gap-2 px-6 py-2 rounded-full border transition-colors ${activeTab === 'settings' ? 'border-esport-accent bg-esport-accent/10 text-white' : 'border-esport-border text-esport-text-muted hover:text-white hover:border-gray-600'}`}
          >
            <Settings className="w-4 h-4" /> Custom Rulesets
          </button>
          <button 
            onClick={() => setActiveTab('rewards')}
            className={`flex items-center gap-2 px-6 py-2 rounded-full border transition-colors ${activeTab === 'rewards' ? 'border-esport-accent bg-esport-accent/10 text-white' : 'border-esport-border text-esport-text-muted hover:text-white hover:border-gray-600'}`}
          >
            <Trophy className="w-4 h-4" /> Arena Rewards
          </button>
        </div>

        {/* Feature 1 */}
        <div className="grid md:grid-cols-2 gap-12 items-center mb-32">
          <div>
            <h3 className="text-3xl font-bold mb-4 font-display uppercase tracking-tight">Experience elite-tier<br />matchmaking</h3>
            <div className="flex flex-wrap gap-x-4 gap-y-2 text-sm font-bold mb-6">
              <span className="flex items-center gap-2 text-esport-accent"><div className="w-1.5 h-1.5 rounded-full bg-esport-accent" /> Priority Queue Access</span>
              <span className="flex items-center gap-2 text-esport-accent"><div className="w-1.5 h-1.5 rounded-full bg-esport-accent" /> Verified-Only Arenas</span>
              <span className="flex items-center gap-2 text-esport-accent"><div className="w-1.5 h-1.5 rounded-full bg-esport-accent" /> Advanced Player Avoidance</span>
            </div>
            <p className="text-esport-text-muted leading-relaxed">
              Take control of your match experience, ensuring that every game respects your preferences for a more balanced and fairer competition. You'll enjoy more competitive and serious games, making every move and bullet count.
            </p>
          </div>
          <div className="relative rounded-xl overflow-hidden border border-esport-border aspect-video bg-esport-card">
            <DynamicImage prompt="esports 5v5 tactical shooter gameplay screenshot, blue neon aesthetic" className="w-full h-full object-cover opacity-80" />
            <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent" />
          </div>
        </div>

        {/* Feature 2 */}
        <div className="grid md:grid-cols-2 gap-12 items-center mb-32">
          <div className="order-2 md:order-1 relative rounded-xl overflow-hidden border border-esport-border aspect-video bg-esport-card flex items-center justify-center p-8">
            {/* Mock UI for settings */}
            <div className="w-full max-w-sm bg-esport-sidebar border border-esport-border rounded-lg p-4 shadow-2xl">
              <div className="flex items-center gap-3 mb-4 border-b border-esport-border pb-4">
                <div className="w-10 h-10 bg-esport-accent/20 rounded-full flex items-center justify-center border border-esport-accent">
                  <Settings className="w-5 h-5 text-esport-accent" />
                </div>
                <div>
                  <div className="font-bold">Match Settings</div>
                  <div className="text-xs text-esport-accent font-bold uppercase tracking-wider">Prime Only</div>
                </div>
              </div>
              <div className="space-y-3">
                {[1, 2, 3, 4].map(i => (
                  <div key={i} className="flex items-center gap-3">
                    <div className={`w-5 h-5 rounded flex items-center justify-center ${i <= 2 ? 'bg-esport-accent' : 'border border-esport-border'}`}>
                      {i <= 2 && <CheckCircle2 className="w-3 h-3 text-white" />}
                    </div>
                    <div className="h-2 bg-esport-border rounded w-full max-w-[120px]" />
                  </div>
                ))}
              </div>
            </div>
          </div>
          <div className="order-1 md:order-2">
            <h3 className="text-3xl font-bold mb-4 font-display uppercase tracking-tight">Customize Your Battleground</h3>
            <div className="flex flex-wrap gap-x-4 gap-y-2 text-sm font-bold mb-6">
              <span className="flex items-center gap-2 text-esport-accent"><div className="w-1.5 h-1.5 rounded-full bg-esport-accent" /> Map Selection</span>
              <span className="flex items-center gap-2 text-esport-accent"><div className="w-1.5 h-1.5 rounded-full bg-esport-accent" /> Captain Priority</span>
            </div>
            <p className="text-esport-text-muted leading-relaxed">
              Choose the game settings that work best for you. Pick your favorite maps and, as captain, the optimal server and the starting side. It's all about playing your way and focusing on your gameplay.
            </p>
          </div>
        </div>

        {/* Feature 3 */}
        <div className="grid md:grid-cols-2 gap-12 items-center mb-32">
          <div>
            <h3 className="text-3xl font-bold mb-4 font-display uppercase tracking-tight">Earn Exclusive<br />Arena Rewards</h3>
            <div className="flex flex-wrap gap-x-4 gap-y-2 text-sm font-bold mb-6">
              <span className="flex items-center gap-2 text-esport-accent"><div className="w-1.5 h-1.5 rounded-full bg-esport-accent" /> Prime Bounties</span>
              <span className="flex items-center gap-2 text-esport-accent"><div className="w-1.5 h-1.5 rounded-full bg-esport-accent" /> Elite Leaderboards</span>
            </div>
            <p className="text-esport-text-muted leading-relaxed">
              Complete Prime monthly mission challenges, climb the exclusive Prime ladders available each week, and you could win your share of HUSTLE Points and skins, with thousands of winners every month.
            </p>
          </div>
          <div className="relative rounded-xl overflow-hidden border border-esport-border aspect-video bg-esport-card">
            <DynamicImage prompt="A collection of high-end esports gaming peripherals: a glowing mechanical keyboard, a precision mouse, and a sleek headset on a dark desk. Cyberpunk aesthetic, blue neon accents, professional esports gear." className="w-full h-full object-cover opacity-80" />
            <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent" />
          </div>
        </div>

        {/* More Features */}
        <div className="mb-32">
          <h3 className="text-2xl font-bold text-center mb-12 font-display uppercase tracking-tight">More HUSTLE PRIME Benefits</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-6">
            <div className="esport-card p-6 text-center esport-card-hover">
              <div className="w-12 h-12 mx-auto bg-esport-accent/10 rounded-lg flex items-center justify-center mb-4 border border-esport-accent/30">
                <Crown className="w-6 h-6 text-esport-accent" />
              </div>
              <h4 className="font-bold mb-2">Prime Tiers</h4>
              <p className="text-xs text-esport-text-muted">Your Prime tier is a badge that evolves to showcase your contribution to the community.</p>
            </div>
            <div className="esport-card p-6 text-center esport-card-hover">
              <div className="w-12 h-12 mx-auto bg-white/5 rounded-lg flex items-center justify-center mb-4 border border-esport-border">
                <MessageSquare className="w-6 h-6 text-white" />
              </div>
              <h4 className="font-bold mb-2">Priority Support</h4>
              <p className="text-xs text-esport-text-muted">Fast-track your requests as we prioritize your support tickets.</p>
            </div>
            <div className="esport-card p-6 text-center esport-card-hover">
              <div className="w-12 h-12 mx-auto bg-white/5 rounded-lg flex items-center justify-center mb-4 border border-esport-border">
                <User className="w-6 h-6 text-white" />
              </div>
              <h4 className="font-bold mb-2">Identity Refresh</h4>
              <p className="text-xs text-esport-text-muted">Refresh your nickname every 3 months at no extra cost.</p>
            </div>
            <div className="esport-card p-6 text-center esport-card-hover">
              <div className="w-12 h-12 mx-auto bg-white/5 rounded-lg flex items-center justify-center mb-4 border border-esport-border">
                <PlayCircle className="w-6 h-6 text-white" />
              </div>
              <h4 className="font-bold mb-2">Match Highlights</h4>
              <p className="text-xs text-esport-text-muted">Relive your epic in-game actions—no client needed!</p>
            </div>
          </div>
        </div>

        {/* Loyalty */}
        <div className="esport-card p-8 mb-32 flex flex-col md:flex-row items-center gap-8">
          <div className="flex-1">
            <h3 className="text-xl font-bold mb-2 font-display uppercase tracking-tight">Arena Loyalty Rewards</h3>
            <p className="text-sm text-esport-text-muted">
              The longer you stay subscribed to Prime, the more XP and rewards you unlock. Progress through tiers to earn new Prime badges, unlock up to 25% Vault discounts, and receive up to 20 HUSTLE PRIME day passes each month that you can gift to friends.
            </p>
          </div>
          <div className="flex flex-wrap justify-center gap-4">
            {['Initiate', 'Veteran', 'Elite', 'Master', 'Grandmaster', 'Legend'].map((tier, i) => (
              <div key={tier} className="text-center">
                <div className={`w-10 h-10 rounded-full border-2 flex items-center justify-center mb-2 mx-auto
                  ${i === 0 ? 'border-blue-400 bg-blue-400/20 text-blue-400' : 
                    i === 1 ? 'border-blue-500 bg-blue-500/20 text-blue-500' :
                    i === 2 ? 'border-indigo-400 bg-indigo-400/20 text-indigo-400' :
                    i === 3 ? 'border-indigo-500 bg-indigo-500/20 text-indigo-500' :
                    i === 4 ? 'border-purple-500 bg-purple-500/20 text-purple-500' :
                    'border-white bg-white/20 text-white'
                  }`}
                >
                  <Crown className="w-4 h-4" fill="currentColor" />
                </div>
                <div className="text-[10px] text-esport-text-muted uppercase font-bold tracking-wider">{tier}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Compare Plans */}
        <div className="mb-32">
          <h3 className="text-3xl font-bold text-center mb-12 font-display uppercase tracking-tight">Compare plans</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse min-w-[800px]">
              <thead>
                <tr>
                  <th className="p-4 border-b border-esport-border font-bold text-lg w-1/2">Features</th>
                  <th className="p-4 border-b border-esport-border text-center">
                    <div className="font-bold mb-1">FREE</div>
                    <div className="text-xs text-esport-text-muted mb-2">CURRENT</div>
                  </th>
                  <th className="p-4 border-b border-esport-border text-center">
                    <div className="font-bold mb-1">HUSTLE PLUS</div>
                    <div className="text-xs text-esport-accent mb-2">$4.17/month</div>
                    <button className="text-xs border border-esport-accent text-esport-accent px-3 py-1 rounded hover:bg-esport-accent/10 transition-colors font-bold tracking-wider">UPGRADE</button>
                  </th>
                  <th className="p-4 border-b border-esport-border text-center">
                    <div className="font-bold mb-1">HUSTLE PRIME</div>
                    <div className="text-xs text-esport-accent mb-2">$7.99/month</div>
                    <button className="text-xs bg-esport-accent text-white font-bold px-3 py-1 rounded hover:bg-esport-accent-hover transition-colors tracking-wider">UPGRADE</button>
                  </th>
                </tr>
              </thead>
              <tbody className="text-sm">
                {[
                  { name: 'Subscription badge', desc: 'Show your subscription badge, with Prime tier badges that level up the longer you subscribe.', free: false, plus: 'badge', prime: 'badge' },
                  { name: 'Free rank system', desc: 'Grind Elo rating to climb skill levels all the way up to the Pro League.', free: true, plus: true, prime: true },
                  { name: 'Free matchmaking', desc: 'Compete with +30M competitive players.', free: true, plus: true, prime: true },
                  { name: 'Priority Queue Access', desc: 'Ensure a more balanced matchmaking experience with matches that always respect specific characteristics and rules.', free: false, plus: true, prime: true },
                  { name: 'Guaranteed Veteran-Only Lobbies', desc: 'Veteran subscribers can toggle Veteran Only to be matched exclusively with veteran accounts.', badge: 'NEW', free: false, plus: true, prime: true },
                  { name: 'Verified-Only Arenas', desc: 'Verified players can toggle Verified Only to be matched exclusively with verified accounts.', free: false, plus: true, prime: true },
                  { name: 'Map selection', desc: 'Select 5 maps you prefer to play on.', free: false, plus: true, prime: true },
                  { name: 'Prime Bounties', desc: 'Complete missions and earn rare Skins and Points.', free: false, plus: false, prime: true },
                  { name: 'Elite Leaderboards', desc: 'Climb the new Prime ladders available each week and win your share of Points and skins.', free: false, plus: false, prime: true },
                  { name: 'Match highlights', desc: 'Relive your epic in-game actions—no client needed! Key highlights are auto-captured for easy viewing and sharing.', free: false, plus: false, prime: true },
                ].map((feature, i) => (
                  <tr key={i} className="border-b border-esport-border/50 hover:bg-white/5 transition-colors">
                    <td className="p-4">
                      <div className="font-bold mb-1 flex items-center gap-2">
                        {feature.name}
                        {feature.badge && <span className="bg-esport-accent text-white text-[10px] px-1.5 py-0.5 rounded font-bold">{feature.badge}</span>}
                      </div>
                      <div className="text-xs text-esport-text-muted">{feature.desc}</div>
                    </td>
                    <td className="p-4 text-center">
                      {feature.free === true ? <CheckCircle2 className="w-5 h-5 text-esport-text-muted mx-auto" /> : null}
                    </td>
                    <td className="p-4 text-center">
                      {feature.plus === true ? <CheckCircle2 className="w-5 h-5 text-esport-accent mx-auto" /> : 
                       feature.plus === 'badge' ? <div className="w-5 h-5 rounded-full border border-esport-accent flex items-center justify-center mx-auto"><Crown className="w-3 h-3 text-esport-accent" /></div> : null}
                    </td>
                    <td className="p-4 text-center">
                      {feature.prime === true ? <CheckCircle2 className="w-5 h-5 text-esport-accent mx-auto" /> : 
                       feature.prime === 'badge' ? <div className="w-5 h-5 rounded-full border border-esport-accent flex items-center justify-center mx-auto bg-esport-accent/20"><Crown className="w-3 h-3 text-esport-accent" fill="currentColor" /></div> : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="text-center mt-4">
              <button className="text-xs border border-esport-border text-esport-text-muted px-4 py-2 rounded hover:text-white hover:border-gray-500 flex items-center justify-center mx-auto gap-2 transition-colors font-bold tracking-wider">
                SEE ALL FEATURES <ChevronDown className="w-3 h-3" />
              </button>
            </div>
          </div>
        </div>

        {/* FAQ */}
        <div className="max-w-3xl mx-auto mb-32">
          <h3 className="text-3xl font-bold text-center mb-12 font-display uppercase tracking-tight">Frequently asked questions</h3>
          <div className="space-y-4">
            {[
              'What is HUSTLE PRIME?',
              'Does my subscription renew automatically?',
              'What payment methods are available?',
              'How do I gift a subscription?',
              'How long are the subscriptions for?'
            ].map((q, i) => (
              <div key={i} className="border-b border-esport-border pb-4">
                <button className="w-full flex items-center justify-between font-bold text-left hover:text-white text-esport-text-muted transition-colors">
                  {q}
                  <ChevronDown className="w-5 h-5 text-esport-text-muted" />
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Footer CTA */}
        <div className="relative text-center py-20">
          <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-full max-w-4xl h-64 bg-esport-accent/10 blur-[100px] rounded-full pointer-events-none" />
          
          <div className="relative z-10">
            <div className="w-16 h-16 mx-auto bg-esport-card border-2 border-esport-accent rounded-xl flex items-center justify-center mb-6 transform rotate-45">
              <Crown className="text-esport-accent w-8 h-8 -rotate-45" fill="currentColor" />
            </div>
            
            <h2 className="text-4xl font-bold mb-4 font-display uppercase tracking-tight">
              Unlock exclusive features<br />with HUSTLE PRIME
            </h2>
            
            <div className="flex flex-wrap items-center justify-center gap-4 text-sm font-bold mb-8 text-esport-text-muted">
              <span>Priority Queue Access</span>
              <span className="w-1 h-1 rounded-full bg-esport-border hidden sm:block" />
              <span>Map Selection</span>
              <span className="w-1 h-1 rounded-full bg-esport-border hidden sm:block" />
              <span>Captain Priority</span>
            </div>
            
            <button className="esport-btn-primary py-3 px-8 text-lg mx-auto">
              UPGRADE TO PRIME
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}

// --- New Components ---

// --- Sub-Components ---

function DynamicImage({ prompt, className }: { prompt: string, className?: string }) {
  // Map prompts to high-quality static esports/gaming images from Unsplash
  // This ensures images look great and work perfectly when pushed to Git without needing an API key.
  const imageMap: Record<string, string> = {
    "A cinematic, high-energy esports arena with neon lights, a large screen showing a competitive game like CS:GO or Valorant, and a cheering crowd in the background. Futuristic aesthetic, 4k, professional photography.": "https://images.unsplash.com/photo-1542751371-adc38448a05e?q=80&w=1920&auto=format&fit=crop",
    "A professional esports player sitting in a high-tech gaming chair, wearing a headset, focused on a glowing monitor. Intense atmosphere, neon blue lighting, high detail.": "https://images.unsplash.com/photo-1511512578047-dfb367046420?q=80&w=1920&auto=format&fit=crop",
    "esports tactical shooter tournament stage with players at computers": "https://images.unsplash.com/photo-1552820728-8b83bb6b773f?q=80&w=1920&auto=format&fit=crop",
    "esports battle royale tournament stage with players at computers": "https://images.unsplash.com/photo-1538481199005-c710c4e965fc?q=80&w=1920&auto=format&fit=crop",
    "esports moba tournament stage with players at computers": "https://images.unsplash.com/photo-1560253023-3ec5d502959f?q=80&w=1920&auto=format&fit=crop",
    "A collection of high-end esports gaming peripherals: a glowing mechanical keyboard, a precision mouse, and a sleek headset on a dark desk. Cyberpunk aesthetic, neon cyan accents, professional esports gear.": "https://images.unsplash.com/photo-1612287230202-1ff1d85d1bdf?q=80&w=1920&auto=format&fit=crop",
    "esports 5v5 tactical shooter gameplay screenshot": "https://images.unsplash.com/photo-1502086223501-7ea6ecd79368?q=80&w=1920&auto=format&fit=crop",
    "esports 2v2 tactical shooter gameplay screenshot": "https://images.unsplash.com/photo-1550745165-9bc0b252726f?q=80&w=1920&auto=format&fit=crop",
    "esports battle royale gameplay screenshot": "https://images.unsplash.com/photo-1542751110-97427bbecf20?q=80&w=1920&auto=format&fit=crop",
    "esports tournament stage with players and large screen": "https://images.unsplash.com/photo-1511882150382-421056c89033?q=80&w=1920&auto=format&fit=crop",
    "esports gameplay highlight screenshot 1": "https://images.unsplash.com/photo-1534423861386-85a16f5d13fd?q=80&w=1920&auto=format&fit=crop",
    "esports gameplay highlight screenshot 2": "https://images.unsplash.com/photo-1542751110-97427bbecf20?q=80&w=1920&auto=format&fit=crop",
    "esports gameplay highlight screenshot 3": "https://images.unsplash.com/photo-1552820728-8b83bb6b773f?q=80&w=1920&auto=format&fit=crop"
  };

  // Fallback to a generic gaming image if prompt not found
  const imageUrl = imageMap[prompt] || "https://images.unsplash.com/photo-1542751371-adc38448a05e?q=80&w=1920&auto=format&fit=crop";

  return (
    <motion.img 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      src={imageUrl} 
      className={className} 
      referrerPolicy="no-referrer"
      alt={prompt}
    />
  );
}

function LandingPage({ onLogin }: { onLogin: () => void }) {
  return (
    <div className="min-h-screen bg-esport-bg overflow-x-hidden">
      {/* Navbar */}
      <nav className="glass-header h-20 flex items-center justify-between px-12 fixed w-full top-0 z-50">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 h-12">
            <div className="h-full aspect-square rounded bg-esport-accent flex items-center justify-center">
              <Gamepad2 className="text-black w-3/4 h-3/4" />
            </div>
            <span className="font-display font-bold text-2xl tracking-wider text-white">HUSTLE</span>
          </div>
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
            prompt="A cinematic, high-energy esports arena with neon lights, a large screen showing a competitive game like CS:GO or Valorant, and a cheering crowd in the background. Futuristic aesthetic, 4k, professional photography." 
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
            { title: "Hustle Strike Invitational", prize: "$50,000", game: "Tactical Shooter", img: "esports tactical shooter tournament stage with players at computers" },
            { title: "Cyber League Masters", prize: "$25,000", game: "Battle Royale", img: "esports battle royale tournament stage with players at computers" },
            { title: "Hustle Arena Open", prize: "$10,000", game: "MOBA Championship", img: "esports moba tournament stage with players at computers" }
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
                prompt="A collection of high-end esports gaming peripherals: a glowing mechanical keyboard, a precision mouse, and a sleek headset on a dark desk. Cyberpunk aesthetic, neon cyan accents, professional esports gear." 
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
            <div className="flex items-center gap-2 h-8">
              <div className="h-full aspect-square rounded bg-esport-accent flex items-center justify-center">
                <Gamepad2 className="text-black w-3/4 h-3/4" />
              </div>
              <span className="font-display font-bold text-lg tracking-wider text-white">HUSTLE</span>
            </div>
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

  const isFirebaseConfigured = true; // Since we are using the provisioned Firebase

  const handleSubmit = async () => {
    setError("");
    setLoading(true);

    try {
      if (mode === "login") {
        const userCredential = await signInWithEmailAndPassword(auth, email, password);
        // onAuthStateChanged will handle the rest
      } else {
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        // Profile creation is handled in onAuthStateChanged
        setMode("login");
        alert("Registration successful! You can now sign in.");
      }
    } catch (err: any) {
      console.error("Auth error:", err);
      setError(err.message || "Authentication failed");
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setError("");
    setLoading(true);
    try {
      await signInWithPopup(auth, googleProvider);
      // onAuthStateChanged will handle the rest
    } catch (err: any) {
      console.error("Google Auth error:", err);
      if (err.code === 'auth/unauthorized-domain') {
        setError("Domain not authorized. Please add '" + window.location.hostname + "' to your Firebase Console -> Authentication -> Settings -> Authorized domains.");
      } else {
        setError(err.message || "Google Authentication failed");
      }
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

      {!isFirebaseConfigured && (
        <div className="p-4 rounded-xl bg-esport-accent/10 border border-esport-accent/30 text-esport-accent text-[10px] leading-relaxed font-medium">
          <div className="flex items-center gap-2 mb-2 text-xs font-bold uppercase tracking-wider">
            <AlertCircle size={14} />
            Configuration Required
          </div>
          Firebase is not configured.
        </div>
      )}

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
        <button 
          onClick={handleGoogleSignIn}
          className="esport-btn-secondary py-3 text-xs flex items-center justify-center gap-2 group"
        >
          <img src="https://upload.wikimedia.org/wikipedia/commons/c/c1/Google_%22G%22_logo.svg" className="w-5 h-5 group-hover:scale-110 transition-transform" />
          Google
        </button>
      </div>
    </div>
  );
}

function KYCForm({ addToast, user }: { addToast: any, user: any }) {
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [documents, setDocuments] = useState<{ idFront?: string, addressProof?: string, selfie?: string }>({});
  const [personalInfo, setPersonalInfo] = useState({
    firstName: "",
    lastName: "",
    phone: "",
    address: "",
    city: "",
    country: "Israel"
  });
  
  const idInputRef = useRef<HTMLInputElement>(null);
  const addressInputRef = useRef<HTMLInputElement>(null);
  const selfieInputRef = useRef<HTMLInputElement>(null);

  const compressImage = (base64Str: string, maxWidth = 800, maxHeight = 600): Promise<string> => {
    return new Promise((resolve) => {
      const img = new Image();
      img.src = base64Str;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > maxWidth) {
            height *= maxWidth / width;
            width = maxWidth;
          }
        } else {
          if (height > maxHeight) {
            width *= maxHeight / height;
            height = maxHeight;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx?.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', 0.6)); // Compress to JPEG with 60% quality
      };
    });
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>, type: 'idFront' | 'addressProof' | 'selfie') => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = async () => {
        const compressed = await compressImage(reader.result as string);
        setDocuments(prev => ({ ...prev, [type]: compressed }));
        addToast(`${type.replace(/([A-Z])/g, ' $1')} uploaded and optimized!`, "success");
      };
      reader.readAsDataURL(file);
    }
  };

  const uploadKycDocument = async (type: 'idFront' | 'addressProof' | 'selfie', dataUrl: string) => {
    const docRef = ref(storage, `kyc/${user.id}/${type}-${Date.now()}.jpg`);
    await uploadString(docRef, dataUrl, "data_url");
    return getDownloadURL(docRef);
  };

  const submitKYC = async () => {
    if (!user?.id) return;
    if (!documents.idFront || !documents.addressProof || !documents.selfie) {
      addToast("Please upload all required documents", "error");
      return;
    }
    if (!personalInfo.firstName || !personalInfo.lastName || !personalInfo.phone || !personalInfo.address) {
      addToast("Please fill in all personal details", "error");
      return;
    }
    setLoading(true);
    try {
      const [idFrontUrl, addressProofUrl, selfieUrl] = await Promise.all([
        uploadKycDocument("idFront", documents.idFront!),
        uploadKycDocument("addressProof", documents.addressProof!),
        uploadKycDocument("selfie", documents.selfie!),
      ]);

      await updateDoc(doc(db, "users", user.id), {
        kycStatus: "pending",
        kycUpdatedAt: serverTimestamp(),
        kycMessage: null,
        kycDocuments: {
          idFront: idFrontUrl,
          addressProof: addressProofUrl,
          selfie: selfieUrl
        },
        kycDetails: personalInfo
      });
      addToast("KYC Documents submitted for review!", "success");
    } catch (error) {
      console.error("KYC submission error:", error);
      addToast("Failed to submit KYC. Please check Firebase Storage rules/config.", "error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <input type="file" ref={idInputRef} style={{ opacity: 0, position: 'absolute', zIndex: -1 }} accept="image/*" onChange={(e) => handleFileChange(e, 'idFront')} />
      <input type="file" ref={addressInputRef} style={{ opacity: 0, position: 'absolute', zIndex: -1 }} accept="image/*" onChange={(e) => handleFileChange(e, 'addressProof')} />
      <input type="file" ref={selfieInputRef} style={{ opacity: 0, position: 'absolute', zIndex: -1 }} accept="image/*" onChange={(e) => handleFileChange(e, 'selfie')} />

      {user?.kycStatus === 'rejected' && (
        <div className="p-4 bg-esport-danger/10 border border-esport-danger/30 rounded-xl text-esport-danger text-sm font-bold flex items-center gap-3">
          <ShieldAlert size={20} />
          <div>
            <div className="uppercase tracking-wider">KYC Rejected</div>
            <div className="text-xs opacity-80 font-normal mt-1">{user.kycMessage || "Please re-submit your documents."}</div>
          </div>
        </div>
      )}
      <div className="flex justify-between mb-8">
        {[1, 2, 3, 4].map(i => (
          <div key={i} className={`flex items-center gap-2 ${step >= i ? 'text-esport-accent' : 'text-esport-text-muted'}`}>
            <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center text-[10px] font-bold ${step >= i ? 'border-esport-accent bg-esport-accent/10' : 'border-esport-border'}`}>
              {i}
            </div>
            <span className="text-[10px] uppercase font-bold tracking-widest">
              {i === 1 ? 'Details' : i === 2 ? 'Identity' : i === 3 ? 'Address' : 'Selfie'}
            </span>
          </div>
        ))}
      </div>

      {step === 1 && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-esport-text-muted uppercase tracking-widest">First Name</label>
              <input 
                type="text" 
                className="w-full bg-white/5 border border-esport-border rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-esport-accent/50"
                value={personalInfo.firstName}
                onChange={(e) => setPersonalInfo({...personalInfo, firstName: e.target.value})}
              />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-esport-text-muted uppercase tracking-widest">Last Name</label>
              <input 
                type="text" 
                className="w-full bg-white/5 border border-esport-border rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-esport-accent/50"
                value={personalInfo.lastName}
                onChange={(e) => setPersonalInfo({...personalInfo, lastName: e.target.value})}
              />
            </div>
          </div>
          <div className="space-y-1">
            <label className="text-[10px] font-bold text-esport-text-muted uppercase tracking-widest">Phone Number</label>
            <input 
              type="tel" 
              className="w-full bg-white/5 border border-esport-border rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-esport-accent/50"
              value={personalInfo.phone}
              onChange={(e) => setPersonalInfo({...personalInfo, phone: e.target.value})}
            />
          </div>
          <div className="space-y-1">
            <label className="text-[10px] font-bold text-esport-text-muted uppercase tracking-widest">Full Address</label>
            <input 
              type="text" 
              className="w-full bg-white/5 border border-esport-border rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-esport-accent/50"
              value={personalInfo.address}
              onChange={(e) => setPersonalInfo({...personalInfo, address: e.target.value})}
            />
          </div>
          <button 
            onClick={() => setStep(2)} 
            disabled={!personalInfo.firstName || !personalInfo.lastName || !personalInfo.phone || !personalInfo.address}
            className="esport-btn-primary w-full disabled:opacity-50"
          >
            Next Step
          </button>
        </div>
      )}

      {step === 2 && (
        <div className="space-y-4">
          <p className="text-sm text-esport-text-muted">Please upload a clear photo of your government-issued ID (Passport or Driver's License).</p>
          <div 
            onClick={() => idInputRef.current?.click()}
            className={cn(
              "h-40 border-2 border-dashed rounded-xl flex flex-col items-center justify-center gap-3 transition-all cursor-pointer",
              documents.idFront ? "border-esport-success bg-esport-success/5" : "border-esport-border bg-white/5 hover:border-esport-accent/50"
            )}
          >
            {documents.idFront ? (
              <img src={documents.idFront} className="h-full w-full object-contain p-2" />
            ) : (
              <>
                <Plus size={32} className="text-esport-text-muted" />
                <span className="text-xs font-bold text-esport-text-muted uppercase">Upload ID Front</span>
              </>
            )}
          </div>
          <div className="flex gap-4">
            <button onClick={() => setStep(1)} className="esport-btn-secondary flex-1">Back</button>
            <button onClick={() => setStep(3)} disabled={!documents.idFront} className="esport-btn-primary flex-1 disabled:opacity-50">Next Step</button>
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="space-y-4">
          <p className="text-sm text-esport-text-muted">Please provide a utility bill or bank statement from the last 3 months as proof of residence.</p>
          <div 
            onClick={() => addressInputRef.current?.click()}
            className={cn(
              "h-40 border-2 border-dashed rounded-xl flex flex-col items-center justify-center gap-3 transition-all cursor-pointer",
              documents.addressProof ? "border-esport-success bg-esport-success/5" : "border-esport-border bg-white/5 hover:border-esport-accent/50"
            )}
          >
            {documents.addressProof ? (
              <img src={documents.addressProof} className="h-full w-full object-contain p-2" />
            ) : (
              <>
                <Plus size={32} className="text-esport-text-muted" />
                <span className="text-xs font-bold text-esport-text-muted uppercase">Upload Proof of Address</span>
              </>
            )}
          </div>
          <div className="flex gap-4">
            <button onClick={() => setStep(2)} className="esport-btn-secondary flex-1">Back</button>
            <button onClick={() => setStep(4)} disabled={!documents.addressProof} className="esport-btn-primary flex-1 disabled:opacity-50">Next Step</button>
          </div>
        </div>
      )}

      {step === 4 && (
        <div className="space-y-4">
          <p className="text-sm text-esport-text-muted">Finally, take a live selfie holding your ID to verify your identity.</p>
          <div 
            onClick={() => selfieInputRef.current?.click()}
            className={cn(
              "h-40 border-2 border-dashed rounded-xl flex flex-col items-center justify-center gap-3 transition-all cursor-pointer",
              documents.selfie ? "border-esport-success bg-esport-success/5" : "border-esport-border bg-white/5 hover:border-esport-accent/50"
            )}
          >
            {documents.selfie ? (
              <img src={documents.selfie} className="h-full w-full object-contain p-2" />
            ) : (
              <>
                <User size={32} className="text-esport-text-muted" />
                <span className="text-xs font-bold text-esport-text-muted uppercase">Upload Selfie</span>
              </>
            )}
          </div>
          <div className="flex gap-4">
            <button onClick={() => setStep(3)} className="esport-btn-secondary flex-1">Back</button>
            <button 
              onClick={submitKYC} 
              disabled={loading || !documents.selfie}
              className="esport-btn-primary flex-1 disabled:opacity-50"
            >
              {loading ? "Submitting..." : "Submit KYC"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function DepositPage({ addToast }: { addToast: any }) {
  const btcAddress = "bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh"; // Placeholder BTC Address
  
  const copyToClipboard = () => {
    navigator.clipboard.writeText(btcAddress);
    addToast("Address copied to clipboard!", "success");
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      <div className="text-center space-y-4">
        <h3 className="text-4xl font-display font-bold uppercase tracking-tight text-white">Crypto Deposit</h3>
        <p className="text-esport-text-muted max-w-xl mx-auto">
          Fund your account with Bitcoin to start competing in high-stakes tournaments. 
          Credits are added automatically after 2 network confirmations.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        <div className="esport-card p-8 flex flex-col items-center justify-center space-y-6">
          <div className="bg-white p-4 rounded-2xl shadow-[0_0_50px_rgba(255,255,255,0.1)]">
            <img 
              src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${btcAddress}`} 
              alt="BTC QR Code" 
              className="w-48 h-48"
            />
          </div>
          <div className="text-center">
            <div className="text-[10px] font-bold text-esport-accent uppercase tracking-widest mb-1">Scan to Pay</div>
            <div className="text-xs text-esport-text-muted">Supports all major BTC wallets</div>
          </div>
        </div>

        <div className="esport-card p-8 space-y-8">
          <div className="space-y-4">
            <label className="text-[10px] font-bold text-esport-text-muted uppercase tracking-widest">Your Personal BTC Address</label>
            <div className="flex gap-2">
              <div className="flex-1 bg-black/40 border border-esport-border rounded-xl px-4 py-4 font-mono text-sm break-all text-white">
                {btcAddress}
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
                <div className="text-xs font-bold text-white">Secure Transaction</div>
                <div className="text-[10px] text-esport-text-muted">Funds are held in escrow until confirmation</div>
              </div>
            </div>
            <div className="flex items-center gap-3 p-4 bg-white/5 border border-esport-border rounded-xl">
              <div className="w-10 h-10 rounded-full bg-esport-success/10 flex items-center justify-center text-esport-success">
                <Activity size={20} />
              </div>
              <div>
                <div className="text-xs font-bold text-white">Live Tracking</div>
                <div className="text-[10px] text-esport-text-muted">Status updates in real-time below</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="esport-card p-6">
        <h4 className="text-sm font-bold uppercase tracking-widest text-white mb-4">Recent Deposits</h4>
        <div className="text-center py-12 text-esport-text-muted text-sm italic">
          No recent transactions found.
        </div>
      </div>
    </div>
  );
}

function AdminPanel({ addToast }: { addToast: any }) {
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [rejectingUser, setRejectingUser] = useState<any>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [editingUser, setEditingUser] = useState<any>(null);
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [previewDocument, setPreviewDocument] = useState<{ url: string, label: string } | null>(null);
  const kycFilterOptions = ["all", "none", "pending", "verified", "rejected"] as const;

  useEffect(() => {
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
      if (action === "approve") {
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
      await updateDoc(doc(db, "users", userId), { [field]: value });
      addToast(`User ${field} updated`, "success");
    } catch (error) {
      addToast("Update failed", "error");
    }
  };

  const handleEditingUserKycStatusChange = async (nextStatus: string) => {
    if (!editingUser?.id) return;
    if (nextStatus === "rejected") {
      setRejectReason(editingUser.kycMessage || "");
      setRejectingUser(editingUser);
      return;
    }

    await updateUserField(editingUser.id, "kycStatus", nextStatus);
    if (nextStatus === "verified") {
      await updateUserField(editingUser.id, "kycMessage", null);
    }
  };

  const filteredUsers = users.filter(user => {
    const matchesSearch = user.username?.toLowerCase().includes(searchQuery.toLowerCase()) || 
                         user.email?.toLowerCase().includes(searchQuery.toLowerCase());
    const userKycStatus = user.kycStatus || "none";
    const matchesFilter = filterStatus === "all" || userKycStatus === filterStatus;
    return matchesSearch && matchesFilter;
  });

  const kycCounts = {
    all: users.length,
    none: users.filter(u => (u.kycStatus || "none") === "none").length,
    pending: users.filter(u => u.kycStatus === "pending").length,
    verified: users.filter(u => u.kycStatus === "verified").length,
    rejected: users.filter(u => u.kycStatus === "rejected").length,
  };

  const stats = {
    total: users.length,
    verified: users.filter(u => u.kycStatus === 'verified').length,
    pending: users.filter(u => u.kycStatus === 'pending').length,
    totalCredits: users.reduce((acc, u) => acc + (u.stats?.credits || 0), 0),
    admins: users.filter(u => u.role === 'admin').length
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
              <div className="text-[10px] font-bold text-esport-text-muted uppercase">Credits Circ.</div>
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
          <div className="w-full md:w-auto">
            <div className="text-[10px] font-bold uppercase tracking-widest text-esport-text-muted mb-2">Filter by KYC Status</div>
            <div className="flex gap-2 overflow-x-auto pb-2 md:pb-0">
            {kycFilterOptions.map(status => (
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
                {status} ({kycCounts[status]})
              </button>
            ))}
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-esport-border text-[10px] font-bold uppercase tracking-widest text-esport-text-muted">
                <th className="p-6">User</th>
                <th className="p-6">Role</th>
                <th className="p-6">Credits</th>
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
                  onChange={(e) => handleEditingUserKycStatusChange(e.target.value)}
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
                        onClick={() => setPreviewDocument({ url, label: key })}
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
                    const amount = prompt("Enter credits to add:");
                    if (amount) {
                      const newCredits = (editingUser.stats?.credits || 0) + parseInt(amount);
                      updateUserField(editingUser.id, "stats", { ...editingUser.stats, credits: newCredits });
                    }
                  }}
                  className="flex items-center justify-center gap-2 p-4 bg-esport-accent/10 border border-esport-accent/20 rounded-xl text-esport-accent font-bold text-xs hover:bg-esport-accent hover:text-esport-bg transition-all"
                >
                  <Star size={16} /> Add Credits
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

      {previewDocument && (
        <div className="fixed inset-0 bg-black/90 z-[120] flex items-center justify-center p-4" onClick={() => setPreviewDocument(null)}>
          <div className="max-w-5xl w-full max-h-[90vh] relative" onClick={(e) => e.stopPropagation()}>
            <button
              onClick={() => setPreviewDocument(null)}
              className="absolute -top-10 right-0 text-white/80 hover:text-white"
            >
              <X size={24} />
            </button>
            <div className="text-xs uppercase tracking-widest text-esport-text-muted mb-3">{previewDocument.label}</div>
            <img src={previewDocument.url} className="w-full max-h-[85vh] object-contain rounded-xl border border-esport-border bg-black/50" />
          </div>
        </div>
      )}
    </div>
  );
}
