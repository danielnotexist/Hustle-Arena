import { motion } from "motion/react";
import { AlertCircle, CheckCircle2, Crosshair, Gamepad2, Gift, Headphones, Plus, Shield, ShieldAlert, ShieldCheck, Target, Trophy, User, Users, WalletCards, Zap } from "lucide-react";
import React, { useRef, useState } from "react";
import backgroundImage from "../assets/background.png";
import competitiveImage from "../assets/gamemodes/square/competitive_square.png";
import wingmanImage from "../assets/gamemodes/square/wingman_square.png";
import teamFfaImage from "../assets/gamemodes/square/team_ffa_square.png";
import arenaGuardImage from "../assets/arena-guard-bg.png";
import hustleArenaLogo from "../assets/hustle-arena-logo.png";
import { db, doc, serverTimestamp, updateDoc } from "../firebase";
import { isSupabaseConfigured } from "../lib/env";
import { submitKycForReview } from "../lib/supabase/profile";
import { startSteamLogin } from "../lib/steam";
import { cn } from "./shared-ui";

export function DynamicImage({ prompt, className }: { prompt: string, className?: string }) {
  const imageMap: Record<string, string> = {
    "A cinematic, high-energy esports arena with neon lights, a large screen showing a competitive game like CS:GO or Valorant, and a cheering crowd in the background. Futuristic aesthetic, 4k, professional photography.": hustleArenaLogo,
    "A professional esports player sitting in a high-tech gaming chair, wearing a headset, focused on a glowing monitor. Intense atmosphere, neon blue lighting, high detail.": hustleArenaLogo,
    "esports tactical shooter tournament stage with players at computers": hustleArenaLogo,
    "esports battle royale tournament stage with players at computers": hustleArenaLogo,
    "esports moba tournament stage with players at computers": hustleArenaLogo,
    "A collection of high-end esports gaming peripherals: a glowing mechanical keyboard, a precision mouse, and a sleek headset on a dark desk. Cyberpunk aesthetic, neon cyan accents, professional esports gear.": hustleArenaLogo,
    "esports 5v5 tactical shooter gameplay screenshot": hustleArenaLogo,
    "esports 2v2 tactical shooter gameplay screenshot": hustleArenaLogo,
    "esports battle royale gameplay screenshot": hustleArenaLogo,
    "esports tournament stage with players and large screen": hustleArenaLogo,
    "esports gameplay highlight screenshot 1": hustleArenaLogo,
    "esports gameplay highlight screenshot 2": hustleArenaLogo,
    "esports gameplay highlight screenshot 3": hustleArenaLogo
  };

  const imageUrl = imageMap[prompt] || hustleArenaLogo;

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

export function LandingPage({ onLogin }: { onLogin: () => void }) {
  const tournaments = [
    { tag: "1V1", title: "Hustler 1V1 Cup", entry: "$50", prize: "$2,000", image: wingmanImage },
    { tag: "5V5", title: "Cyber League", entry: "$250", prize: "$25,000", image: competitiveImage },
    { tag: "5V5", title: "Hustle Arena Open", entry: "$100", prize: "$10,000", image: teamFfaImage },
  ];

  const trustItems = [
    { icon: <Zap size={22} />, title: "Instant", body: "Matchmaking" },
    { icon: <ShieldCheck size={22} />, title: "Anti-cheat", body: "Protected" },
    { icon: <WalletCards size={22} />, title: "Skin & Cash", body: "Payouts" },
    { icon: <Headphones size={22} />, title: "24/7", body: "Support" },
    { icon: <Gamepad2 size={22} />, title: "Built By", body: "CS2 Players" },
  ];

  return (
    <div className="min-h-screen overflow-x-hidden bg-[#030712] text-white">
      <div className="pointer-events-none fixed inset-0 z-0 bg-[radial-gradient(circle_at_18%_8%,rgba(37,99,235,0.22),transparent_31%),radial-gradient(circle_at_82%_30%,rgba(249,115,22,0.11),transparent_26%),linear-gradient(180deg,#030712_0%,#07101d_45%,#02050b_100%)]" />
      <div className="pointer-events-none fixed inset-0 z-0 opacity-[0.07] [background-image:linear-gradient(rgba(34,211,238,.45)_1px,transparent_1px),linear-gradient(90deg,rgba(34,211,238,.45)_1px,transparent_1px)] [background-size:42px_42px]" />

      <main className="relative z-10 mx-auto w-full max-w-[1160px] px-4 py-5 sm:px-6 lg:px-8">
        <section className="ha-panel ha-hero-grid min-h-[470px] overflow-hidden p-5 md:grid md:grid-cols-[1.08fr_.92fr] md:items-center md:p-8">
          <div className="relative flex min-h-[300px] items-center justify-center overflow-hidden rounded-[10px] border border-cyan-300/10 bg-black/25">
            <img src={backgroundImage} alt="" className="absolute inset-0 h-full w-full object-cover opacity-50" />
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(34,211,238,0.26),transparent_42%),linear-gradient(90deg,rgba(2,6,23,0.2),rgba(2,6,23,0.72))]" />
            <img
              src={hustleArenaLogo}
              alt="Hustle Arena"
              className="relative z-10 w-[min(88%,480px)] object-contain drop-shadow-[0_0_34px_rgba(34,211,238,0.52)]"
            />
          </div>

          <div className="relative px-2 py-8 md:px-8">
            <h1 className="font-display text-[42px] font-black uppercase leading-[0.92] tracking-normal text-white sm:text-[58px] lg:text-[64px]">
              Built By <span className="text-[#2d74ff]">Pros</span>
              <br />
              For Gamers
              <br />
              Not Spectators
            </h1>
            <p className="mt-5 max-w-md text-sm font-semibold leading-6 text-slate-300">
              The ultimate self-wagering CS2 platform. Compete. Risk. Win. On your terms.
            </p>
            <ul className="mt-6 space-y-3 text-xs font-black uppercase tracking-[0.08em] text-slate-200">
              {["Self-wager CS2 matches", "Instant matchmaking & lobbies", "Fair play. Secure. Anti-cheat.", "Instant skin & cash payouts"].map((item) => (
                <li key={item} className="flex items-center gap-3">
                  <span className="flex h-5 w-5 items-center justify-center rounded-full border border-cyan-300/40 bg-cyan-400/10 text-cyan-300">
                    <CheckCircle2 size={13} />
                  </span>
                  {item}
                </li>
              ))}
            </ul>
            <div className="mt-8 flex flex-col gap-4 sm:flex-row">
              <button onClick={onLogin} className="ha-blue-button min-h-[52px] px-9 text-sm">
                Play Now
              </button>
              <a href="#tournaments" className="ha-dark-button min-h-[52px] px-9 text-sm">
                How It Works
              </a>
            </div>
          </div>
        </section>

        <section id="tournaments" className="ha-panel mt-10 p-5 sm:p-7">
          <div className="mb-6 text-center">
            <h2 className="font-display text-3xl font-black uppercase tracking-normal text-white">
              <span className="text-[#1f67ff]">Live</span> Tournaments
            </h2>
            <p className="mt-2 text-sm font-semibold text-slate-400">Compete in high-stakes CS2 tournaments and climb the leaderboard.</p>
          </div>
          <div className="grid gap-5 md:grid-cols-3">
            {tournaments.map((tournament) => (
              <article key={tournament.title} className="group overflow-hidden rounded-[7px] border border-cyan-300/18 bg-[#07101c] shadow-[0_18px_40px_rgba(0,0,0,0.35)]">
                <div className="relative h-44 overflow-hidden">
                  <img src={tournament.image} alt="" className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" />
                  <div className="absolute inset-0 bg-gradient-to-t from-[#07101c] via-transparent to-transparent" />
                  <div className="absolute left-4 top-4 rounded border border-blue-400/35 bg-blue-600/20 px-2.5 py-1 text-xs font-black uppercase text-blue-300">{tournament.tag}</div>
                </div>
                <div className="p-5">
                  <h3 className="font-display text-2xl font-black uppercase tracking-normal text-white">{tournament.title}</h3>
                  <div className="mt-5 grid grid-cols-2 border-t border-cyan-300/10 pt-4">
                    <div>
                      <div className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">Entry Fee</div>
                      <div className="mt-1 font-display text-2xl font-black text-[#ff7a22]">{tournament.entry}</div>
                    </div>
                    <div className="border-l border-cyan-300/10 pl-5">
                      <div className="text-[10px] font-black uppercase tracking-[0.14em] text-blue-400">Prize Pool</div>
                      <div className="mt-1 font-display text-2xl font-black text-[#2d74ff]">{tournament.prize}</div>
                    </div>
                  </div>
                  <button onClick={onLogin} className="ha-blue-button mt-5 w-full py-3 text-xs">Join Now</button>
                </div>
              </article>
            ))}
          </div>
          <div className="mt-7 flex justify-center">
            <button className="ha-dark-button min-w-[280px] py-3 text-xs">View All Tournaments</button>
          </div>
        </section>

        <section id="pro-gear" className="mt-10 grid gap-6 md:grid-cols-[.78fr_1.22fr]">
          <div className="ha-panel p-7">
            <h2 className="font-display text-[38px] font-black uppercase leading-[0.95] tracking-normal">
              Gear Up.
              <br />
              Lock In.
              <br />
              <span className="text-[#ff7a22]">Take Over.</span>
            </h2>
            <p className="mt-5 text-sm font-semibold leading-6 text-slate-400">
              Use promo codes, grab exclusive rewards, and boost your CS2 grind with Hustle Arena.
            </p>
            <div className="mt-7 grid grid-cols-2 gap-3">
              <div className="border border-cyan-300/15 bg-black/22 p-4">
                <div className="font-display text-xl font-black text-[#2d74ff]">10% OFF</div>
                <div className="mt-1 text-[10px] font-black uppercase text-slate-400">On All Deposits</div>
              </div>
              <div className="border border-cyan-300/15 bg-black/22 p-4">
                <div className="font-display text-xl font-black text-[#ff7a22]">FREE CASE</div>
                <div className="mt-1 text-[10px] font-black uppercase text-slate-400">For New Players</div>
              </div>
            </div>
            <button onClick={onLogin} className="ha-blue-button mt-7 px-7 py-3 text-xs">Claim Rewards</button>
          </div>

          <div className="ha-panel relative min-h-[330px] overflow-hidden p-5">
            <img src={arenaGuardImage} alt="" className="absolute inset-0 h-full w-full object-cover opacity-60" />
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(37,99,235,0.28),transparent_38%),linear-gradient(90deg,rgba(2,6,23,0.86),rgba(2,6,23,0.38))]" />
            <div className="relative z-10 flex h-full min-h-[290px] items-center justify-center">
              <div className="grid grid-cols-2 gap-8 text-cyan-200 sm:grid-cols-4">
                {[Target, Crosshair, Shield, Gift].map((Icon, index) => (
                  <div key={index} className="flex h-20 w-20 rotate-[-8deg] items-center justify-center rounded border border-cyan-300/20 bg-blue-500/10 shadow-[0_0_28px_rgba(37,99,235,0.22)]">
                    <Icon size={38} />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section id="community" className="py-12 text-center">
          <h2 className="font-display text-4xl font-black uppercase tracking-normal">
            Join The <span className="text-[#2d74ff] italic">Global</span> Squad
          </h2>
          <p className="mx-auto mt-3 max-w-lg text-sm font-semibold leading-6 text-slate-400">
            Hustle Arena is where CS2 players battle, win, and rise together. Are you in?
          </p>
          <div className="mt-7 grid gap-5 md:grid-cols-3">
            {[
              { icon: <Users size={36} />, value: "2.4M+", label: "Players" },
              { icon: <Target size={36} />, value: "150K+", label: "Matches Played", orange: true },
              { icon: <Trophy size={36} />, value: "$12M+", label: "Paid Out" },
            ].map((stat) => (
              <div key={stat.label} className="rounded-[10px] border border-cyan-300/14 bg-[#07101c]/78 p-6 shadow-[0_18px_40px_rgba(0,0,0,0.28)]">
                <div className="mx-auto flex items-center justify-center gap-5">
                  <div className="text-[#2d74ff]">{stat.icon}</div>
                  <div className="text-left">
                    <div className={`font-display text-3xl font-black ${stat.orange ? "text-[#ff7a22]" : "text-[#2d74ff]"}`}>{stat.value}</div>
                    <div className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">{stat.label}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
          <button onClick={onLogin} className="ha-blue-button mx-auto mt-8 min-w-[260px] py-4 text-xs">Join Now</button>
        </section>

        <footer className="mb-5 grid gap-3 border border-cyan-300/12 bg-[#06101c]/85 px-5 py-4 sm:grid-cols-2 lg:grid-cols-5">
          {trustItems.map((item) => (
            <div key={item.title} className="flex items-center gap-3 border-cyan-300/10 py-2 lg:border-r lg:last:border-r-0">
              <div className="text-[#2d74ff]">{item.icon}</div>
              <div>
                <div className="text-xs font-black uppercase tracking-[0.12em] text-white">{item.title}</div>
                <div className="text-[10px] font-bold uppercase tracking-[0.1em] text-slate-500">{item.body}</div>
              </div>
            </div>
          ))}
        </footer>
      </main>
    </div>
  );
}
export function AuthForm({ onLogin, onRefuse }: { onLogin: (user: any) => void; onRefuse?: () => void }) {
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showDisclaimer, setShowDisclaimer] = useState(false);

  const useSupabaseAuth = isSupabaseConfigured();

  const handleSteamSignIn = async () => {
    if (!useSupabaseAuth) {
      setError("Steam login requires Supabase and the Hustle Arena backend.");
      return;
    }

    setError("");
    setLoading(true);
    try {
      await startSteamLogin();
      onLogin({ provider: "steam" });
    } catch (err: any) {
      console.error("Steam Auth error:", err);
      setError(err.message || "Steam authentication failed");
      setLoading(false);
    }
  };

  return (
    <div className="space-y-7">
      {showDisclaimer ? (
        <div className="space-y-6">
          <div className="border border-amber-300/35 bg-[linear-gradient(180deg,rgba(120,53,15,0.20),rgba(15,23,42,0.45))] p-5 text-amber-50 shadow-[0_0_28px_rgba(251,191,36,0.08)]">
            <div className="mb-3 text-center font-display text-[26px] font-black uppercase tracking-normal text-white">
              Disclaimer
            </div>
            <p className="text-sm font-semibold leading-7 text-slate-200">
              Hustle-Arena is a skill-based competitive tournament platform where success is earned: not chanced.
              Our matches and tournaments are solely designed around pure gaming performance, strategy and highly
              enforced fair gameplay and strictly does not constitute gambling or betting under applicable legal standards.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <button
              onClick={() => void handleSteamSignIn()}
              disabled={loading}
              className="ha-blue-button min-h-[54px] w-full text-sm"
            >
              {loading ? "Opening Steam..." : "I acknowledge"}
            </button>
            <button
              onClick={() => {
                setShowDisclaimer(false);
                setError("");
                onRefuse?.();
              }}
              disabled={loading}
              className="ha-dark-button min-h-[54px] w-full text-sm"
            >
              I refuse
            </button>
          </div>
        </div>
      ) : (
        <>
      {error && (
        <div className="border border-red-400/45 bg-red-500/12 p-4 text-center text-xs font-black uppercase tracking-[0.14em] text-red-200">
          {error}
        </div>
      )}

      {!useSupabaseAuth && (
        <div className="border border-orange-300/35 bg-orange-400/10 p-5 text-orange-200">
          <div className="mb-2 flex items-center gap-3 text-xs font-black uppercase tracking-[0.12em]">
            <AlertCircle size={14} />
            Firebase Fallback Active
          </div>
          <p className="text-sm leading-6 text-orange-100/80">Supabase auth keys are not configured in this environment, so Steam sign-in cannot start here.</p>
        </div>
      )}

      {useSupabaseAuth && (
        <div className="relative overflow-hidden border border-emerald-300/55 bg-[linear-gradient(90deg,rgba(16,185,129,0.13),rgba(6,182,212,0.08))] p-5 shadow-[0_0_28px_rgba(16,185,129,0.12)]">
          <div className="absolute inset-y-0 right-0 w-1/2 bg-[radial-gradient(circle_at_center,rgba(16,185,129,0.2),transparent_60%)]" />
          <div className="relative flex items-center gap-4">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full border border-emerald-300/25 bg-emerald-400/10 text-emerald-300 shadow-[0_0_22px_rgba(16,185,129,0.18)]">
              <ShieldCheck size={28} />
            </div>
            <p className="text-sm font-semibold leading-6 text-slate-200">
              Steam is the required sign-in method. Your verified <span className="font-black text-emerald-300">SteamID64</span> is stored on your <span className="font-black text-emerald-300">Hustle Arena</span> profile automatically.
            </p>
          </div>
        </div>
      )}

      <button
        onClick={() => {
          setError("");
          setShowDisclaimer(true);
        }}
        disabled={loading}
        className="ha-steam-button w-full"
      >
        <span className="flex h-11 w-11 items-center justify-center rounded-full bg-white/95 shadow-[0_0_22px_rgba(255,255,255,0.28)]">
          <img src="https://upload.wikimedia.org/wikipedia/commons/8/83/Steam_icon_logo.svg" className="h-7 w-7" alt="" />
        </span>
        Sign in with Steam
      </button>
        </>
      )}
    </div>
  );
}

export function KYCForm({ addToast, user }: { addToast: any, user: any }) {
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
      if (isSupabaseConfigured()) {
        await submitKycForReview(user.id, documents, personalInfo);
      } else {
        await updateDoc(doc(db, "users", user.id), {
          kycStatus: "pending",
          kycUpdatedAt: serverTimestamp(),
          kycMessage: null,
          kycDocuments: documents,
          kycDetails: personalInfo
        });
      }
      addToast("KYC Documents submitted for review!", "success");
    } catch (error) {
      console.error("KYC submission error:", error);
      addToast("Failed to submit KYC", "error");
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
