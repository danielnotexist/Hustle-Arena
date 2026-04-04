import { motion } from "motion/react";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Activity, CheckCircle2, ChevronDown, Clock, Crown, Map, MessageSquare, MoreVertical, PlayCircle, Server, Settings, Shield, ShoppingBag, Star, Sword, Target, Trophy, User, Users, Zap } from "lucide-react";
import React, { useEffect, useState } from "react";
import { collection, db, getDocs, limit, orderBy, query } from "../firebase";
import type { Mission, UserStats } from "./types";
import { DynamicImage } from "./landing-auth";

export function ApexListView() {
  const [players, setPlayers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchLeaderboard = async () => {
      try {
        const q = query(
          collection(db, "users"),
          orderBy("stats.credits", "desc"),
          limit(10)
        );
        const snapshot = await getDocs(q);
        const leaderboardData = snapshot.docs.map((doc, index) => {
          const data = doc.data();
          return {
            rank: index + 1,
            name: data.username || "Unknown",
            elo: (data.stats?.credits || 0).toLocaleString(),
            level: data.stats?.level || 1,
            winRate: data.stats?.winRate || "0%",
            avatar: `https://ui-avatars.com/api/?name=${data.username || 'Player'}&background=random`
          };
        });
        setPlayers(leaderboardData);
      } catch (error) {
        console.error("Leaderboard fetch failed:", error);
      } finally {
        setLoading(false);
      }
    };
    fetchLeaderboard();
  }, []);

  return (
    <div className="space-y-8">
      <div className="flex justify-between items-end">
        <div>
          <h3 className="text-2xl font-display font-bold uppercase tracking-tight">Apex List</h3>
          <p className="text-sm text-esport-text-muted">The top 10 Nexus Arena combatants.</p>
        </div>
        <div className="flex gap-2">
          <button className="badge badge-accent">Season 4</button>
          <button className="badge bg-white/10 text-white">Global</button>
        </div>
      </div>

      {loading ? (
        <div className="esport-card p-12 text-center animate-shimmer">Loading Leaderboard...</div>
      ) : players.length === 0 ? (
        <div className="esport-card p-12 text-center text-esport-text-muted">No data available yet.</div>
      ) : (
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
      )}
    </div>
  );
}

export function NeuralMapView({ stats }: { stats: UserStats | null }) {
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

export function MissionsView({ addToast }: any) {
  const [missions, setMissions] = useState<Mission[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchMissions = async () => {
      try {
        const response = await fetch("/api/missions");
        if (response.ok) {
          const data = await response.json();
          setMissions(data.map((m: any) => ({
            id: m.id,
            title: m.title,
            reward: m.reward,
            difficulty: m.difficulty,
            time: m.time_left
          })));
        }
      } catch (err) {
        console.error("Missions fetch failed:", err);
      } finally {
        setLoading(false);
      }
    };
    fetchMissions();
  }, []);

  const acceptMission = async (id: number) => {
    try {
      const response = await fetch("/api/missions/accept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ missionId: id })
      });
      const data = await response.json();
      if (data.success) {
        addToast(data.message, "success");
      }
    } catch (error) {
      console.error("Accept mission error:", error);
      addToast("Failed to accept mission", "error");
    }
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
                <div className="text-esport-secondary font-display font-bold text-xl">{mission.reward} USDT</div>
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

export function VaultView({ addToast }: any) {
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

export function PulseView() {
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

export function SyndicatesView() {
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

export function HustlePrimeView() {
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
