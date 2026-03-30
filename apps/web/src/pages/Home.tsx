import { useNavigate } from 'react-router-dom'
import { Trophy, Shield, Zap, Target, ArrowRight, BarChart3, Globe, Users } from 'lucide-react'

export default function Home({ onAuth }: { onAuth: () => void }) {
  const navigate = useNavigate()

  return (
    <div className="min-h-screen bg-[#020617] text-white selection:bg-orange-500/30 overflow-x-hidden">
      {/* Navbar Overlay */}
      <nav className="absolute top-0 left-0 w-full z-50 p-6 flex items-center justify-between max-w-7xl mx-auto right-0">
        <div className="text-2xl font-black bg-gradient-to-r from-orange-500 to-red-600 bg-clip-text text-transparent tracking-tighter">
          HUSTLE ARENA
        </div>
        <div className="flex items-center space-x-6">
          <button onClick={onAuth} className="text-sm font-semibold hover:text-orange-500 transition">LOGIN</button>
          <button onClick={onAuth} className="bg-orange-500 hover:bg-orange-600 px-6 py-2 rounded-full font-bold text-sm transition shadow-[0_0_20px_rgba(249,115,22,0.3)]">
            SIGN UP
          </button>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="relative pt-32 pb-20 px-6 overflow-hidden">
        {/* Abstract Glows */}
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-orange-500/10 rounded-full blur-[120px]"></div>
        <div className="absolute bottom-[20%] right-[-10%] w-[30%] h-[30%] bg-red-600/10 rounded-full blur-[100px]"></div>

        <div className="max-w-7xl mx-auto text-center relative z-10">
          <div className="inline-flex items-center space-x-2 bg-slate-900/50 border border-slate-800 px-4 py-2 rounded-full mb-8 backdrop-blur-sm">
            <span className="w-2 h-2 bg-orange-500 rounded-full animate-pulse"></span>
            <span className="text-xs font-bold tracking-widest text-slate-400 uppercase">CS2 Beta Live Now</span>
          </div>
          
          <h1 className="text-6xl md:text-8xl font-black mb-6 leading-tight tracking-tight">
            WAGER YOUR SKILL.<br />
            <span className="bg-gradient-to-r from-orange-500 via-red-500 to-orange-600 bg-clip-text text-transparent">WIN THE ARENA.</span>
          </h1>
          
          <p className="max-w-2xl mx-auto text-slate-400 text-lg md:text-xl mb-10 leading-relaxed">
            The world's most secure self-wagering platform for Counter-Strike 2. 
            Join thousands of players competing for real USDT rewards on dedicated high-tick servers.
          </p>

          <div className="flex flex-col md:flex-row items-center justify-center space-y-4 md:space-y-0 md:space-x-6">
            <button onClick={onAuth} className="group w-full md:w-auto bg-orange-500 hover:bg-orange-600 px-10 py-5 rounded-2xl font-black text-xl flex items-center justify-center space-x-3 transition-all transform hover:scale-105 shadow-[0_0_40px_rgba(249,115,22,0.4)]">
              <span>GET STARTED</span>
              <ArrowRight className="group-hover:translate-x-1 transition-transform" />
            </button>
            <button className="w-full md:w-auto bg-slate-900 border border-slate-800 hover:bg-slate-800 px-10 py-5 rounded-2xl font-black text-xl transition">
              VIEW MATCHES
            </button>
          </div>

          {/* Stats Bar */}
          <div className="mt-24 grid grid-cols-2 md:grid-cols-4 gap-8 bg-slate-900/30 border border-slate-800/50 p-8 rounded-3xl backdrop-blur-md">
            <div>
              <p className="text-3xl font-black text-orange-500">$2.4M+</p>
              <p className="text-xs text-slate-500 font-bold uppercase tracking-widest mt-1">Total Payouts</p>
            </div>
            <div>
              <p className="text-3xl font-black">150K+</p>
              <p className="text-xs text-slate-500 font-bold uppercase tracking-widest mt-1">Active Players</p>
            </div>
            <div>
              <p className="text-3xl font-black text-blue-500">128</p>
              <p className="text-xs text-slate-500 font-bold uppercase tracking-widest mt-1">Tickrate Servers</p>
            </div>
            <div>
              <p className="text-3xl font-black text-green-500">Instant</p>
              <p className="text-xs text-slate-500 font-bold uppercase tracking-widest mt-1">USDT Withdrawals</p>
            </div>
          </div>
        </div>
      </section>

      {/* Features Grid */}
      <section className="py-32 px-6 bg-slate-950/50">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-20">
            <h2 className="text-4xl md:text-5xl font-black mb-4">ENGINEERED FOR PROS</h2>
            <div className="w-24 h-1 bg-orange-500 mx-auto rounded-full"></div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <FeatureCard 
              icon={<Shield className="text-orange-500" />}
              title="Anti-Cheat Integrity"
              description="Our proprietary server-side detection and VAC integration ensures every wager is fair and transparent."
            />
            <FeatureCard 
              icon={<Zap className="text-yellow-500" />}
              title="Automated Payouts"
              description="No manual claims. As soon as the match ends, winnings are credited to your USDT wallet instantly."
            />
            <FeatureCard 
              icon={<Target className="text-red-500" />}
              title="Global Matchmaking"
              description="Join the queue or create private lobbies. Play with friends or challenge the world's best."
            />
          </div>
        </div>
      </section>

      {/* Visual Break / Social Proof */}
      <section className="py-20 border-y border-slate-900 bg-slate-950">
         <div className="flex overflow-hidden whitespace-nowrap opacity-20 select-none">
            <div className="flex animate-marquee text-8xl font-black text-slate-800 uppercase space-x-20">
              <span>Hustle Arena</span>
              <span>•</span>
              <span>Counter-Strike 2</span>
              <span>•</span>
              <span>Play to Earn</span>
              <span>•</span>
              <span>Hustle Arena</span>
              <span>•</span>
              <span>Counter-Strike 2</span>
            </div>
         </div>
      </section>

      {/* Call to Action */}
      <section className="py-32 px-6 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-t from-orange-500/5 to-transparent"></div>
        <div className="max-w-4xl mx-auto bg-gradient-to-br from-slate-900 to-slate-950 border border-slate-800 p-12 rounded-[3rem] text-center relative z-10 shadow-2xl">
          <h2 className="text-4xl font-black mb-6 italic tracking-tighter">READY TO CLIMB THE RANKS?</h2>
          <p className="text-slate-400 mb-10 text-lg">Your legacy begins in the Arena. Join the #1 CS2 wagering community today.</p>
          <button onClick={onAuth} className="bg-white text-black hover:bg-orange-500 hover:text-white px-12 py-5 rounded-2xl font-black text-xl transition-all duration-300 transform hover:scale-105">
            CREATE ACCOUNT NOW
          </button>
        </div>
      </section>

      <footer className="py-12 border-t border-slate-900 text-center text-slate-600 text-sm">
        <p>© 2026 HUSTLE ARENA. POWERED BY CS2. ALL RIGHTS RESERVED.</p>
      </footer>
    </div>
  )
}

function FeatureCard({ icon, title, description }: any) {
  return (
    <div className="group bg-slate-900/50 border border-slate-800 p-10 rounded-3xl hover:border-orange-500/50 transition-all duration-500 hover:-translate-y-2">
      <div className="bg-slate-950 w-16 h-16 rounded-2xl flex items-center justify-center mb-8 shadow-xl group-hover:bg-orange-500/10 transition-colors">
        {icon}
      </div>
      <h3 className="text-2xl font-black mb-4 group-hover:text-orange-500 transition-colors uppercase italic">{title}</h3>
      <p className="text-slate-500 leading-relaxed font-medium">{description}</p>
    </div>
  )
}
