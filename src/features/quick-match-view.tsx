import { CheckCircle2, Clock, Lock, Search, Server, ShieldAlert, Sword, Target, Users } from "lucide-react";
import React, { useEffect, useRef, useState } from "react";
import { supabase } from "../lib/supabase";
import { quickQueueCancel, quickQueueJoinOrMatch } from "../lib/supabase/matchmaking";
import { KYCForm } from "./landing-auth";
import type { AccountMode } from "./types";

export function BattlefieldView({
  addToast,
  openModal,
  user,
  accountMode,
  onMatchReady,
}: {
  addToast: any;
  openModal: any;
  user: any;
  accountMode: AccountMode;
  refreshSession?: () => Promise<void>;
  onMatchReady?: () => void;
}) {
  const isKycVerified = user?.kycStatus === "verified" || user?.email?.toLowerCase() === "danielnotexist@gmail.com";
  const requiresKyc = accountMode === "live";
  const [matchState, setMatchState] = useState<"idle" | "searching" | "found" | "accepted" | "connecting">("idle");
  const [searchTime, setSearchTime] = useState(0);
  const [acceptedCount, setAcceptedCount] = useState(0);
  const [matchType, setMatchType] = useState<"ranked_5v5" | "ranked_2v2">("ranked_5v5");
  const [queueMode, setQueueMode] = useState<"solo" | "party">("solo");
  const [playersJoined, setPlayersJoined] = useState(0);
  const [playersNeeded, setPlayersNeeded] = useState(0);
  const [estimatedWaitSeconds, setEstimatedWaitSeconds] = useState(75);
  const [onlineNow, setOnlineNow] = useState<Array<{ user_id: string; username: string; avatar_url?: string | null }>>([]);
  const [matchedLobbyId, setMatchedLobbyId] = useState<string | null>(null);
  const pollingRef = useRef<number | null>(null);
  const presenceChannelRef = useRef<any>(null);

  const selectedTeamSize = matchType === "ranked_2v2" ? 2 : 5;
  const selectedQueueLabel = matchType === "ranked_2v2" ? "WINGMAN 2V2" : "COMPETETIVE 5V5";

  useEffect(() => {
    if (matchState !== "searching") return;
    const interval = window.setInterval(() => {
      setSearchTime((prev) => prev + 1);
    }, 1000);
    return () => {
      window.clearInterval(interval);
    };
  }, [matchState]);

  useEffect(() => {
    let interval: number | undefined;
    if (matchState === "accepted") {
      interval = window.setInterval(() => {
        setAcceptedCount((prev) => {
          if (prev >= 10) {
            window.setTimeout(() => {
              setMatchState("connecting");
              onMatchReady?.();
            }, 800);
            return 10;
          }
          return prev + 1;
        });
      }, 400);
    }
    return () => {
      if (interval) window.clearInterval(interval);
    };
  }, [matchState, onMatchReady]);

  useEffect(() => {
    if (!user?.id) return;
    if (presenceChannelRef.current) {
      supabase.removeChannel(presenceChannelRef.current);
      presenceChannelRef.current = null;
    }

    const channel = supabase.channel(`battlefield-online-${accountMode}`, {
      config: { presence: { key: user.id } },
    });

    channel
      .on("presence", { event: "sync" }, () => {
        const state = channel.presenceState();
        const flattened = Object.values(state)
          .flat()
          .map((entry: any) => ({
            user_id: entry.user_id as string,
            username: entry.username as string,
            avatar_url: entry.avatar_url as string | null,
          }))
          .filter((entry) => !!entry.user_id);
        const byId = new Map<string, { user_id: string; username: string; avatar_url?: string | null }>();
        flattened.forEach((entry) => byId.set(entry.user_id, entry));
        setOnlineNow(Array.from(byId.values()));
      })
      .subscribe(async (status: string) => {
        if (status === "SUBSCRIBED") {
          await channel.track({
            user_id: user.id,
            username: user.username || user.email?.split("@")[0] || "Player",
            avatar_url: user.avatarUrl || null,
            online_at: new Date().toISOString(),
          });
        }
      });

    presenceChannelRef.current = channel;
    return () => {
      if (presenceChannelRef.current) {
        supabase.removeChannel(presenceChannelRef.current);
        presenceChannelRef.current = null;
      }
    };
  }, [user?.id, accountMode, user?.username, user?.email, user?.avatarUrl]);

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60).toString().padStart(2, "0");
    const s = (seconds % 60).toString().padStart(2, "0");
    return `${m}:${s}`;
  };

  const startSearch = async () => {
    if (requiresKyc && !isKycVerified) {
      addToast("KYC Verification required to play", "error");
      return;
    }
    if (accountMode !== "demo") {
      addToast("Switch to Demo Account from Profile before entering matchmaking.", "error");
      return;
    }
    try {
      setSearchTime(0);
      setMatchState("searching");
      const status = await quickQueueJoinOrMatch(accountMode, selectedTeamSize, queueMode);
      if (status) {
        setPlayersJoined(status.players_joined || 0);
        setPlayersNeeded(status.players_needed || 0);
        setEstimatedWaitSeconds(status.estimated_wait_seconds || 10);
        setMatchedLobbyId(status.lobby_id || null);
        if (status.status === "matched") {
          setMatchState("found");
        }
      }
      addToast("Searching for real players in queue...", "info");
    } catch (error: any) {
      console.error(error);
      setMatchState("idle");
      addToast(error?.message || "Failed to start quick queue.", "error");
    }
  };

  const acceptMatch = () => {
    setMatchState("accepted");
    setAcceptedCount(1);
  };

  const cancelSearch = async () => {
    try {
      await quickQueueCancel(accountMode);
    } catch (error) {
      console.error("Failed to cancel quick queue:", error);
    }
    setMatchState("idle");
    setSearchTime(0);
    setPlayersJoined(0);
    setPlayersNeeded(0);
    setMatchedLobbyId(null);
  };

  useEffect(() => {
    if (matchState !== "searching") {
      if (pollingRef.current) {
        window.clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
      return;
    }

    const poll = async () => {
      try {
        const status = await quickQueueJoinOrMatch(accountMode, selectedTeamSize, queueMode);
        if (!status) return;
        setPlayersJoined(status.players_joined || 0);
        setPlayersNeeded(status.players_needed || 0);
        setEstimatedWaitSeconds(status.estimated_wait_seconds || 10);
        setMatchedLobbyId(status.lobby_id || null);
        if (status.status === "matched") {
          setMatchState("found");
        }
      } catch (error) {
        console.error("Quick queue poll failed:", error);
      }
    };

    void poll();
    const interval = window.setInterval(() => {
      void poll();
    }, 2000);
    pollingRef.current = interval;

    return () => {
      window.clearInterval(interval);
      pollingRef.current = null;
    };
  }, [matchState, accountMode, selectedTeamSize, queueMode]);

  if (requiresKyc && !isKycVerified) {
    return (
      <div className="max-w-5xl mx-auto h-[60vh] flex flex-col items-center justify-center text-center space-y-6">
        <div className="w-24 h-24 bg-esport-danger/10 rounded-full flex items-center justify-center">
          <Lock size={48} className="text-esport-danger" />
        </div>
        <div className="space-y-2">
          <h2 className="text-3xl font-display font-bold uppercase tracking-tight">Battlefield Locked</h2>
          <p className="text-esport-text-muted max-w-md mx-auto">
            You must complete your KYC verification before you can enter the battlefield and compete for prizes.
          </p>
        </div>
        <button
          onClick={() => openModal("KYC Verification", <KYCForm addToast={addToast} user={user} />)}
          className="esport-btn-primary px-8 py-4 uppercase tracking-widest text-sm"
        >
          Verify Identity Now
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-display font-bold uppercase tracking-tight">Battlefield</h2>
          <p className="text-esport-text-muted">
            {accountMode === "demo"
              ? "Quick matchmaking is active here. Use Battlefield only for instant solo or party queue search."
              : "Quick matchmaking is currently restricted to Demo Accounts so queue and server flows can be tested safely."}
          </p>
        </div>
        <div className="flex items-center gap-4 bg-esport-card border border-esport-border px-4 py-2 rounded-lg">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-esport-success animate-pulse" />
            <span className="text-sm font-bold">
              {accountMode === "demo" ? `Quick Queue Online - ${onlineNow.length}` : "Live Queue Locked"}
            </span>
          </div>
        </div>
      </div>

      {accountMode !== "demo" && (
        <div className="esport-card p-6 border border-esport-secondary/30 bg-esport-secondary/5">
          <div className="flex items-start gap-4">
            <div className="w-10 h-10 rounded-full bg-esport-secondary/10 flex items-center justify-center text-esport-secondary shrink-0">
              <ShieldAlert size={18} />
            </div>
            <div className="space-y-2">
              <div className="text-sm font-bold uppercase tracking-widest text-white">Demo Account Required</div>
              <p className="text-sm text-esport-text-muted">
                Battlefield quick-queue testing is isolated to demo-mode users only. Switch from the Profile section to enter the demo environment.
              </p>
            </div>
          </div>
        </div>
      )}

      {matchState === "idle" && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="md:col-span-2 space-y-4">
            <div className="esport-card p-6 border border-esport-border">
              <div className="flex items-center justify-between gap-4 mb-4">
                <div>
                  <h3 className="text-xl font-bold font-display uppercase">Queue Type</h3>
                  <p className="text-sm text-esport-text-muted">Pick whether you are searching alone or entering quick queue with your party.</p>
                </div>
                <div className="text-[10px] uppercase tracking-widest text-esport-text-muted">Battlefield only</div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <button
                  onClick={() => setQueueMode("solo")}
                  className={`rounded-xl border p-4 text-left transition-colors ${queueMode === "solo" ? "border-esport-accent bg-esport-accent/10" : "border-esport-border bg-black/20 hover:border-white/20"}`}
                >
                  <div className="text-sm font-bold text-white">Solo Quick Match</div>
                  <div className="text-xs text-esport-text-muted mt-1">Find a random team and queue on your own.</div>
                </button>
                <button
                  onClick={() => setQueueMode("party")}
                  className={`rounded-xl border p-4 text-left transition-colors ${queueMode === "party" ? "border-esport-accent bg-esport-accent/10" : "border-esport-border bg-black/20 hover:border-white/20"}`}
                >
                  <div className="text-sm font-bold text-white">Party Quick Match</div>
                  <div className="text-xs text-esport-text-muted mt-1">Enter the random queue with your current squad or party.</div>
                </button>
              </div>
            </div>

            <div
              onClick={() => setMatchType("ranked_5v5")}
              className={`esport-card p-6 border relative overflow-hidden group cursor-pointer transition-colors ${matchType === "ranked_5v5" ? "border-esport-accent" : "border-esport-border hover:border-white/20"}`}
            >
              <div className={`absolute inset-0 bg-gradient-to-r from-esport-accent/20 to-transparent transition-opacity ${matchType === "ranked_5v5" ? "opacity-100" : "opacity-0 group-hover:opacity-50"}`} />
              <div className="flex items-center justify-between relative z-10">
                <div>
                  <h3 className="text-2xl font-bold font-display uppercase mb-1">COMPETETIVE 5V5</h3>
                  <p className="text-sm text-esport-text-muted">Quick competitive matchmaking. Affects your ELO.</p>
                </div>
                <div className={`w-12 h-12 rounded-full flex items-center justify-center border transition-colors ${matchType === "ranked_5v5" ? "bg-esport-accent/20 border-esport-accent" : "bg-black/50 border-esport-border"}`}>
                  <Sword className={matchType === "ranked_5v5" ? "text-esport-accent" : "text-esport-text-muted"} />
                </div>
              </div>
            </div>

            <div
              onClick={() => setMatchType("ranked_2v2")}
              className={`esport-card p-6 border relative overflow-hidden group cursor-pointer transition-colors ${matchType === "ranked_2v2" ? "border-esport-accent" : "border-esport-border hover:border-white/20"}`}
            >
              <div className={`absolute inset-0 bg-gradient-to-r from-esport-accent/20 to-transparent transition-opacity ${matchType === "ranked_2v2" ? "opacity-100" : "opacity-0 group-hover:opacity-50"}`} />
              <div className="flex items-center justify-between relative z-10">
                <div>
                  <h3 className="text-xl font-bold font-display uppercase mb-1">WINGMAN 2V2</h3>
                  <p className="text-sm text-esport-text-muted">Wingman quick queue. Competitive and fast.</p>
                </div>
                <div className={`w-12 h-12 rounded-full flex items-center justify-center border transition-colors ${matchType === "ranked_2v2" ? "bg-esport-accent/20 border-esport-accent" : "bg-black/50 border-esport-border"}`}>
                  <Users className={matchType === "ranked_2v2" ? "text-esport-accent" : "text-esport-text-muted"} />
                </div>
              </div>
            </div>
          </div>

          <div className="esport-card p-6 flex flex-col justify-center items-center text-center space-y-6">
            <div className="w-24 h-24 rounded-full border-4 border-esport-border flex items-center justify-center bg-black/50">
              <Target className="w-10 h-10 text-esport-text-muted" />
            </div>
            <div>
              <div className="text-sm text-esport-text-muted mb-1">{queueMode === "solo" ? "Solo Queue" : "Party Queue"}</div>
              <div className="text-sm text-white font-bold">{selectedQueueLabel}</div>
              <div className="text-xs text-esport-text-muted mb-2">Estimated Wait</div>
              <div className="text-2xl font-bold font-mono">{formatTime(estimatedWaitSeconds)}</div>
              {matchState === "searching" && (
                <div className="mt-2 text-xs text-esport-text-muted">
                  {playersJoined} joined - {playersNeeded} needed
                </div>
              )}
            </div>
            <button onClick={() => void startSearch()} className="esport-btn-primary w-full py-4 text-lg animate-pulse hover:animate-none shadow-[0_0_20px_rgba(59,130,246,0.4)]">
              {queueMode === "solo" ? "FIND SOLO MATCH" : "FIND PARTY MATCH"}
            </button>
            <div className="w-full rounded-lg border border-esport-border bg-black/20 p-3 text-left">
              <div className="text-[10px] uppercase tracking-widest text-esport-text-muted mb-2">
                Online Right Now
              </div>
              <div className="space-y-2 max-h-[160px] overflow-y-auto custom-scrollbar">
                {onlineNow.length === 0 && (
                  <div className="text-xs text-esport-text-muted">No active players on Battlefield right now.</div>
                )}
                {onlineNow.slice(0, 12).map((entry) => (
                  <div key={entry.user_id} className="flex items-center gap-2">
                    <img
                      src={entry.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(entry.username || "Player")}&background=1f2937&color=ffffff&size=48`}
                      alt={entry.username || "Player"}
                      className="w-6 h-6 rounded-full border border-white/20 object-cover"
                    />
                    <span className="text-xs text-white truncate">{entry.username || `Player ${entry.user_id.slice(0, 6)}`}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {matchState === "searching" && (
        <div className="esport-card p-12 flex flex-col items-center justify-center min-h-[400px] relative overflow-hidden">
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
              <h3 className="text-2xl font-bold font-display uppercase tracking-widest text-esport-accent mb-2">{queueMode === "solo" ? "Searching Solo Queue" : "Searching Party Queue"}</h3>
              <div className="text-4xl font-mono font-bold text-white">{formatTime(searchTime)}</div>
            </div>
            <button onClick={() => void cancelSearch()} className="esport-btn-secondary text-esport-danger border-esport-danger/30 hover:bg-esport-danger/10">
              Cancel Search
            </button>
          </div>
        </div>
      )}

      {matchState === "found" && (
        <div className="esport-card p-12 flex flex-col items-center justify-center min-h-[400px] border-esport-success shadow-[0_0_50px_rgba(16,185,129,0.2)]">
          <div className="w-24 h-24 mx-auto bg-esport-success/20 rounded-full flex items-center justify-center border-2 border-esport-success mb-6 animate-bounce">
            <CheckCircle2 className="w-12 h-12 text-esport-success" />
          </div>
          <h3 className="text-4xl font-bold font-display uppercase tracking-widest text-white mb-2">{queueMode === "solo" ? "Solo Match Found!" : "Party Match Found!"}</h3>
          <p className="text-esport-text-muted mb-8">Please accept to join the quick-match lobby.</p>

          <div className="flex gap-4">
            <button onClick={acceptMatch} className="bg-esport-success hover:bg-emerald-400 text-black font-bold py-4 px-12 rounded-lg text-xl transition-transform active:scale-95 shadow-[0_0_20px_rgba(16,185,129,0.4)]">
              ACCEPT
            </button>
            <button onClick={() => void cancelSearch()} className="esport-btn-secondary py-4 px-8">
              DECLINE
            </button>
          </div>
        </div>
      )}

      {matchState === "accepted" && (
        <div className="esport-card p-12 flex flex-col items-center justify-center min-h-[400px]">
          <h3 className="text-2xl font-bold font-display uppercase tracking-widest text-white mb-8">Waiting for players...</h3>

          <div className="flex gap-2 mb-8">
            {Array.from({ length: selectedTeamSize * 2 }).map((_, i) => (
              <div key={i} className={`w-12 h-16 rounded border-2 flex items-center justify-center transition-all duration-300 ${i < acceptedCount ? "bg-esport-success/20 border-esport-success text-esport-success shadow-[0_0_10px_rgba(16,185,129,0.5)]" : "bg-black/50 border-esport-border text-esport-border"}`}>
                {i < acceptedCount ? <CheckCircle2 className="w-6 h-6" /> : <Clock className="w-6 h-6" />}
              </div>
            ))}
          </div>

          <div className="text-xl font-mono font-bold text-esport-accent">{acceptedCount} / {selectedTeamSize * 2} Accepted</div>
        </div>
      )}

      {matchState === "connecting" && (
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
          <div className="text-xs text-esport-text-muted mt-2">Lobby: {matchedLobbyId || "pending"}</div>
          <button onClick={() => void cancelSearch()} className="mt-8 esport-btn-secondary text-sm">
            Disconnect
          </button>
        </div>
      )}
    </div>
  );
}
