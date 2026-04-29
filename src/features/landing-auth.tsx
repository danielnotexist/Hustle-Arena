import { motion } from "motion/react";
import { AlertCircle, CheckCircle2, ChevronDown, Gamepad2, Plus, ShieldAlert, User } from "lucide-react";
import React, { useRef, useState } from "react";
import hustleArenaLogo from "../assets/hustle-arena-logo.png";
import { auth, createUserWithEmailAndPassword, db, doc, googleProvider, serverTimestamp, signInWithEmailAndPassword, signInWithPopup, updateDoc } from "../firebase";
import { isSupabaseConfigured } from "../lib/env";
import { submitKycForReview } from "../lib/supabase/profile";
import { supabase } from "../lib/supabase";
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

export function AuthForm({ onLogin }: { onLogin: (user: any) => void }) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [username, setUsername] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const useSupabaseAuth = isSupabaseConfigured();

  const handleSubmit = async () => {
    setError("");
    setLoading(true);

    try {
      if (useSupabaseAuth) {
        if (mode === "login") {
          const { error: signInError } = await supabase.auth.signInWithPassword({
            email,
            password,
          });
          if (signInError) throw signInError;
          onLogin({ email });
        } else {
          const { error: signUpError } = await supabase.auth.signUp({
            email,
            password,
            options: {
              data: {
                username: username.trim() || email.split("@")[0],
              },
            },
          });
          if (signUpError) throw signUpError;
          setMode("login");
          alert("Registration successful. If email confirmation is enabled, verify your email and then sign in.");
        }
      } else if (mode === "login") {
        await signInWithEmailAndPassword(auth, email, password);
      } else {
        await createUserWithEmailAndPassword(auth, email, password);
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
      if (useSupabaseAuth) {
        setError("Google sign-in should be connected through Supabase Auth providers next. Email/password auth is ready now.");
        return;
      }

      await signInWithPopup(auth, googleProvider);
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

  const handleSteamSignIn = () => {
    setError("Steam SSO is now handled after sign-in from Profile settings so it can securely link to your Hustle Arena account.");
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

      {!useSupabaseAuth && (
        <div className="p-4 rounded-xl bg-esport-secondary/10 border border-esport-secondary/30 text-esport-secondary text-[10px] leading-relaxed font-medium">
          <div className="flex items-center gap-2 mb-2 text-xs font-bold uppercase tracking-wider">
            <AlertCircle size={14} />
            Firebase Fallback Active
          </div>
          Supabase auth keys are not configured in this environment, so the app is using the legacy Firebase sign-in flow.
        </div>
      )}

      {useSupabaseAuth && (
        <div className="p-4 rounded-xl bg-esport-success/10 border border-esport-success/30 text-esport-success text-[10px] leading-relaxed font-medium">
          <div className="flex items-center gap-2 mb-2 text-xs font-bold uppercase tracking-wider">
            <CheckCircle2 size={14} />
            Supabase Auth Active
          </div>
          Email/password authentication is now handled by Supabase.
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
        <button
          onClick={handleSteamSignIn}
          className="esport-btn-secondary py-3 text-xs flex items-center justify-center gap-2 group"
        >
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
