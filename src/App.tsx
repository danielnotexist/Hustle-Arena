/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { motion } from "motion/react";
import { 
  Search, 
  Users, 
  Gamepad2, 
  Trophy, 
  LineChart, 
  Tv, 
  Rss, 
  Shield, 
  Plus, 
  Bell, 
  MessageSquare, 
  Settings,
  ChevronRight,
  Zap,
  Target,
  Flag,
  UserPlus,
  Star,
  Sword,
  Activity,
  PlayCircle,
  ShoppingBag,
  Crown,
  Filter,
  MoreVertical,
  User
} from "lucide-react";
import React, { useState } from "react";

export default function App() {
  const [activeTab, setActiveTab] = useState("Battlefield");

  const menuItems = [
    { id: "Squad Hub", icon: <Users size={20} />, label: "Squad Hub" },
    { id: "Battlefield", icon: <Sword size={20} />, label: "Battlefield" },
    { id: "Leaderboard", icon: <Trophy size={20} />, label: "Apex List" },
    { id: "Analytics", icon: <Activity size={20} />, label: "Neural Map" },
    { id: "Live Stream", icon: <PlayCircle size={20} />, label: "Nexus TV" },
    { id: "Pulse", icon: <Zap size={20} />, label: "Pulse" },
  ];

  const guildItems = [
    { id: "Syndicates", icon: <Shield size={20} />, label: "Syndicates" },
    { id: "Missions", icon: <Target size={20} />, label: "Missions" },
    { id: "Vault", icon: <ShoppingBag size={20} />, label: "Vault" },
    { id: "Neon Prime", icon: <Crown size={20} className="text-cyber-accent" />, label: "Neon Prime" },
  ];

  return (
    <div className="flex h-screen bg-cyber-bg text-white overflow-hidden font-sans">
      {/* Left Navigation Sidebar */}
      <aside className="w-64 bg-cyber-sidebar flex flex-col border-r border-cyber-border z-30 shadow-2xl">
        <div className="p-6 flex items-center gap-3 group cursor-pointer">
          <div className="w-10 h-10 bg-cyber-accent rounded-lg flex items-center justify-center shadow-[0_0_20px_rgba(0,240,255,0.4)] group-hover:scale-110 transition-transform">
            <Zap className="text-black" size={24} fill="currentColor" />
          </div>
          <div className="relative">
            <span className="text-xl font-display font-bold tracking-tighter uppercase italic">Nexus<span className="text-cyber-accent">Arena</span></span>
            <div className="absolute -inset-1 bg-cyber-accent/20 blur-sm opacity-0 group-hover:opacity-100 transition-opacity" />
          </div>
        </div>
        
        <div className="px-4 mb-6">
          <div className="relative group">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-cyber-text-muted group-focus-within:text-cyber-accent transition-colors" size={16} />
            <input 
              type="text" 
              placeholder="Search Nexus..." 
              className="w-full bg-white/5 border border-cyber-border rounded-lg py-2 pl-10 pr-4 text-sm focus:outline-none focus:border-cyber-accent/50 transition-all"
            />
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto custom-scrollbar px-2 space-y-1">
          <div className="text-[10px] font-bold text-cyber-text-muted uppercase tracking-widest px-4 mb-2">Main Menu</div>
          {menuItems.map((item) => (
            <SidebarItem 
              key={item.id}
              icon={item.icon} 
              label={item.label} 
              active={activeTab === item.id} 
              onClick={() => setActiveTab(item.id)} 
            />
          ))}
          
          <div className="h-px bg-cyber-border my-6 mx-4" />
          
          <div className="text-[10px] font-bold text-cyber-text-muted uppercase tracking-widest px-4 mb-2">Community</div>
          {guildItems.map((item) => (
            <SidebarItem 
              key={item.id}
              icon={item.icon} 
              label={item.label} 
              active={activeTab === item.id} 
              onClick={() => setActiveTab(item.id)} 
            />
          ))}
        </nav>

        <div className="p-4 border-t border-cyber-border">
          <div className="flex items-center gap-3 p-2 rounded-lg hover:bg-white/5 cursor-pointer transition-all">
            <div className="w-10 h-10 rounded-full border-2 border-cyber-accent p-0.5 shadow-[0_0_10px_rgba(0,240,255,0.2)]">
              <img src="https://picsum.photos/seed/user/100/100" className="w-full h-full rounded-full" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-bold truncate">CyberGhost_99</div>
              <div className="text-[10px] text-cyber-accent font-bold uppercase">Level 42</div>
            </div>
            <Settings size={16} className="text-cyber-text-muted hover:text-white" />
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col overflow-hidden relative">
        {/* Top Header */}
        <header className="h-16 border-b border-cyber-border bg-cyber-sidebar/50 backdrop-blur-xl flex items-center justify-between px-8 shrink-0 z-20">
          <div className="flex items-center gap-6">
            <h2 className="text-xl font-display font-bold uppercase tracking-tight">
              {[...menuItems, ...guildItems].find(i => i.id === activeTab)?.label || activeTab}
            </h2>
            {activeTab === "Squad Hub" && (
              <div className="flex bg-white/5 rounded-lg p-1 border border-cyber-border">
                <button className="px-4 py-1 text-xs font-bold bg-cyber-accent text-black rounded-md shadow-lg">Global</button>
                <button className="px-4 py-1 text-xs font-bold text-cyber-text-muted hover:text-white transition-colors">Friends</button>
                <button className="px-4 py-1 text-xs font-bold text-cyber-text-muted hover:text-white transition-colors">Nearby</button>
              </div>
            )}
          </div>
          
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 px-3 py-1.5 bg-cyber-secondary/20 border border-cyber-secondary/30 rounded-full">
              <Star size={14} className="text-cyber-secondary fill-cyber-secondary" />
              <span className="text-xs font-bold">2,450 Credits</span>
            </div>
            <button className="relative p-2 text-cyber-text-muted hover:text-white transition-colors">
              <Bell size={20} />
              <span className="absolute top-2 right-2 w-2 h-2 bg-cyber-accent rounded-full shadow-[0_0_10px_rgba(0,240,255,0.8)]" />
            </button>
            <button className="p-2 text-cyber-text-muted hover:text-white transition-colors">
              <MessageSquare size={20} />
            </button>
          </div>
        </header>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto custom-scrollbar">
          <div className="max-w-[1600px] mx-auto p-8">
            {activeTab === "Squad Hub" ? (
              <SquadHubView />
            ) : activeTab === "Battlefield" ? (
              <BattlefieldView />
            ) : activeTab === "Leaderboard" ? (
              <LeaderboardView />
            ) : activeTab === "Analytics" ? (
              <AnalyticsView />
            ) : activeTab === "Live Stream" ? (
              <LiveStreamView />
            ) : activeTab === "Pulse" ? (
              <PulseView />
            ) : activeTab === "Syndicates" ? (
              <SyndicatesView />
            ) : activeTab === "Missions" ? (
              <MissionsView />
            ) : activeTab === "Vault" ? (
              <VaultView />
            ) : activeTab === "Neon Prime" ? (
              <NeonPrimeView />
            ) : (
              <div className="flex flex-col items-center justify-center h-[60vh] text-cyber-text-muted">
                <div className="w-24 h-24 bg-white/5 rounded-full flex items-center justify-center mb-6 border border-cyber-border">
                  <Activity size={48} className="opacity-20" />
                </div>
                <h3 className="text-2xl font-display font-bold text-white mb-2 uppercase tracking-widest">Under Construction</h3>
                <p>The {activeTab} module is being calibrated for optimal performance.</p>
              </div>
            )}
          </div>
        </div>
      </main>

      {/* Right Activity Sidebar */}
      <aside className="w-80 bg-cyber-sidebar border-l border-cyber-border hidden xl:flex flex-col z-30">
        <div className="p-6 border-b border-cyber-border">
          <h3 className="text-sm font-bold uppercase tracking-widest mb-4">Live Activity</h3>
          <div className="space-y-4">
            <ActivityItem 
              user="NeonViper" 
              action="joined a squad" 
              time="2m ago" 
              avatar="https://picsum.photos/seed/v1/40/40"
            />
            <ActivityItem 
              user="GlitchMaster" 
              action="won a tournament" 
              time="5m ago" 
              avatar="https://picsum.photos/seed/v2/40/40"
              highlight
            />
            <ActivityItem 
              user="PulseRunner" 
              action="unlocked Elite Access" 
              time="12m ago" 
              avatar="https://picsum.photos/seed/v3/40/40"
            />
          </div>
        </div>
        
        <div className="flex-1 overflow-y-auto custom-scrollbar p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-bold uppercase tracking-widest">Active Squads</h3>
            <span className="text-[10px] font-bold text-cyber-accent">42 Online</span>
          </div>
          <div className="space-y-3">
            {[1, 2, 3, 4, 5].map(i => (
              <div key={i} className="cyber-card p-3 flex items-center gap-3 group cursor-pointer">
                <div className="flex -space-x-2">
                  {[1, 2, 3].map(j => (
                    <img key={j} src={`https://picsum.photos/seed/s${i}${j}/30/30`} className="w-6 h-6 rounded-full border border-cyber-sidebar" />
                  ))}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-bold truncate">Elite Strike Team {i}</div>
                  <div className="text-[9px] text-cyber-text-muted uppercase">3/5 Members</div>
                </div>
                <ChevronRight size={14} className="text-cyber-text-muted group-hover:text-cyber-accent transition-colors" />
              </div>
            ))}
          </div>
        </div>

        <div className="p-6 bg-cyber-accent/5 border-t border-cyber-border">
          <div className="cyber-card p-4 bg-gradient-to-br from-cyber-secondary/20 to-transparent border-cyber-secondary/30">
            <div className="flex items-center gap-2 mb-2">
              <Crown size={16} className="text-cyber-secondary" />
              <span className="text-xs font-bold uppercase tracking-tighter">Elite Access</span>
            </div>
            <p className="text-[10px] text-cyber-text-muted mb-3">Unlock exclusive armory items and priority matchmaking.</p>
            <button className="w-full py-2 bg-cyber-secondary text-white text-[10px] font-bold uppercase tracking-widest rounded-md shadow-lg shadow-cyber-secondary/20">Upgrade Now</button>
          </div>
        </div>
      </aside>
    </div>
  );
}

interface SidebarItemProps {
  key?: string | number;
  icon: React.ReactNode;
  label: string;
  active?: boolean;
  onClick?: () => void;
  highlight?: boolean;
}

function SidebarItem({ icon, label, active = false, onClick, highlight = false }: SidebarItemProps) {
  return (
    <div 
      className={`sidebar-item group relative ${active ? 'active' : ''} ${highlight ? 'text-cyber-accent' : ''}`}
      onClick={onClick}
    >
      <div className={`transition-colors ${active ? 'text-cyber-accent' : 'text-cyber-text-muted group-hover:text-white'}`}>
        {icon}
      </div>
      <span className={`text-sm font-bold transition-colors ${active ? 'text-white' : 'text-cyber-text-muted group-hover:text-white'}`}>
        {label}
      </span>
      {active && (
        <motion.div 
          layoutId="activeIndicator"
          className="absolute right-0 w-1 h-6 bg-cyber-accent shadow-[0_0_10px_rgba(0,240,255,0.8)] rounded-l-full"
        />
      )}
    </div>
  );
}

function SquadHubView() {
  return (
    <div className="space-y-8">
      {/* Filters & Actions */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="relative">
            <Filter className="absolute left-3 top-1/2 -translate-y-1/2 text-cyber-text-muted" size={14} />
            <select className="bg-white/5 border border-cyber-border rounded-lg py-2 pl-10 pr-8 text-xs font-bold appearance-none focus:outline-none focus:border-cyber-accent/50">
              <option>All Game Modes</option>
              <option>Competitive 5v5</option>
              <option>Wingman 2v2</option>
              <option>Deathmatch</option>
            </select>
          </div>
          <div className="flex items-center gap-2 bg-white/5 border border-cyber-border rounded-lg px-3 py-2">
            <input type="checkbox" className="accent-cyber-accent" id="premium-only" />
            <label htmlFor="premium-only" className="text-xs font-bold text-cyber-text-muted cursor-pointer">Elite Only</label>
          </div>
        </div>
        <button className="cyber-btn-primary flex items-center gap-2">
          <Plus size={16} />
          Create Squad
        </button>
      </div>

      {/* Squad Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <SquadCard 
          title="The Shadow Realm"
          leader="imjozeph-"
          level="9"
          elo="1,930"
          members={4}
          maxMembers={5}
          tags={["English", "Israel", "Mic Required"]}
          image="https://picsum.photos/seed/squad1/400/200"
        />
        <SquadCard 
          title="Neon Knights"
          leader="K1R0_16"
          level="5"
          elo="1,083"
          members={2}
          maxMembers={5}
          tags={["EU", "Casual", "No Toxicity"]}
          image="https://picsum.photos/seed/squad2/400/200"
        />
        <SquadCard 
          title="Cyber Strike"
          leader="-Gutzz"
          level="3"
          elo="814"
          members={3}
          maxMembers={5}
          tags={["Competitive", "Discord", "5v5"]}
          image="https://picsum.photos/seed/squad3/400/200"
        />
        <SquadCard 
          title="Void Walkers"
          leader="bigdicra..."
          level="6"
          elo="1,247"
          members={1}
          maxMembers={5}
          tags={["Polski", "High Elo", "Tryhard"]}
          image="https://picsum.photos/seed/squad4/400/200"
        />
        {/* Empty Slot Card */}
        <div className="cyber-card border-dashed border-cyber-border flex flex-col items-center justify-center p-8 group cursor-pointer hover:bg-cyber-accent/5 transition-all min-h-[300px]">
          <div className="w-16 h-16 rounded-full border-2 border-dashed border-cyber-border flex items-center justify-center mb-4 group-hover:border-cyber-accent group-hover:scale-110 transition-all">
            <Plus size={32} className="text-cyber-text-muted group-hover:text-cyber-accent" />
          </div>
          <span className="text-sm font-bold uppercase tracking-widest text-cyber-text-muted group-hover:text-white">Start New Squad</span>
        </div>
      </div>
    </div>
  );
}

function SquadCard({ title, leader, level, elo, members, maxMembers, tags, image }: any) {
  return (
    <motion.div 
      whileHover={{ y: -5 }}
      className="cyber-card group"
    >
      <div className="relative h-32 overflow-hidden">
        <img src={image} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500 opacity-60" />
        <div className="absolute inset-0 bg-gradient-to-t from-cyber-sidebar to-transparent" />
        <div className="absolute top-4 right-4 bg-black/60 backdrop-blur-md px-2 py-1 rounded border border-white/10 flex items-center gap-2">
          <div className="w-2 h-2 bg-cyber-accent rounded-full animate-pulse" />
          <span className="text-[10px] font-bold uppercase">{members}/{maxMembers}</span>
        </div>
      </div>
      
      <div className="p-5 space-y-4">
        <div className="flex items-start justify-between">
          <div>
            <h3 className="text-lg font-bold uppercase tracking-tight group-hover:text-cyber-accent transition-colors">{title}</h3>
            <div className="flex items-center gap-2 text-xs text-cyber-text-muted">
              <User size={12} />
              <span>{leader}</span>
            </div>
          </div>
          <div className="flex flex-col items-end">
            <div className="text-xs font-bold text-cyber-accent">LVL {level}</div>
            <div className="text-[10px] text-cyber-text-muted font-mono">{elo} ELO</div>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {tags.map((tag: string) => (
            <span key={tag} className="text-[9px] font-bold uppercase tracking-widest px-2 py-1 bg-white/5 border border-cyber-border rounded text-cyber-text-muted">
              {tag}
            </span>
          ))}
        </div>

        <div className="pt-2">
          <button className="w-full py-2 bg-white/5 hover:bg-cyber-accent hover:text-black border border-cyber-border hover:border-cyber-accent rounded-lg text-xs font-bold uppercase tracking-widest transition-all">
            Request to Join
          </button>
        </div>
      </div>
    </motion.div>
  );
}

function BattlefieldView() {
  return (
    <div className="space-y-8">
      {/* Hero Banner */}
      <section className="relative h-[350px] rounded-2xl overflow-hidden border border-cyber-border group">
        <div className="absolute inset-0 bg-[url('https://picsum.photos/seed/battlefield/1200/600')] bg-cover bg-center group-hover:scale-105 transition-transform duration-1000" />
        <div className="absolute inset-0 bg-gradient-to-r from-cyber-bg via-cyber-bg/60 to-transparent" />
        
        <div className="relative h-full flex flex-col justify-center px-12 z-10 max-w-2xl">
          <div className="flex items-center gap-2 mb-4">
            <div className="px-2 py-1 bg-cyber-accent text-black text-[10px] font-bold uppercase rounded">Live Event</div>
            <span className="text-xs font-bold text-cyber-accent">Season 12: Neon Uprising</span>
          </div>
          <h1 className="text-4xl md:text-5xl font-display font-bold mb-4 leading-none uppercase italic tracking-tighter">
            Dominate the <span className="text-cyber-accent">Grid</span>
          </h1>
          <p className="text-cyber-text-muted text-sm mb-8 leading-relaxed">
            Join the most advanced competitive ecosystem. Real anti-cheat, 128-tick servers, and a direct path to professional leagues.
          </p>
          <div className="flex gap-4">
            <button className="cyber-btn-primary">Find Match</button>
            <button className="px-6 py-2 bg-white/5 hover:bg-white/10 border border-cyber-border rounded-sm text-sm font-bold uppercase tracking-widest transition-all">View Schedule</button>
          </div>
        </div>
      </section>

      {/* Game Modes */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <ModeCard 
          title="Competitive" 
          desc="Standard 5v5 tactical combat"
          icon={<Target size={32} />}
          accent="cyber-accent"
        />
        <ModeCard 
          title="Tournaments" 
          desc="Weekly cups with credit prizes"
          icon={<Trophy size={32} />}
          accent="cyber-secondary"
        />
        <ModeCard 
          title="Pro League" 
          desc="The path to professional play"
          icon={<Crown size={32} />}
          accent="white"
        />
      </div>
    </div>
  );
}

function ModeCard({ title, desc, icon, accent }: any) {
  const accentColor = accent === 'cyber-accent' ? 'text-cyber-accent' : accent === 'cyber-secondary' ? 'text-cyber-secondary' : 'text-white';
  const borderColor = accent === 'cyber-accent' ? 'group-hover:border-cyber-accent/50' : accent === 'cyber-secondary' ? 'group-hover:border-cyber-secondary/50' : 'group-hover:border-white/50';

  return (
    <div className={`cyber-card p-8 group cursor-pointer border-transparent hover:bg-white/5 ${borderColor}`}>
      <div className={`${accentColor} mb-6 transform group-hover:scale-110 transition-transform`}>
        {icon}
      </div>
      <h3 className="text-xl font-display font-bold uppercase mb-2 tracking-tight">{title}</h3>
      <p className="text-xs text-cyber-text-muted leading-relaxed">{desc}</p>
      <div className="mt-6 flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest opacity-0 group-hover:opacity-100 transition-opacity">
        <span>Enter Queue</span>
        <ChevronRight size={12} />
      </div>
    </div>
  );
}

function ActivityItem({ user, action, time, avatar, highlight = false }: any) {
  return (
    <div className="flex items-center gap-3">
      <img src={avatar} className="w-8 h-8 rounded-full border border-cyber-border" />
      <div className="flex-1 min-w-0">
        <div className="text-xs">
          <span className={`font-bold ${highlight ? 'text-cyber-accent' : 'text-white'}`}>{user}</span>
          <span className="text-cyber-text-muted"> {action}</span>
        </div>
        <div className="text-[10px] text-cyber-text-muted">{time}</div>
      </div>
    </div>
  );
}

function LeaderboardView() {
  const players = [
    { rank: 1, name: "qw1nk1", country: "RU", elo: "5,189", level: "10", avatar: "https://picsum.photos/seed/p1/100/100" },
    { rank: 2, name: "fame--", country: "RU", elo: "5,153", level: "10", avatar: "https://picsum.photos/seed/p2/100/100" },
    { rank: 3, name: "donk666", country: "KR", elo: "5,061", level: "10", avatar: "https://picsum.photos/seed/p3/100/100" },
    { rank: 4, name: "b1st-", country: "RU", elo: "5,060", level: "10", avatar: "https://picsum.photos/seed/p4/100/100" },
    { rank: 5, name: "executor", country: "RU", elo: "5,058", level: "10", avatar: "https://picsum.photos/seed/p5/100/100" },
  ];

  return (
    <div className="space-y-12">
      {/* Top 3 Spotlight */}
      <div className="flex flex-wrap justify-center items-end gap-8 pt-10">
        {/* Rank 2 */}
        <div className="flex flex-col items-center group">
          <div className="relative mb-4">
            <div className="w-24 h-24 rounded-full border-4 border-cyber-secondary p-1 shadow-[0_0_20px_rgba(112,0,255,0.4)] group-hover:scale-110 transition-transform">
              <img src={players[1].avatar} className="w-full h-full rounded-full" />
            </div>
            <div className="absolute -bottom-2 -right-2 w-8 h-8 bg-cyber-secondary rounded-full flex items-center justify-center font-bold text-sm border-2 border-cyber-bg">2</div>
          </div>
          <div className="text-center">
            <div className="font-display font-bold text-lg uppercase tracking-tighter">{players[1].name}</div>
            <div className="text-xs text-cyber-secondary font-bold">{players[1].elo} ELO</div>
          </div>
        </div>

        {/* Rank 1 */}
        <div className="flex flex-col items-center group -translate-y-8">
          <div className="relative mb-4">
            <div className="w-32 h-32 rounded-full border-4 border-cyber-accent p-1 shadow-[0_0_30px_rgba(0,240,255,0.6)] group-hover:scale-110 transition-transform">
              <img src={players[0].avatar} className="w-full h-full rounded-full" />
            </div>
            <div className="absolute -bottom-2 -right-2 w-10 h-10 bg-cyber-accent text-black rounded-full flex items-center justify-center font-bold text-lg border-2 border-cyber-bg">1</div>
            <Crown className="absolute -top-6 left-1/2 -translate-x-1/2 text-cyber-accent drop-shadow-[0_0_10px_rgba(0,240,255,0.8)]" size={32} />
          </div>
          <div className="text-center">
            <div className="font-display font-bold text-2xl uppercase tracking-tighter text-cyber-accent">{players[0].name}</div>
            <div className="text-sm text-cyber-accent font-bold">{players[0].elo} ELO</div>
          </div>
        </div>

        {/* Rank 3 */}
        <div className="flex flex-col items-center group">
          <div className="relative mb-4">
            <div className="w-24 h-24 rounded-full border-4 border-white/20 p-1 shadow-[0_0_20px_rgba(255,255,255,0.1)] group-hover:scale-110 transition-transform">
              <img src={players[2].avatar} className="w-full h-full rounded-full" />
            </div>
            <div className="absolute -bottom-2 -right-2 w-8 h-8 bg-white/20 rounded-full flex items-center justify-center font-bold text-sm border-2 border-cyber-bg">3</div>
          </div>
          <div className="text-center">
            <div className="font-display font-bold text-lg uppercase tracking-tighter">{players[2].name}</div>
            <div className="text-xs text-cyber-text-muted font-bold">{players[2].elo} ELO</div>
          </div>
        </div>
      </div>

      {/* Full List */}
      <div className="cyber-card">
        <div className="grid grid-cols-[80px_1fr_120px_120px_120px] p-4 border-b border-cyber-border text-[10px] font-bold uppercase tracking-widest text-cyber-text-muted">
          <div className="px-4">Rank</div>
          <div>Player</div>
          <div className="text-center">Region</div>
          <div className="text-center">Skill LVL</div>
          <div className="text-right px-4">Combat Rating</div>
        </div>
        <div className="divide-y divide-cyber-border">
          {players.map((player) => (
            <div key={player.rank} className="grid grid-cols-[80px_1fr_120px_120px_120px] p-4 items-center hover:bg-white/5 transition-colors group">
              <div className="px-4 font-display font-bold text-xl italic text-cyber-text-muted group-hover:text-cyber-accent">#{player.rank}</div>
              <div className="flex items-center gap-3">
                <img src={player.avatar} className="w-8 h-8 rounded-full border border-cyber-border" />
                <span className="font-bold text-sm">{player.name}</span>
              </div>
              <div className="text-center text-xs font-bold text-cyber-text-muted">{player.country}</div>
              <div className="text-center">
                <span className="px-2 py-0.5 bg-cyber-accent/10 text-cyber-accent rounded text-[10px] font-bold">LVL {player.level}</span>
              </div>
              <div className="text-right px-4 font-mono font-bold text-cyber-accent">{player.elo}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function AnalyticsView() {
  return (
    <div className="space-y-8">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Combat Profile */}
        <div className="lg:col-span-2 cyber-card p-8 relative overflow-hidden">
          <div className="absolute top-0 right-0 p-4 opacity-10">
            <Activity size={120} />
          </div>
          <h3 className="text-xl font-display font-bold uppercase mb-8 tracking-tight flex items-center gap-2">
            <Activity className="text-cyber-accent" size={20} />
            Combat DNA
          </h3>
          
          <div className="grid md:grid-cols-2 gap-12 items-center">
            {/* Radar Chart Placeholder */}
            <div className="relative aspect-square flex items-center justify-center">
              <div className="absolute inset-0 border border-cyber-accent/20 rounded-full animate-[spin_20s_linear_infinite]" />
              <div className="absolute inset-4 border border-cyber-secondary/20 rounded-full animate-[spin_15s_linear_infinite_reverse]" />
              <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
                {/* Hexagon Grid */}
                {[20, 40, 60, 80, 100].map(r => (
                  <circle key={r} cx="50" cy="50" r={r/2} fill="none" stroke="rgba(0, 240, 255, 0.1)" strokeWidth="0.5" />
                ))}
                {/* Data Polygon */}
                <polygon 
                  points="50,20 80,40 70,70 30,70 20,40" 
                  fill="rgba(0, 240, 255, 0.2)" 
                  stroke="rgba(0, 240, 255, 0.8)" 
                  strokeWidth="1"
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-3xl font-display font-bold text-cyber-accent">84.2</span>
                <span className="text-[10px] font-bold text-cyber-text-muted uppercase">Efficiency</span>
              </div>
            </div>

            <div className="space-y-6">
              <StatItem label="Aim Precision" value="78%" progress={78} color="cyber-accent" />
              <StatItem label="Tactical Awareness" value="92%" progress={92} color="cyber-secondary" />
              <StatItem label="Utility Usage" value="64%" progress={64} color="white" />
              <StatItem label="Clutch Factor" value="88%" progress={88} color="cyber-accent" />
            </div>
          </div>
        </div>

        {/* Quick Stats */}
        <div className="space-y-6">
          <div className="cyber-card p-6 bg-gradient-to-br from-cyber-accent/10 to-transparent">
            <div className="text-[10px] font-bold text-cyber-accent uppercase tracking-widest mb-1">Win Rate</div>
            <div className="text-3xl font-display font-bold">64.5%</div>
            <div className="mt-2 text-[10px] text-cyber-text-muted">Last 20 Matches</div>
          </div>
          <div className="cyber-card p-6 bg-gradient-to-br from-cyber-secondary/10 to-transparent">
            <div className="text-[10px] font-bold text-cyber-secondary uppercase tracking-widest mb-1">K/D Ratio</div>
            <div className="text-3xl font-display font-bold">1.42</div>
            <div className="mt-2 text-[10px] text-cyber-text-muted">+0.12 from last week</div>
          </div>
          <div className="cyber-card p-6">
            <div className="text-[10px] font-bold text-cyber-text-muted uppercase tracking-widest mb-1">Headshot %</div>
            <div className="text-3xl font-display font-bold">52.1%</div>
            <div className="mt-2 text-[10px] text-cyber-text-muted">Top 5% in Nexus</div>
          </div>
        </div>
      </div>

      {/* Match History */}
      <div className="cyber-card">
        <div className="p-6 border-b border-cyber-border flex items-center justify-between">
          <h3 className="text-sm font-bold uppercase tracking-widest">Match History</h3>
          <button className="text-[10px] font-bold text-cyber-accent uppercase hover:underline">View All</button>
        </div>
        <div className="divide-y divide-cyber-border">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="p-6 flex items-center gap-8 hover:bg-white/5 transition-colors">
              <div className={`w-2 h-12 rounded-full ${i % 2 === 0 ? 'bg-green-500 shadow-[0_0_10px_rgba(34,197,94,0.5)]' : 'bg-red-500 shadow-[0_0_10px_rgba(239,68,68,0.5)]'}`} />
              <div className="flex-1">
                <div className="text-sm font-bold uppercase">Mirage - Competitive</div>
                <div className="text-[10px] text-cyber-text-muted">2 hours ago</div>
              </div>
              <div className="text-center">
                <div className="text-lg font-display font-bold">{i % 2 === 0 ? '16 - 12' : '10 - 16'}</div>
                <div className={`text-[10px] font-bold uppercase ${i % 2 === 0 ? 'text-green-500' : 'text-red-500'}`}>{i % 2 === 0 ? 'Victory' : 'Defeat'}</div>
              </div>
              <div className="text-right">
                <div className="text-sm font-bold">24 / 12 / 8</div>
                <div className="text-[10px] text-cyber-text-muted uppercase">K / D / A</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function StatItem({ label, value, progress, color }: any) {
  const colorClass = color === 'cyber-accent' ? 'bg-cyber-accent' : color === 'cyber-secondary' ? 'bg-cyber-secondary' : 'bg-white';
  return (
    <div className="space-y-2">
      <div className="flex justify-between text-xs font-bold uppercase tracking-tight">
        <span className="text-cyber-text-muted">{label}</span>
        <span>{value}</span>
      </div>
      <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
        <motion.div 
          initial={{ width: 0 }}
          animate={{ width: `${progress}%` }}
          transition={{ duration: 1, ease: "easeOut" }}
          className={`h-full ${colorClass} shadow-[0_0_10px_rgba(0,240,255,0.5)]`}
        />
      </div>
    </div>
  );
}

function LiveStreamView() {
  return (
    <div className="space-y-8">
      {/* Main Stream */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_350px] gap-8">
        <div className="cyber-card aspect-video relative group overflow-hidden">
          <img src="https://picsum.photos/seed/stream/1200/800" className="w-full h-full object-cover" />
          <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer">
            <PlayCircle size={80} className="text-cyber-accent drop-shadow-[0_0_20px_rgba(0,240,255,0.8)]" />
          </div>
          <div className="absolute top-6 left-6 flex items-center gap-3">
            <div className="px-3 py-1 bg-red-600 text-white text-[10px] font-bold uppercase rounded-sm animate-pulse">Live</div>
            <div className="px-3 py-1 bg-black/60 backdrop-blur-md text-white text-[10px] font-bold uppercase rounded-sm border border-white/10 flex items-center gap-2">
              <Users size={12} />
              12,450
            </div>
          </div>
          <div className="absolute bottom-0 left-0 right-0 p-8 bg-gradient-to-t from-black to-transparent">
            <h3 className="text-2xl font-display font-bold uppercase tracking-tight mb-2">PGL Major Copenhagen 2024 - Grand Final</h3>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <img src="https://picsum.photos/seed/pgl/40/40" className="w-6 h-6 rounded-full" />
                <span className="text-xs font-bold text-cyber-accent uppercase">PGL_CS2</span>
              </div>
              <div className="text-xs text-cyber-text-muted uppercase font-bold">Counter-Strike 2</div>
            </div>
          </div>
        </div>

        {/* Chat Placeholder */}
        <div className="cyber-card flex flex-col h-[500px] lg:h-auto">
          <div className="p-4 border-b border-cyber-border flex items-center justify-between">
            <h3 className="text-xs font-bold uppercase tracking-widest">Nexus Chat</h3>
            <Settings size={14} className="text-cyber-text-muted" />
          </div>
          <div className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-4">
            {[1, 2, 3, 4, 5, 6, 7, 8].map(i => (
              <div key={i} className="text-xs">
                <span className="font-bold text-cyber-accent">User_{i}: </span>
                <span className="text-cyber-text-muted">This play was absolutely insane! Nexus Arena is the best.</span>
              </div>
            ))}
          </div>
          <div className="p-4 border-t border-cyber-border">
            <div className="relative">
              <input 
                type="text" 
                placeholder="Send a message..." 
                className="w-full bg-white/5 border border-cyber-border rounded-lg py-2 px-4 text-xs focus:outline-none focus:border-cyber-accent/50"
              />
              <Zap className="absolute right-3 top-1/2 -translate-y-1/2 text-cyber-accent" size={14} />
            </div>
          </div>
        </div>
      </div>

      {/* Recommended Streams */}
      <div className="space-y-4">
        <h3 className="text-sm font-bold uppercase tracking-widest">Recommended Broadcasts</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="cyber-card group cursor-pointer">
              <div className="aspect-video relative overflow-hidden">
                <img src={`https://picsum.photos/seed/rec${i}/400/250`} className="w-full h-full object-cover group-hover:scale-110 transition-transform" />
                <div className="absolute top-2 right-2 px-2 py-0.5 bg-black/60 backdrop-blur-md text-[9px] font-bold text-white rounded border border-white/10">
                  {i * 1.2}K Viewers
                </div>
              </div>
              <div className="p-4">
                <div className="text-xs font-bold truncate uppercase mb-1">Elite Scrims - Tier 1 Teams</div>
                <div className="text-[10px] text-cyber-text-muted uppercase font-bold">Nexus_TV_{i}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function PulseView() {
  const posts = [
    { id: 1, user: "CyberGhost", time: "10m ago", content: "Just reached Level 10 in Battlefield! Who's up for a squad match?", likes: 24, comments: 5, image: "https://picsum.photos/seed/post1/800/400" },
    { id: 2, user: "NeonViper", time: "45m ago", content: "The new Syndicate missions are insane. High risk, high reward.", likes: 12, comments: 2 },
    { id: 3, user: "NexusAdmin", time: "2h ago", content: "Maintenance complete. All systems calibrated for the upcoming tournament.", likes: 156, comments: 42, image: "https://picsum.photos/seed/post2/800/400" },
  ];

  return (
    <div className="max-w-3xl mx-auto space-y-8">
      {/* Create Post */}
      <div className="cyber-card p-6">
        <div className="flex gap-4">
          <img src="https://picsum.photos/seed/me/40/40" className="w-10 h-10 rounded-full border border-cyber-border" />
          <div className="flex-1 space-y-4">
            <textarea 
              placeholder="Broadcast to the Nexus..." 
              className="w-full bg-white/5 border border-cyber-border rounded-lg p-4 text-sm focus:outline-none focus:border-cyber-accent/50 min-h-[100px] resize-none"
            />
            <div className="flex justify-between items-center">
              <div className="flex gap-4 text-cyber-text-muted">
                <button className="hover:text-cyber-accent transition-colors"><Activity size={18} /></button>
                <button className="hover:text-cyber-accent transition-colors"><Users size={18} /></button>
                <button className="hover:text-cyber-accent transition-colors"><Zap size={18} /></button>
              </div>
              <button className="cyber-btn-primary px-6 py-2 text-xs">Broadcast</button>
            </div>
          </div>
        </div>
      </div>

      {/* Feed */}
      <div className="space-y-6">
        {posts.map(post => (
          <div key={post.id} className="cyber-card overflow-hidden">
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <img src={`https://picsum.photos/seed/${post.user}/40/40`} className="w-10 h-10 rounded-full border border-cyber-border" />
                  <div>
                    <div className="font-bold text-sm text-cyber-accent">{post.user}</div>
                    <div className="text-[10px] text-cyber-text-muted uppercase font-bold">{post.time}</div>
                  </div>
                </div>
                <button className="text-cyber-text-muted hover:text-white"><Settings size={16} /></button>
              </div>
              <p className="text-sm text-white/90 leading-relaxed mb-4">{post.content}</p>
              {post.image && (
                <div className="rounded-lg overflow-hidden border border-cyber-border mb-4">
                  <img src={post.image} className="w-full h-auto" />
                </div>
              )}
              <div className="flex items-center gap-6 pt-4 border-t border-cyber-border">
                <button className="flex items-center gap-2 text-xs text-cyber-text-muted hover:text-cyber-accent transition-colors">
                  <Zap size={16} /> {post.likes}
                </button>
                <button className="flex items-center gap-2 text-xs text-cyber-text-muted hover:text-cyber-secondary transition-colors">
                  <Activity size={16} /> {post.comments}
                </button>
                <button className="flex items-center gap-2 text-xs text-cyber-text-muted hover:text-white transition-colors ml-auto">
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
  const factions = [
    { name: "Shadow Protocol", members: 1240, power: 98, color: "cyber-accent" },
    { name: "Neon Vipers", members: 850, power: 82, color: "cyber-secondary" },
    { name: "Chrome Legion", members: 2100, power: 75, color: "white" },
  ];

  return (
    <div className="space-y-8">
      <div className="flex justify-between items-center">
        <h3 className="text-xl font-display font-bold uppercase tracking-tight">Active Syndicates</h3>
        <button className="cyber-btn-primary px-6 py-2 text-xs">Form Syndicate</button>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        {factions.map(f => (
          <div key={f.name} className="cyber-card p-8 group cursor-pointer">
            <div className={`w-16 h-16 rounded-lg mb-6 flex items-center justify-center border-2 border-${f.color}/30 bg-${f.color}/10 shadow-[0_0_20px_rgba(0,0,0,0.3)] group-hover:scale-110 transition-transform`}>
              <Shield className={`text-${f.color}`} size={32} />
            </div>
            <h4 className="text-lg font-display font-bold uppercase mb-2">{f.name}</h4>
            <div className="space-y-4">
              <div className="flex justify-between text-[10px] font-bold uppercase text-cyber-text-muted">
                <span>Members</span>
                <span className="text-white">{f.members}</span>
              </div>
              <div className="flex justify-between text-[10px] font-bold uppercase text-cyber-text-muted">
                <span>Power Level</span>
                <span className={`text-${f.color}`}>{f.power}%</span>
              </div>
              <div className="h-1 bg-white/5 rounded-full overflow-hidden">
                <div className={`h-full bg-${f.color}`} style={{ width: `${f.power}%` }} />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function MissionsView() {
  const missions = [
    { title: "Data Heist", reward: "500 Credits", difficulty: "Hard", time: "2h left" },
    { title: "Nexus Defense", reward: "200 Credits", difficulty: "Easy", time: "5h left" },
    { title: "Silent Assassin", reward: "1200 Credits", difficulty: "Extreme", time: "12h left" },
  ];

  return (
    <div className="space-y-6">
      <h3 className="text-xl font-display font-bold uppercase tracking-tight">Daily Missions</h3>
      <div className="space-y-4">
        {missions.map(m => (
          <div key={m.title} className="cyber-card p-6 flex items-center justify-between group hover:bg-white/5 transition-all">
            <div className="flex items-center gap-6">
              <div className="w-12 h-12 rounded-full bg-cyber-accent/10 border border-cyber-accent/30 flex items-center justify-center">
                <Target className="text-cyber-accent" size={24} />
              </div>
              <div>
                <h4 className="font-bold uppercase">{m.title}</h4>
                <div className="flex gap-4 text-[10px] font-bold uppercase text-cyber-text-muted">
                  <span>{m.difficulty}</span>
                  <span>{m.time}</span>
                </div>
              </div>
            </div>
            <div className="text-right">
              <div className="text-cyber-secondary font-display font-bold text-lg">{m.reward}</div>
              <button className="text-[10px] font-bold text-cyber-accent uppercase hover:underline">Accept Mission</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function VaultView() {
  const items = [
    { name: "Neon Katana", price: "5,000", type: "Melee", rarity: "Legendary" },
    { name: "Pulse Rifle", price: "2,500", type: "Weapon", rarity: "Epic" },
    { name: "Ghost Cloak", price: "1,200", type: "Utility", rarity: "Rare" },
  ];

  return (
    <div className="space-y-8">
      <div className="flex justify-between items-center">
        <h3 className="text-xl font-display font-bold uppercase tracking-tight">The Vault</h3>
        <div className="flex gap-4">
          <button className="px-4 py-1 text-xs font-bold bg-white/5 border border-cyber-border rounded-md">Weapons</button>
          <button className="px-4 py-1 text-xs font-bold text-cyber-text-muted">Skins</button>
          <button className="px-4 py-1 text-xs font-bold text-cyber-text-muted">Boosts</button>
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        {items.map(item => (
          <div key={item.name} className="cyber-card group overflow-hidden">
            <div className="aspect-square bg-gradient-to-br from-cyber-accent/5 to-cyber-secondary/5 flex items-center justify-center relative">
              <ShoppingBag size={64} className="text-white/10 group-hover:scale-125 transition-transform" />
              <div className="absolute top-4 right-4 px-2 py-1 bg-black/60 backdrop-blur-md text-[9px] font-bold uppercase rounded border border-white/10">
                {item.rarity}
              </div>
            </div>
            <div className="p-6">
              <h4 className="font-display font-bold uppercase mb-1">{item.name}</h4>
              <div className="text-[10px] text-cyber-text-muted uppercase font-bold mb-4">{item.type}</div>
              <div className="flex justify-between items-center">
                <span className="text-cyber-accent font-bold">{item.price} CR</span>
                <button className="cyber-btn-primary px-4 py-1.5 text-[10px]">Purchase</button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function NeonPrimeView() {
  return (
    <div className="max-w-4xl mx-auto py-12">
      <div className="cyber-card p-12 text-center relative overflow-hidden">
        <div className="absolute -top-24 -left-24 w-64 h-64 bg-cyber-accent/20 blur-[100px] rounded-full" />
        <div className="absolute -bottom-24 -right-24 w-64 h-64 bg-cyber-secondary/20 blur-[100px] rounded-full" />
        
        <Crown size={64} className="text-cyber-accent mx-auto mb-8 drop-shadow-[0_0_20px_rgba(0,240,255,0.8)]" />
        <h3 className="text-4xl font-display font-bold uppercase tracking-tighter mb-4">Upgrade to <span className="text-cyber-accent">Neon Prime</span></h3>
        <p className="text-cyber-text-muted mb-12 max-w-lg mx-auto">Unlock exclusive tournaments, advanced neural analytics, and priority matchmaking in the Nexus.</p>
        
        <div className="grid md:grid-cols-3 gap-8 mb-12">
          {[
            { title: "Priority", desc: "Skip the queue" },
            { title: "Analytics", desc: "Deep neural data" },
            { title: "Exclusive", desc: "Prime-only drops" }
          ].map(f => (
            <div key={f.title} className="p-6 bg-white/5 rounded-xl border border-cyber-border">
              <div className="font-bold uppercase text-cyber-accent mb-1">{f.title}</div>
              <div className="text-[10px] text-cyber-text-muted uppercase">{f.desc}</div>
            </div>
          ))}
        </div>
        
        <button className="cyber-btn-primary px-12 py-4 text-sm font-bold uppercase tracking-widest">Activate Now - $9.99/mo</button>
      </div>
    </div>
  );
}
