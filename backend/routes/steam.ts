import crypto from "node:crypto";
import { Router } from "express";
import { backendConfig } from "../config";
import { requireAuth, type AuthenticatedRequest } from "../middleware/auth";
import { getSupabaseAdmin } from "../supabase";

export const steamRouter = Router();

const STEAM_OPENID_URL = "https://steamcommunity.com/openid/login";
const OPENID_NS = "http://specs.openid.net/auth/2.0";
const OPENID_IDENTIFIER_SELECT = "http://specs.openid.net/auth/2.0/identifier_select";
const STATE_TTL_MS = 10 * 60 * 1000;

class BadRequestError extends Error {
  statusCode = 400;
}

function getFrontendOrigin() {
  return backendConfig.frontendOrigin.split(",").map((origin) => origin.trim()).filter(Boolean)[0] || "http://localhost:5173";
}

function getStateSecret() {
  return backendConfig.steamOpenIdStateSecret || backendConfig.supabaseServiceRoleKey;
}

function base64UrlEncode(value: string) {
  return Buffer.from(value, "utf8").toString("base64url");
}

function base64UrlDecode(value: string) {
  return Buffer.from(value, "base64url").toString("utf8");
}

function signPayload(payload: string) {
  return crypto.createHmac("sha256", getStateSecret()).update(payload).digest("base64url");
}

function createState(userId: string) {
  const payload = base64UrlEncode(JSON.stringify({
    userId,
    nonce: crypto.randomUUID(),
    exp: Date.now() + STATE_TTL_MS,
  }));
  return `${payload}.${signPayload(payload)}`;
}

function verifyState(state: unknown) {
  if (typeof state !== "string" || !state.includes(".")) {
    throw new BadRequestError("Invalid Steam login state.");
  }

  const [payload, signature] = state.split(".");
  const expectedSignature = signPayload(payload);
  if (Buffer.byteLength(signature) !== Buffer.byteLength(expectedSignature)) {
    throw new BadRequestError("Invalid Steam login state.");
  }
  if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature))) {
    throw new BadRequestError("Invalid Steam login state.");
  }

  let parsed: { userId?: string; exp?: number };
  try {
    parsed = JSON.parse(base64UrlDecode(payload)) as { userId?: string; exp?: number };
  } catch {
    throw new BadRequestError("Invalid Steam login state.");
  }
  if (!parsed.userId || !parsed.exp || parsed.exp < Date.now()) {
    throw new BadRequestError("Expired Steam login state.");
  }

  return parsed;
}

function getSteamCallbackUrl() {
  return `${backendConfig.backendPublicUrl}/api/steam/callback`;
}

function getSteamIdFromClaimedId(value: unknown) {
  const claimedId = typeof value === "string" ? value : "";
  const match = claimedId.match(/^https?:\/\/steamcommunity\.com\/openid\/id\/([0-9]{17})$/);
  if (!match) {
    throw new BadRequestError("Steam did not return a valid SteamID64.");
  }
  return match[1];
}

async function verifySteamOpenId(query: Record<string, unknown>) {
  const claimedId = typeof query["openid.claimed_id"] === "string" ? query["openid.claimed_id"] : "";
  const identity = typeof query["openid.identity"] === "string" ? query["openid.identity"] : "";

  if (!claimedId || claimedId !== identity) {
    throw new BadRequestError("Steam identity response is invalid.");
  }

  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (key.startsWith("openid.") && typeof value === "string") {
      params.set(key, value);
    }
  }
  params.set("openid.mode", "check_authentication");

  const response = await fetch(STEAM_OPENID_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: params.toString(),
  });

  const body = await response.text();
  if (!response.ok || !body.includes("is_valid:true")) {
    throw new BadRequestError("Steam login could not be verified.");
  }

  return getSteamIdFromClaimedId(claimedId);
}

steamRouter.post("/link/start", requireAuth, (req: AuthenticatedRequest, res) => {
  const returnTo = getSteamCallbackUrl();
  const realm = new URL(returnTo).origin;
  const state = createState(req.auth?.user.id || "");
  const redirectUrl = new URL(STEAM_OPENID_URL);

  redirectUrl.searchParams.set("openid.ns", OPENID_NS);
  redirectUrl.searchParams.set("openid.mode", "checkid_setup");
  redirectUrl.searchParams.set("openid.return_to", `${returnTo}?state=${encodeURIComponent(state)}`);
  redirectUrl.searchParams.set("openid.realm", realm);
  redirectUrl.searchParams.set("openid.identity", OPENID_IDENTIFIER_SELECT);
  redirectUrl.searchParams.set("openid.claimed_id", OPENID_IDENTIFIER_SELECT);

  res.json({ authUrl: redirectUrl.toString() });
});

steamRouter.get("/callback", async (req, res, next) => {
  const frontendOrigin = getFrontendOrigin();

  try {
    const state = verifyState(req.query.state);
    const steamId64 = await verifySteamOpenId(req.query);
    const supabaseAdmin = getSupabaseAdmin();
    const { error } = await supabaseAdmin.rpc("link_verified_steam_id64", {
      p_user_id: state.userId,
      p_steam_id64: steamId64,
    });

    if (error) {
      throw error;
    }

    res.redirect(`${frontendOrigin}/?steam_link=success`);
  } catch (error) {
    console.error("Steam OpenID callback failed:", error);
    res.redirect(`${frontendOrigin}/?steam_link=error`);
  }
});
