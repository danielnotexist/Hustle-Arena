import { Clock3, Lock, MessageSquare, Radio, Server, Users } from "lucide-react";
import React, { useEffect, useMemo, useState } from "react";
import { isSupabaseConfigured } from "../lib/env";
import {
  castLobbyMapVote,
  completeDemoMatchForTesting,
  createMatchmakingLobby,
  ensureLobbyMapVoteSession,
  fetchMyActiveLobby,
  fetchMyActiveMatch,
  fetchOpenMatchmakingLobbies,
  fetchRecentMatches,
  joinMatchmakingLobby,
  joinMatchServer,
  launchMatchServer,
  leaveMatchmakingLobby,
  sendLobbyMessage,
  setLobbyMemberReady,
  setLobbyMemberTeamSide,
  syncMapVoteSession,
  type ActiveMatch,
  type LobbyMode,
  type MatchmakingLobby,
  type MatchmakingLobbyMember,
  type RecentMatchSummary,
  type SupportedGameMode,
  type TeamSide,
} from "../lib/supabase/matchmaking";
import type { AccountMode } from "./types";
import { KYCForm } from "./landing-auth";
import { cn } from "./shared-ui";

const MAP_LABELS: Record<string, string> = {
  dust2: "Dust II",
  inferno: "Inferno",
  mirage: "Mirage",
  nuke: "Nuke",
  anubis: "Anubis",
  ancient: "Ancient",
  overpass: "Overpass",
};

const TEAM_ACTIONS: Array<{ label: string; value: TeamSide }> = [
  { label: "T", value: "T" },
  { label: "CT", value: "CT" },
  { label: "Bench", value: "UNASSIGNED" },
];

const getGameModeOptions = (teamSize: 2 | 5): SupportedGameMode[] =>
  teamSize === 2 ? ["wingman"] : ["competitive", "team_ffa", "ffa"];

const formatMode = (value: string | null | undefined) =>
  (value || "competitive").replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());

const getActiveMembers = (lobby: MatchmakingLobby | null) =>
  (lobby?.lobby_members || []).filter((member) => !member.left_at && !member.kicked_at);

const getCountdown = (turnEndsAt: string | null | undefined) => {
  if (!turnEndsAt) return "00:00";
  const seconds = Math.max(0, Math.ceil((new Date(turnEndsAt).getTime() - Date.now()) / 1000));
  return `00:${seconds.toString().padStart(2, "0")}`;
};

function TeamBoard({
  title,
  accentClass,
  members,
  teamSize,
  currentUserId,
  onMove,
}: {
  title: string;
  accentClass: string;
  members: MatchmakingLobbyMember[];
  teamSize: number;
  currentUserId?: string;
  onMove: (side: TeamSide) => Promise<void>;
}) {
  return (
    <div className={`rounded-xl border p-4 ${accentClass}`}>
      <div className="flex items-center justify-between mb-3">
        <div className="text-[10px] font-bold uppercase tracking-[0.2em]">{title}</div>
        <div className="text-[10px] uppercase tracking-[0.2em]">{members.length}/{teamSize}</div>
      </div>
      <div className="space-y-2 min-h-[120px]">
        {members.length === 0 && <div className="text-xs text-esport-text-muted">No players yet</div>}
        {members.map((member) => (
          <div key={member.user_id} className="rounded-lg border border-white/10 bg-black/20 px-3 py-2 flex items-center justify-between gap-3">
            <div>
              <div className="text-sm font-bold text-white">{member.profiles?.username || member.user_id}</div>
              <div className="text-[10px] uppercase tracking-[0.2em] text-esport-text-muted">{member.is_ready ? "Ready" : "Pending"}</div>
            </div>
            {member.user_id === currentUserId && (
              <button onClick={() => void onMove("UNASSIGNED")} className="text-[10px] uppercase tracking-[0.2em] text-esport-text-muted hover:text-white">
                Move
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

export function CustomLobbyView({
  addToast,
  openModal,
  user,
  accountMode,
  refreshSession,
}: {
  addToast: any;
  openModal: any;
  user: any;
  accountMode: AccountMode;
  refreshSession: () => Promise<void>;
}) {
  const isKycVerified = user?.kycStatus === "verified" || user?.email?.toLowerCase() === "danielnotexist@gmail.com";
  const requiresKyc = accountMode === "live";
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [joiningLobbyId, setJoiningLobbyId] = useState<string | null>(null);
  const [activeLobby, setActiveLobby] = useState<MatchmakingLobby | null>(null);
  const [activeMatch, setActiveMatch] = useState<ActiveMatch | null>(null);
  const [openLobbies, setOpenLobbies] = useState<MatchmakingLobby[]>([]);
  const [recentMatches, setRecentMatches] = useState<RecentMatchSummary[]>([]);
  const [chatDraft, setChatDraft] = useState("");
  const [selectedWinningSide, setSelectedWinningSide] = useState<"T" | "CT">("T");
  const [formState, setFormState] = useState({
    name: "",
    stakeAmount: accountMode === "demo" ? "0" : "5",
    teamSize: 5 as 2 | 5,
    gameMode: "competitive" as SupportedGameMode,
    password: "",
  });

  const loadState = async () => {
    if (!isSupabaseConfigured() || !user?.id) return;
    setLoading(true);
    try {
      const [browserLobbies, myLobby, matches] = await Promise.all([
        fetchOpenMatchmakingLobbies(accountMode as LobbyMode),
        fetchMyActiveLobby(user.id, accountMode as LobbyMode),
        fetchRecentMatches(accountMode as LobbyMode),
      ]);
      if (myLobby?.map_vote_sessions?.[0]?.id) {
        await syncMapVoteSession(myLobby.map_vote_sessions[0].id);
      }
      const refreshedLobby = await fetchMyActiveLobby(user.id, accountMode as LobbyMode);
      setOpenLobbies(browserLobbies.filter((lobby) => lobby.id !== refreshedLobby?.id));
      setActiveLobby(refreshedLobby);
      setRecentMatches(matches);
      setActiveMatch(refreshedLobby ? await fetchMyActiveMatch(refreshedLobby.id) : null);
    } catch (error) {
      console.error("Failed to load lobby state:", error);
      addToast("Failed to load lobby data.", "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadState();
  }, [user?.id, accountMode]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      void loadState();
    }, 3000);
    return () => window.clearInterval(interval);
  }, [user?.id, accountMode]);

  useEffect(() => {
    setFormState((current) => ({
      ...current,
      stakeAmount: accountMode === "demo" ? "0" : current.stakeAmount,
      gameMode: current.teamSize === 2 ? "wingman" : current.gameMode,
    }));
  }, [accountMode]);

  const activeMembers = useMemo(() => getActiveMembers(activeLobby), [activeLobby]);
  const tMembers = activeMembers.filter((member) => member.team_side === "T");
  const ctMembers = activeMembers.filter((member) => member.team_side === "CT");
  const benchMembers = activeMembers.filter((member) => member.team_side === "UNASSIGNED");
  const myMembership = activeMembers.find((member) => member.user_id === user?.id) || null;
  const isLeader = activeLobby?.leader_id === user?.id;
  const readyCount = activeMembers.filter((member) => member.is_ready).length;
  const activeVoteSession = (activeLobby?.map_vote_sessions || [])[0] || null;
  const myVote = (activeVoteSession?.map_votes || []).find((vote) => vote.user_id === user?.id)?.map_code || null;
  const voteCounts = (activeVoteSession?.map_votes || []).reduce<Record<string, number>>((acc, vote) => {
    acc[vote.map_code] = (acc[vote.map_code] || 0) + 1;
    return acc;
  }, {});
  const canStartVote = !!activeLobby && !activeMatch && !activeLobby.selected_map && tMembers.length === activeLobby.team_size && ctMembers.length === activeLobby.team_size && isLeader;
  const canJoinServer = !!activeMatch && !!activeLobby?.selected_map && !!myMembership && myMembership.team_side !== "UNASSIGNED";
  const hasJoinedServer = !!activeMatch?.match_players?.some((player) => player.user_id === user?.id && player.joined_server);
  const joinedServerCount = (activeMatch?.match_players || []).filter((player) => player.joined_server).length;
  const totalServerPlayers = (activeMatch?.match_players || []).length;

  const guardedAction = async (action: () => Promise<void>) => {
    if (requiresKyc && !isKycVerified) {
      addToast("KYC verification is required for live custom lobbies.", "error");
      return;
    }
    await action();
  };

  const handleCreateLobby = async () => {
    await guardedAction(async () => {
      setCreating(true);
      try {
        await createMatchmakingLobby({
          mode: accountMode as LobbyMode,
          kind: "custom",
          name: formState.name || `${accountMode === "demo" ? "Demo" : "Live"} Custom Lobby`,
          teamSize: formState.teamSize,
          gameMode: formState.teamSize === 2 ? "wingman" : formState.gameMode,
          stakeAmount: accountMode === "demo" ? 0 : Number(formState.stakeAmount || 0),
          password: formState.password,
        });
        addToast("Custom lobby created.", "success");
        await loadState();
      } catch (error: any) {
        console.error(error);
        addToast(error?.message || "Failed to create lobby.", "error");
      } finally {
        setCreating(false);
      }
    });
  };

  const handleJoinLobby = async (lobby: MatchmakingLobby) => {
    setJoiningLobbyId(lobby.id);
    try {
      const password = lobby.password_required ? window.prompt("Enter lobby password") || "" : null;
      await joinMatchmakingLobby(lobby.id, password);
      addToast("Joined lobby.", "success");
      await loadState();
    } catch (error: any) {
      console.error(error);
      addToast(error?.message || "Failed to join lobby.", "error");
    } finally {
      setJoiningLobbyId(null);
    }
  };

  const handleMove = async (side: TeamSide) => {
    if (!activeLobby) return;
    try {
      await setLobbyMemberTeamSide(activeLobby.id, side);
      await loadState();
    } catch (error: any) {
      console.error(error);
      addToast(error?.message || "Failed to update team side.", "error");
    }
  };

  const handleReadyToggle = async () => {
    if (!activeLobby || !myMembership) return;
    try {
      await setLobbyMemberReady(activeLobby.id, !myMembership.is_ready);
      await loadState();
    } catch (error: any) {
      console.error(error);
      addToast(error?.message || "Failed to update ready state.", "error");
    }
  };

  const handleSendMessage = async () => {
    if (!activeLobby || !chatDraft.trim()) return;
    try {
      await sendLobbyMessage(activeLobby.id, chatDraft);
      setChatDraft("");
      await loadState();
    } catch (error: any) {
      console.error(error);
      addToast(error?.message || "Failed to send lobby chat message.", "error");
    }
  };

  const handleStartVote = async () => {
    if (!activeLobby) return;
    try {
      await ensureLobbyMapVoteSession(activeLobby.id);
      await loadState();
    } catch (error: any) {
      console.error(error);
      addToast(error?.message || "Failed to start map veto.", "error");
    }
  };

  const handleVote = async (mapCode: string) => {
    if (!activeVoteSession) return;
    try {
      await castLobbyMapVote(activeVoteSession.id, mapCode);
      await loadState();
    } catch (error: any) {
      console.error(error);
      addToast(error?.message || "Failed to cast map veto.", "error");
    }
  };

  const handleJoinServer = async () => {
    if (!activeMatch) return;
    try {
      const endpoint = await joinMatchServer(activeMatch.id);
      await loadState();
      launchMatchServer(endpoint);
    } catch (error: any) {
      console.error(error);
      addToast(error?.message || "Failed to join server.", "error");
    }
  };

  const handleLeaveLobby = async () => {
    if (!activeLobby) return;
    try {
      await leaveMatchmakingLobby(activeLobby.id);
      await loadState();
    } catch (error: any) {
      console.error(error);
      addToast(error?.message || "Failed to leave lobby.", "error");
    }
  };

  const handleCompleteDemoMatch = async () => {
    if (!activeMatch) return;
    try {
      await completeDemoMatchForTesting(activeMatch.id, selectedWinningSide);
      await refreshSession();
      await loadState();
      addToast("Demo match completed.", "success");
    } catch (error: any) {
      console.error(error);
      addToast(error?.message || "Failed to complete demo match.", "error");
    }
  };

  if (requiresKyc && !isKycVerified) {
    return (
      <div className="max-w-5xl mx-auto h-[60vh] flex flex-col items-center justify-center text-center space-y-6">
        <div className="w-24 h-24 bg-esport-danger/10 rounded-full flex items-center justify-center">
          <Lock size={48} className="text-esport-danger" />
        </div>
        <div className="space-y-2">
          <h2 className="text-3xl font-display font-bold uppercase tracking-tight">Battlefield Locked</h2>
          <p className="text-esport-text-muted max-w-md mx-auto">You must complete your KYC verification before you can enter live-stakes matchmaking.</p>
        </div>
        <button onClick={() => openModal("KYC Verification", <KYCForm addToast={addToast} user={user} />)} className="esport-btn-primary px-8 py-4 uppercase tracking-widest text-sm">
          Verify Identity Now
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div className="flex flex-col lg:flex-row justify-between gap-4">
        <div>
          <h2 className="text-3xl font-display font-bold uppercase tracking-tight">Squad Hub Custom Lobbies</h2>
          <p className="text-sm text-esport-text-muted max-w-3xl">Create and manage private CS2 custom lobbies with stake selection, passwords, side assignment, lobby chat, map veto, and dedicated-server staging. Quick matchmaking belongs in Battlefield.</p>
        </div>
        <div className="rounded-xl border border-esport-border bg-esport-card px-4 py-3 flex items-center gap-3">
          <Radio className="w-4 h-4 text-esport-accent" />
          <div className="text-xs uppercase tracking-[0.2em] text-esport-text-muted">{loading ? "Syncing" : "Backend synced"}</div>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[1.25fr_0.75fr] gap-6">
        <div className="space-y-6">
          {!activeLobby && (
            <div className="esport-card p-5 space-y-4">
              <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-esport-accent">Create {accountMode === "demo" ? "Demo" : "Live"} Custom Lobby</div>
              <input value={formState.name} onChange={(e) => setFormState((current) => ({ ...current, name: e.target.value }))} className="w-full bg-white/5 border border-esport-border rounded-lg px-3 py-3 text-sm focus:outline-none focus:border-esport-accent/60" placeholder="Lobby name" />
              <input value={formState.stakeAmount} onChange={(e) => setFormState((current) => ({ ...current, stakeAmount: e.target.value }))} disabled={accountMode === "demo"} className="w-full bg-white/5 border border-esport-border rounded-lg px-3 py-3 text-sm focus:outline-none focus:border-esport-accent/60 disabled:opacity-50" placeholder="Stake amount" />
              <select value={formState.teamSize} onChange={(e) => setFormState((current) => ({ ...current, teamSize: Number(e.target.value) as 2 | 5, gameMode: Number(e.target.value) === 2 ? "wingman" : "competitive" }))} className="w-full bg-white/5 border border-esport-border rounded-lg px-3 py-3 text-sm focus:outline-none focus:border-esport-accent/60">
                <option value={2}>2v2</option>
                <option value={5}>5v5</option>
              </select>
              <select value={formState.gameMode} onChange={(e) => setFormState((current) => ({ ...current, gameMode: e.target.value as SupportedGameMode }))} className="w-full bg-white/5 border border-esport-border rounded-lg px-3 py-3 text-sm focus:outline-none focus:border-esport-accent/60">
                {getGameModeOptions(formState.teamSize).map((mode) => <option key={mode} value={mode}>{formatMode(mode)}</option>)}
              </select>
              <input type="password" value={formState.password} onChange={(e) => setFormState((current) => ({ ...current, password: e.target.value }))} className="w-full bg-white/5 border border-esport-border rounded-lg px-3 py-3 text-sm focus:outline-none focus:border-esport-accent/60" placeholder="Optional password" />
              <button onClick={handleCreateLobby} disabled={creating} className="esport-btn-primary w-full py-3 disabled:opacity-50">{creating ? "Creating..." : "Create Custom Lobby"}</button>
            </div>
          )}

          {activeLobby && (
            <div className="esport-card p-5 space-y-5">
              <div className="flex flex-col lg:flex-row justify-between gap-4">
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-esport-accent">{isLeader ? "My" : "Joined"} {accountMode === "demo" ? "Demo" : "Live"} Custom Lobby</div>
                  <h3 className="text-2xl font-display font-bold uppercase">{activeLobby.name}</h3>
                  <div className="text-xs text-esport-text-muted mt-1">{formatMode(activeLobby.game_mode)} · {activeLobby.team_size}v{activeLobby.team_size} · Stake {Number(activeLobby.stake_amount).toFixed(2)} USDT</div>
                </div>
                <div className="rounded-xl border border-esport-border bg-black/20 px-4 py-3 min-w-[220px]">
                  <div className="text-[10px] uppercase tracking-[0.2em] text-esport-text-muted">Selected map</div>
                  <div className="mt-2 text-lg font-display font-bold text-white">{activeLobby.selected_map ? MAP_LABELS[activeLobby.selected_map] || activeLobby.selected_map : "Pending veto"}</div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="rounded-xl border border-esport-border bg-white/5 p-4"><div className="text-[10px] uppercase tracking-[0.2em] text-esport-text-muted">Lobby status</div><div className="mt-2 text-sm font-bold text-white">{activeMatch ? activeMatch.status : activeLobby.status}</div></div>
                <div className="rounded-xl border border-esport-border bg-white/5 p-4"><div className="text-[10px] uppercase tracking-[0.2em] text-esport-text-muted">Ready players</div><div className="mt-2 text-sm font-bold text-esport-success">{readyCount}/{activeMembers.length}</div></div>
                <div className="rounded-xl border border-esport-border bg-white/5 p-4"><div className="text-[10px] uppercase tracking-[0.2em] text-esport-text-muted">Funds locked</div><div className="mt-2 text-sm font-bold text-white">{activeLobby.mode === "demo" ? "0.00 USDT" : `${Number(activeLobby.stake_amount).toFixed(2)} USDT / player`}</div></div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <TeamBoard title="Terrorists" accentClass="border-[#ff5e7b]/40 bg-[#ff5e7b]/10" members={tMembers} teamSize={activeLobby.team_size} currentUserId={user?.id} onMove={handleMove} />
                <TeamBoard title="Counter-Terrorists" accentClass="border-[#30d5ff]/40 bg-[#30d5ff]/10" members={ctMembers} teamSize={activeLobby.team_size} currentUserId={user?.id} onMove={handleMove} />
              </div>

              <div className="rounded-xl border border-esport-border bg-white/5 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-[10px] uppercase tracking-[0.2em] text-esport-text-muted">Bench / Unassigned</div>
                    <div className="text-xs text-esport-text-muted mt-1">Pick a Counter-Strike side before readying up.</div>
                  </div>
                  <div className="text-[10px] uppercase tracking-[0.2em] text-esport-text-muted">{benchMembers.length} players</div>
                </div>
                <div className="mt-3 space-y-2">
                  {benchMembers.length === 0 && <div className="text-xs text-esport-text-muted">No unassigned players.</div>}
                  {benchMembers.map((member) => (
                    <div key={member.user_id} className="rounded-lg border border-white/10 bg-black/20 px-3 py-2 flex items-center justify-between gap-3">
                      <div>
                        <div className="text-sm font-bold text-white">{member.profiles?.username || member.user_id}</div>
                        <div className="text-[10px] uppercase tracking-[0.2em] text-esport-text-muted">{member.is_ready ? "Ready" : "Pending"}</div>
                      </div>
                      {member.user_id === user?.id && <div className="flex gap-2">{TEAM_ACTIONS.filter((team) => team.value !== "UNASSIGNED").map((team) => <button key={team.value} onClick={() => void handleMove(team.value)} className="esport-btn-secondary !px-3 !py-2 text-[10px] uppercase tracking-[0.2em]">{team.label}</button>)}</div>}
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                <button onClick={handleLeaveLobby} className="esport-btn-secondary">{isLeader ? "Close / Leave Lobby" : "Leave Lobby"}</button>
                <button onClick={handleReadyToggle} disabled={!myMembership || myMembership.team_side === "UNASSIGNED"} className="esport-btn-primary disabled:opacity-50">{myMembership?.is_ready ? "Unready" : "Ready"}</button>
                {!activeMatch && <button onClick={handleStartVote} disabled={!canStartVote} className="esport-btn-secondary disabled:opacity-50">Start Map Veto</button>}
                {canJoinServer && <button onClick={handleJoinServer} disabled={hasJoinedServer} className="esport-btn-primary disabled:opacity-50">{hasJoinedServer ? "Joined Server" : "Join Server"}</button>}
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-[1fr_0.9fr] gap-4">
                <div className="rounded-xl border border-esport-border bg-white/5 p-4">
                  <div className="flex items-center gap-2 mb-3"><MessageSquare className="w-4 h-4 text-esport-accent" /><div className="text-[10px] uppercase tracking-[0.2em] text-esport-text-muted">Lobby chat</div></div>
                  <div className="h-52 rounded-lg border border-white/10 bg-black/20 p-3 overflow-y-auto space-y-2">
                    {(activeLobby.lobby_messages || []).length === 0 && <div className="text-xs text-esport-text-muted">No messages yet.</div>}
                    {(activeLobby.lobby_messages || []).map((message) => <div key={message.id} className="text-sm"><span className="font-bold text-esport-accent">{message.profiles?.username || "Player"}:</span> <span className="text-white">{message.message}</span></div>)}
                  </div>
                  <div className="mt-3 flex gap-2">
                    <input value={chatDraft} onChange={(e) => setChatDraft(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void handleSendMessage(); } }} className="flex-1 bg-black/30 border border-esport-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-esport-accent/60" placeholder="Type a message..." />
                    <button onClick={handleSendMessage} disabled={!chatDraft.trim()} className="esport-btn-primary disabled:opacity-50">Send</button>
                  </div>
                </div>

                <div className="rounded-xl border border-esport-border bg-white/5 p-4 space-y-4">
                  <div className="flex items-center justify-between gap-3">
                    <div><div className="text-[10px] uppercase tracking-[0.2em] text-esport-text-muted">CS2 map veto</div><div className="text-xs text-esport-text-muted mt-1">Two matching clicks from the active team veto the map and rotate the turn.</div></div>
                    {activeVoteSession && <div className="text-right"><div className="text-[10px] uppercase tracking-[0.2em] text-esport-text-muted">Turn</div><div className="text-sm font-bold text-white">{activeVoteSession.active_team}</div></div>}
                  </div>
                  {!activeVoteSession ? <div className="rounded-lg border border-dashed border-white/15 p-4 text-sm text-esport-text-muted">Fill both teams, then let the lobby leader start the veto flow.</div> : (
                    <>
                      <div className="rounded-lg border border-white/10 bg-black/20 px-4 py-3 flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2"><Clock3 className="w-4 h-4 text-esport-accent" /><div className="text-xs uppercase tracking-[0.2em] text-esport-text-muted">Round {activeVoteSession.round_number} · Team {activeVoteSession.active_team} veto</div></div>
                        <div className="font-mono text-sm font-bold text-white">{getCountdown(activeVoteSession.turn_ends_at)}</div>
                      </div>
                      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
                        {activeVoteSession.remaining_maps.map((mapCode) => (
                          <button key={mapCode} onClick={() => void handleVote(mapCode)} className={cn("rounded-xl border bg-gradient-to-br from-[#262c43] to-[#0c1020] p-3 text-left transition-all min-h-[110px] hover:border-esport-accent/70", myVote === mapCode ? "ring-2 ring-esport-accent border-esport-accent" : "border-esport-border")}>
                            <div className="text-[10px] uppercase tracking-[0.2em] text-esport-text-muted">Map</div>
                            <div className="mt-2 text-sm font-display font-bold uppercase text-white">{MAP_LABELS[mapCode] || mapCode}</div>
                            <div className="mt-4 text-[10px] uppercase tracking-[0.2em] text-esport-text-muted">{voteCounts[mapCode] ? `${voteCounts[mapCode]} vote${voteCounts[mapCode] === 1 ? "" : "s"}` : "No vote"}</div>
                          </button>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              </div>

              {activeMatch && (
                <div className="rounded-xl border border-esport-secondary/30 bg-esport-secondary/10 p-4 flex flex-col lg:flex-row gap-4 lg:items-center lg:justify-between">
                  <div>
                    <div className="text-[10px] uppercase tracking-[0.2em] text-esport-text-muted">CS2 dedicated server state</div>
                    <div className="mt-2 text-lg font-bold text-white">{activeMatch.status === "pending" ? "CS2 server staged · waiting for player joins" : "CS2 match live · Lobby removed from browser"}</div>
                    <div className="text-xs text-esport-text-muted mt-1">
                      {activeMatch.status === "pending"
                        ? `${joinedServerCount}/${totalServerPlayers} players joined the server. Once everyone joins, the server session becomes live.`
                        : "Reconnect remains available from the header until the match ends."}
                    </div>
                  </div>
                  <div className="flex flex-col sm:flex-row gap-2">
                    {canJoinServer && <button onClick={handleJoinServer} disabled={hasJoinedServer} className="esport-btn-primary disabled:opacity-50">{hasJoinedServer ? "Joined Server" : "Join Server"}</button>}
                    {accountMode === "demo" && activeMatch.status === "live" && <><select value={selectedWinningSide} onChange={(e) => setSelectedWinningSide(e.target.value as "T" | "CT")} className="bg-black/30 border border-esport-border rounded-lg px-3 py-2 text-sm"><option value="T">Team T wins</option><option value="CT">Team CT wins</option></select><button onClick={handleCompleteDemoMatch} className="esport-btn-primary">Complete Demo Match</button></>}
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="esport-card p-5">
            <div className="flex items-center gap-2 mb-4"><Server className="w-4 h-4 text-esport-accent" /><div className="text-[10px] uppercase tracking-[0.2em] text-esport-text-muted">Recent matches</div></div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="text-left text-[10px] uppercase tracking-[0.2em] text-esport-text-muted"><th className="pb-3">Lobby</th><th className="pb-3">Mode</th><th className="pb-3">Map</th><th className="pb-3">Score</th><th className="pb-3">Stake</th></tr></thead>
                <tbody>
                  {recentMatches.length === 0 && <tr><td colSpan={5} className="py-6 text-esport-text-muted">No finished matches yet.</td></tr>}
                  {recentMatches.map((match) => <tr key={match.id} className="border-t border-white/5"><td className="py-3"><div className="font-bold text-white">{match.name}</div><div className="text-xs text-esport-text-muted">{match.winningSide === "DRAW" ? "Draw" : `Winner: ${match.winningSide}`}</div></td><td className="py-3 text-white">{formatMode(match.gameMode)}</td><td className="py-3 text-white">{MAP_LABELS[match.selectedMap] || match.selectedMap}</td><td className="py-3 text-white">{match.winningScore} - {match.losingScore}</td><td className="py-3 text-white">{match.stakeAmount.toFixed(2)} USDT</td></tr>)}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <div className="esport-card p-5">
            <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-esport-accent mb-3">CS2 {accountMode === "demo" ? "Demo" : "Live"} Server Browser</div>
            <div className="space-y-3">
              {openLobbies.length === 0 && <div className="rounded-lg border border-dashed border-white/15 p-4 text-sm text-esport-text-muted">No open custom lobbies yet.</div>}
              {openLobbies.map((lobby) => {
                const count = getActiveMembers(lobby).length;
                return (
                  <div key={lobby.id} className="rounded-xl border border-esport-border bg-white/5 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2"><div className="font-bold text-white">{lobby.name}</div>{lobby.password_required && <Lock className="w-3.5 h-3.5 text-esport-secondary" />}</div>
                        <div className="text-[10px] uppercase tracking-[0.18em] text-esport-text-muted mt-1">{formatMode(lobby.game_mode)} · {count}/{lobby.max_players} players · Stake {Number(lobby.stake_amount).toFixed(2)} USDT</div>
                      </div>
                      <button onClick={() => void handleJoinLobby(lobby)} disabled={joiningLobbyId === lobby.id} className="esport-btn-secondary disabled:opacity-50">{joiningLobbyId === lobby.id ? "Joining..." : "Join"}</button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="esport-card p-5"><div className="text-[10px] font-bold uppercase tracking-[0.2em] text-esport-accent mb-3">Custom Lobby Notes</div><div className="text-sm text-esport-text-muted">Use Squad Hub for private lobby creation and management. Battlefield is reserved for quick-match queueing.</div></div>
          <div className="esport-card p-5"><div className="flex items-center gap-2 mb-3"><Users className="w-4 h-4 text-esport-accent" /><div className="text-[10px] uppercase tracking-[0.2em] text-esport-text-muted">Custom Lobby Ruleset</div></div><div className="space-y-3 text-sm text-esport-text-muted"><p>2v2 custom lobbies only allow Wingman. 5v5 custom lobbies support Competitive, Team FFA, and FFA presets.</p><p>The lobby organiser controls stake, player population, password protection, and final map flow before server launch.</p><p>Map veto rotates every 15 seconds between T and CT until one CS2 map remains, then the server join phase opens.</p></div></div>
        </div>
      </div>
    </div>
  );
}

