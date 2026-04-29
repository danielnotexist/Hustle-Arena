import crypto from "node:crypto";
import { Router } from "express";
import { backendConfig } from "../config";
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

function createState(userId?: string) {
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
  if (!parsed.exp || parsed.exp < Date.now()) {
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

function getSteamAuthUrl(state: string) {
  const returnTo = getSteamCallbackUrl();
  const realm = new URL(returnTo).origin;
  const redirectUrl = new URL(STEAM_OPENID_URL);

  redirectUrl.searchParams.set("openid.ns", OPENID_NS);
  redirectUrl.searchParams.set("openid.mode", "checkid_setup");
  redirectUrl.searchParams.set("openid.return_to", `${returnTo}?state=${encodeURIComponent(state)}`);
  redirectUrl.searchParams.set("openid.realm", realm);
  redirectUrl.searchParams.set("openid.identity", OPENID_IDENTIFIER_SELECT);
  redirectUrl.searchParams.set("openid.claimed_id", OPENID_IDENTIFIER_SELECT);

  return redirectUrl.toString();
}

async function ensureSteamSupabaseUser(steamId64: string) {
  const supabaseAdmin = getSupabaseAdmin();
  const syntheticEmail = `steam_${steamId64}@steam.hustle-arena.local`;
  const username = `Steam_${steamId64.slice(-8)}`;

  const { data: existingProfile, error: existingProfileError } = await supabaseAdmin
    .from("profiles")
    .select("id, email")
    .eq("steam_id64", steamId64)
    .maybeSingle();

  if (existingProfileError) {
    throw existingProfileError;
  }

  if (existingProfile?.id && existingProfile.email) {
    return {
      userId: existingProfile.id as string,
      email: existingProfile.email as string,
    };
  }

  const { data: emailProfile, error: emailProfileError } = await supabaseAdmin
    .from("profiles")
    .select("id, email")
    .eq("email", syntheticEmail)
    .maybeSingle();

  if (emailProfileError) {
    throw emailProfileError;
  }

  if (emailProfile?.id && emailProfile.email) {
    return {
      userId: emailProfile.id as string,
      email: emailProfile.email as string,
    };
  }

  const { data: createdUser, error: createUserError } = await supabaseAdmin.auth.admin.createUser({
    email: syntheticEmail,
    email_confirm: true,
    password: crypto.randomBytes(32).toString("base64url"),
    user_metadata: {
      username,
      steam_id64: steamId64,
      steam_verified: true,
      provider: "steam",
    },
  });

  if (createUserError || !createdUser.user?.id || !createdUser.user.email) {
    throw createUserError || new Error("Failed to create Steam user.");
  }

  return {
    userId: createdUser.user.id,
    email: createdUser.user.email,
  };
}

async function createSteamMagicLink(email: string) {
  const supabaseAdmin = getSupabaseAdmin();
  const { data, error } = await supabaseAdmin.auth.admin.generateLink({
    type: "magiclink",
    email,
    options: {
      redirectTo: `${getFrontendOrigin()}/?steam_login=success`,
    },
  });

  if (error || !data.properties?.action_link) {
    throw error || new Error("Failed to create Steam login session.");
  }

  return data.properties.action_link;
}

steamRouter.post("/login/start", (_req, res) => {
  const authUrl = getSteamAuthUrl(createState());
  res.json({ authUrl });
});

steamRouter.get("/callback", async (req, res) => {
  const frontendOrigin = getFrontendOrigin();

  try {
    verifyState(req.query.state);
    const steamId64 = await verifySteamOpenId(req.query);
    const steamUser = await ensureSteamSupabaseUser(steamId64);
    const supabaseAdmin = getSupabaseAdmin();
    const { error } = await supabaseAdmin.rpc("link_verified_steam_id64", {
      p_user_id: steamUser.userId,
      p_steam_id64: steamId64,
    });

    if (error) {
      throw error;
    }

    const actionLink = await createSteamMagicLink(steamUser.email);
    res.redirect(actionLink);
  } catch (error) {
    console.error("Steam OpenID callback failed:", error);
    res.redirect(`${frontendOrigin}/?steam_login=error`);
  }
});
