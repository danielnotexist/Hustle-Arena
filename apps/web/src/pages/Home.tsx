import { useNavigate } from 'react-router-dom'
import { Trophy, Shield, Zap, Target, ArrowRight, Users, Crown, Globe, MessageSquare, Map } from 'lucide-react'

export default function Home({ onAuth }: { onAuth: () => void }) {
  const navigate = useNavigate()

  return (
    <div className="min-h-screen bg-background text-foreground overflow-x-hidden font-sans">
      {/* Navbar Overlay */}
      <nav className="absolute top-0 left-0 right-0 z-50 p-6 flex items-center justify-between max-w-7xl mx-auto border-b border-border/50 bg-background/80 backdrop-blur-md">
        <div className="text-2xl font-black tracking-tighter text-primary">
          HUSTLE<span className="text-foreground">ARENA</span>
        </div>
        <div className="flex items-center space-x-6">
          <button onClick={onAuth} className="text-sm font-semibold hover:text-primary transition-colors">LOGIN</button>
          <button onClick={onAuth} className="bg-primary text-primary-foreground hover:bg-primary/90 px-6 py-2 rounded-full font-bold text-sm transition-all shadow-[0_0_15px_rgba(0,255,255,0.3)]">
            PLAY NOW
          </button>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="relative pt-40 pb-20 px-6 overflow-hidden flex flex-col items-center text-center">
        {/* Neon Glow Backgrounds */}
        <div className="absolute top-10 left-1/2 -translate-x-1/2 w-[600px] h-[400px] bg-primary/20 rounded-full blur-[120px] pointer-events-none"></div>
        <div className="absolute bottom-0 right-[-10%] w-[400px] h-[400px] bg-accent/20 rounded-full blur-[100px] pointer-events-none"></div>

        <div className="max-w-5xl mx-auto relative z-10">
          <div className="inline-flex items-center space-x-2 bg-secondary/80 border border-border px-4 py-2 rounded-full mb-8 backdrop-blur-md">
            <span className="w-2 h-2 bg-primary rounded-full animate-pulse"></span>
            <span className="text-xs font-bold tracking-widest text-primary uppercase">CS2 Self-Wagering Platform</span>
          </div>
          
          <h1 className="text-6xl md:text-8xl font-black mb-6 leading-tight tracking-tight uppercase">
            Bet on your <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-accent">Gameplay.</span><br />
            Dominate the <span className="text-foreground">Arena.</span>
          </h1>
          
          <p className="max-w-3xl mx-auto text-muted-foreground text-lg md:text-xl mb-12 leading-relaxed font-medium">
            Connect your USDT wallet, join 5v5 custom lobbies, and play for real stakes on high-tickrate dedicated CS2 servers. Withdraw instantly via TRC20 or BEP20.
          </p>

          <div className="flex flex-col md:flex-row items-center justify-center space-y-4 md:space-y-0 md:space-x-6">
            <button onClick={onAuth} className="w-full md:w-auto bg-primary text-primary-foreground hover:bg-primary/90 px-10 py-5 rounded-2xl font-black text-xl flex items-center justify-center space-x-3 transition-all transform hover:scale-105 shadow-[0_0_30px_rgba(0,255,255,0.4)]">
              <span>DEPOSIT & PLAY</span>
              <ArrowRight className="h-6 w-6" />
            </button>
            <button className="w-full md:w-auto bg-secondary border border-border hover:border-primary/50 px-10 py-5 rounded-2xl font-black text-xl transition-all flex items-center justify-center space-x-2">
              <Trophy className="text-accent" />
              <span>LEADERBOARD</span>
            </button>
          </div>
        </div>
      </section>

      {/* Feature Grid */}
      <section className="py-24 px-6 relative z-10 bg-background">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-black uppercase tracking-tight mb-4">The Ultimate CS2 Ecosystem</h2>
            <p className="text-muted-foreground max-w-2xl mx-auto">Everything you need for secure, fair, and highly competitive esports wagering.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <FeatureCard 
              icon={<Globe className="text-primary h-8 w-8" />}
              title="Custom 5v5 Lobbies"
              desc="Create private or public 10-player rooms. Host controls passwords, skill filtering, and stakes. Dynamic CT/T team switching before match starts."
            />
            <FeatureCard 
              icon={<Map className="text-accent h-8 w-8" />}
              title="Map Voting & Modes"
              desc="All players must 'Ready Up' to lock teams. Automatic map voting (Dust2, Mirage, Nuke, etc.) and modes (Comp, Wingman, FFA)."
            />
            <FeatureCard 
              icon={<Zap className="text-yellow-400 h-8 w-8" />}
              title="Automated Payouts"
              desc="Servers push live results to our backend. Winning teams receive funds instantly minus a flat 10% platform fee per winning player."
            />
            <FeatureCard 
              icon={<Crown className="text-primary h-8 w-8" />}
              title="VIP Subscription"
              desc="Upgrade to VIP (30 USDT/mo or 300 USDT/yr) and play with ZERO platform fees on your winnings. Maximize your profit."
            />
            <FeatureCard 
              icon={<Shield className="text-accent h-8 w-8" />}
              title="Secure Wallets & KYC"
              desc="Strict 18+ identity verification. Deposit and withdraw USDT safely via TRC20 or BEP20 networks. Your funds, your control."
            />
            <FeatureCard 
              icon={<MessageSquare className="text-primary h-8 w-8" />}
              title="Community Hub"
              desc="Global lobby chat, strict in-game team comms, user profiles, FaceIT-style ELO leagues, DMs, and steam-like forums."
            />
          </div>
        </div>
      </section>

      {/* Leaderboard Teaser */}
      <section className="py-24 border-y border-border bg-card relative overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-primary/5 via-background to-background"></div>
        <div className="max-w-4xl mx-auto text-center relative z-10 px-6">
          <Trophy className="h-16 w-16 text-primary mx-auto mb-6" />
          <h2 className="text-4xl font-black uppercase mb-8">Top Earners Leaderboard</h2>
          
          <div className="bg-background border border-border rounded-3xl p-6 shadow-2xl">
            <div className="flex items-center justify-between p-4 border-b border-border/50">
              <div className="flex items-center space-x-4">
                <span className="text-2xl font-black text-yellow-500">1</span>
                <div className="w-10 h-10 bg-secondary rounded-full border border-primary"></div>
                <span className="font-bold">s1mple_god</span>
              </div>
              <span className="font-black text-primary">+4,250 USDT</span>
            </div>
            <div className="flex items-center justify-between p-4 border-b border-border/50">
              <div className="flex items-center space-x-4">
                <span className="text-2xl font-black text-gray-400">2</span>
                <div className="w-10 h-10 bg-secondary rounded-full border border-border"></div>
                <span className="font-bold">NiKo_fan</span>
              </div>
              <span className="font-black text-primary">+2,800 USDT</span>
            </div>
            <div className="flex items-center justify-between p-4">
              <div className="flex items-center space-x-4">
                <span className="text-2xl font-black text-orange-700">3</span>
                <div className="w-10 h-10 bg-secondary rounded-full border border-border"></div>
                <span className="font-bold">donk_smurf</span>
              </div>
              <span className="font-black text-primary">+1,950 USDT</span>
            </div>
          </div>
        </div>
      </section>

      {/* Footer CTA */}
      <section className="py-32 px-6 text-center">
        <h2 className="text-5xl font-black uppercase mb-6">Enter The Arena</h2>
        <p className="text-muted-foreground mb-10 text-lg max-w-xl mx-auto">
          Verify your ID, deposit USDT, and start taking your CS2 skills to the bank.
        </p>
        <button onClick={onAuth} className="bg-primary text-primary-foreground hover:bg-primary/90 px-12 py-5 rounded-2xl font-black text-xl transition-all shadow-[0_0_30px_rgba(0,255,255,0.3)]">
          REGISTER ACCOUNT
        </button>
      </section>

    </div>
  )
}

function FeatureCard({ icon, title, desc }: any) {
  return (
    <div className="bg-card border border-border p-8 rounded-3xl hover:border-primary/50 transition-colors duration-300 group">
      <div className="bg-background w-14 h-14 rounded-2xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
        {icon}
      </div>
      <h3 className="text-xl font-black uppercase mb-3 text-foreground">{title}</h3>
      <p className="text-muted-foreground text-sm leading-relaxed">{desc}</p>
    </div>
  )
}
