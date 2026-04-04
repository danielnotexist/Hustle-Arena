import { motion } from "motion/react";
import { Activity, ChevronRight, Clock, Crown, Gamepad2, MessageSquare, Target, TrendingUp, Trophy } from "lucide-react";
import type { UserStats } from "./types";

export function SidebarItem({ icon, label, active, onClick, highlight }: any) {
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

export function DashboardView({ stats }: { stats: UserStats | null }) {
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
