import { createClient } from "@supabase/supabase-js";
import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const requiredEnv = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"];
for (const name of requiredEnv) {
  if (!process.env[name]) {
    console.error(`Missing required env: ${name}`);
    process.exit(1);
  }
}

const workerId = process.env.WORKER_ID || `gcp-cs2-${process.pid}`;
const provider = process.env.SERVER_PROVIDER || "gcp-test";
const providerRegion = process.env.SERVER_REGION || null;
const publicIp = process.env.CS2_PUBLIC_IP || "34.165.241.124";
const port = process.env.CS2_PORT || "27015";
const cs2ServiceName = process.env.CS2_SERVICE_NAME || "hustle-cs2";
const pollMs = Number(process.env.WORKER_POLL_MS || 5000);
const heartbeatMs = Number(process.env.WORKER_HEARTBEAT_MS || 15000);
const readyDelayMs = Number(process.env.CS2_READY_DELAY_MS || 12000);

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

let activeMatchId = null;
let busy = false;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function quoteEnv(value) {
  return `'${String(value ?? "").replace(/'/g, "'\\''")}'`;
}

async function sudo(args, options = {}) {
  const { stdout, stderr } = await execFileAsync("sudo", args, {
    timeout: options.timeout || 120000,
  });
  if (stdout.trim()) console.log(stdout.trim());
  if (stderr.trim()) console.error(stderr.trim());
}

function buildEndpoint() {
  const password = process.env.CS2_SERVER_PASSWORD || "";
  return password ? `steam://connect/${publicIp}:${port}/${password}` : `steam://connect/${publicIp}:${port}`;
}

async function writeRuntimeConfig(serverConfig) {
  const selectedMap = serverConfig?.selectedMap || process.env.CS2_DEFAULT_MAP || "de_dust2";
  const lobbyName = serverConfig?.lobbyName || "Match";
  const hostname = `${process.env.CS2_HOSTNAME || "Hustle Arena"} | ${lobbyName}`;
  const content = [
    `CS2_PUBLIC_IP=${quoteEnv(publicIp)}`,
    `CS2_PORT=${quoteEnv(port)}`,
    `CS2_TV_PORT=${quoteEnv(process.env.CS2_TV_PORT || "27020")}`,
    `CS2_GSLT=${quoteEnv(process.env.CS2_GSLT || "")}`,
    `CS2_RCON_PASSWORD=${quoteEnv(process.env.CS2_RCON_PASSWORD || "")}`,
    `CS2_SERVER_PASSWORD=${quoteEnv(process.env.CS2_SERVER_PASSWORD || "")}`,
    `CS2_DEFAULT_MAP=${quoteEnv(selectedMap)}`,
    `CS2_HOSTNAME=${quoteEnv(hostname)}`,
    "",
  ].join("\n");

  await fs.writeFile("/tmp/hustle-cs2.env", content, "utf8");
  await sudo(["cp", "/tmp/hustle-cs2.env", "/etc/hustle-arena/cs2.env"]);
  await sudo(["chmod", "600", "/etc/hustle-arena/cs2.env"]);
  await sudo(["chown", "root:root", "/etc/hustle-arena/cs2.env"]);
}

async function recordStatus(matchId, status, extra = {}) {
  const { error } = await supabase.rpc("record_match_server_status", {
    p_match_id: matchId,
    p_status: status,
    p_provider_instance_id: workerId,
    p_endpoint: extra.endpoint || null,
    p_public_ip: publicIp,
    p_metadata: extra.metadata || {},
    p_failure_reason: extra.failureReason || null,
  });
  if (error) throw error;
}

async function claimOne() {
  const { data, error } = await supabase.rpc("claim_next_match_server_allocation", {
    p_worker_id: workerId,
    p_provider: provider,
    p_provider_region: providerRegion,
    p_claim_seconds: 120,
  });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  return row || null;
}

async function handleClaim(claim) {
  const matchId = claim.match_id;
  const serverConfig = claim.server_config || {};
  activeMatchId = matchId;
  console.log(`Claimed match ${matchId}`);

  await recordStatus(matchId, "provisioning", { metadata: { workerId, serverConfig } });
  await writeRuntimeConfig(serverConfig);

  await recordStatus(matchId, "booting", { metadata: { workerId } });
  await sudo(["systemctl", "restart", cs2ServiceName]);

  await sleep(readyDelayMs);
  await recordStatus(matchId, "ready", {
    endpoint: buildEndpoint(),
    metadata: { workerId, service: cs2ServiceName, port, publicIp },
  });
  console.log(`Match ${matchId} marked ready at ${buildEndpoint()}`);
}

async function poll() {
  if (busy) return;
  busy = true;
  try {
    const claim = await claimOne();
    if (claim) {
      await handleClaim(claim);
    }
  } catch (error) {
    console.error("Worker poll failed:", error?.message || error);
  } finally {
    busy = false;
  }
}

async function heartbeatLoop() {
  while (true) {
    await sleep(heartbeatMs);
    if (!activeMatchId) continue;
    try {
      const { error } = await supabase.rpc("record_match_server_heartbeat", {
        p_match_id: activeMatchId,
        p_provider_instance_id: workerId,
        p_status: "ready",
        p_payload: { workerId, publicIp, port, at: new Date().toISOString() },
      });
      if (error) throw error;
    } catch (error) {
      console.error("Heartbeat failed:", error?.message || error);
    }
  }
}

console.log(`Hustle Arena worker ${workerId} polling provider=${provider} region=${providerRegion || "any"}`);
setInterval(poll, pollMs);
void poll();
void heartbeatLoop();
