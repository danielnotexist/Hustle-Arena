import crypto from "node:crypto";
import { Router } from "express";
import { backendConfig } from "../config";
import { getSupabaseAdmin } from "../supabase";

export const steamRouter = Router();

const STEAM_OPENID_URL = "https://steamcommunity.com/openid/login";
const OPENID_NS = "http://specs.openid.net/auth/2.0";
const OPENID_IDENTIFIER_SELECT = "http://specs.openid.net/auth/2.0/identifier_select";
const STATE_TTL_MS = 10 * 60 * 1000;
const DEFAULT_STEAM_USERNAME_PREFIX = "Steam";
const MIN_STEAM_ACCOUNT_AGE_YEARS = 1;

type SteamProfileSummary = {
  personaName: string;
  avatarUrl: string | null;
  memberSince: string | null;
  profileUrl: string;
};

class BadRequestError extends Error {
  statusCode = 400;
}

function getAllowedFrontendOrigins() {
  return backendConfig.frontendOrigin
    .split(",")
    .map((origin) => origin.trim().replace(/\/$/, ""))
    .filter(Boolean);
}

function getFrontendOrigin(candidateOrigin?: unknown) {
  const allowedOrigins = getAllowedFrontendOrigins();
  const fallbackOrigin = allowedOrigins[0] || "http://localhost:5173";
  const requestedOrigin = typeof candidateOrigin === "string" ? candidateOrigin.trim().replace(/\/$/, "") : "";

  return requestedOrigin && allowedOrigins.includes(requestedOrigin) ? requestedOrigin : fallbackOrigin;
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

function createState(input: { userId?: string; returnOrigin?: string } = {}) {
  const payload = base64UrlEncode(JSON.stringify({
    userId: input.userId,
    returnOrigin: getFrontendOrigin(input.returnOrigin),
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

  let parsed: { userId?: string; returnOrigin?: string; exp?: number };
  try {
    parsed = JSON.parse(base64UrlDecode(payload)) as { userId?: string; returnOrigin?: string; exp?: number };
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

function decodeXmlEntities(value: string) {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'");
}

function extractSteamXmlValue(body: string, tagName: string) {
  const match = body.match(new RegExp(`<${tagName}><!\\[CDATA\\[(.*?)\\]\\]><\\/${tagName}>|<${tagName}>(.*?)<\\/${tagName}>`, "s"));
  return decodeXmlEntities(match?.[1] || match?.[2] || "").trim();
}

function parseSteamMemberSince(value: string) {
  const cleaned = value.replace(/\s+/g, " ").trim();
  if (!cleaned) {
    return null;
  }

  const match = cleaned.match(/^([A-Za-z]+)\s+([0-9]{1,2})(?:,\s*([0-9]{4}))?$/);
  if (!match) {
    return null;
  }

  const monthIndex = [
    "january",
    "february",
    "march",
    "april",
    "may",
    "june",
    "july",
    "august",
    "september",
    "october",
    "november",
    "december",
  ].indexOf(match[1].toLowerCase());
  const day = Number(match[2]);
  const now = new Date();
  let year = match[3] ? Number(match[3]) : now.getUTCFullYear();

  if (monthIndex < 0 || !Number.isInteger(day) || day < 1 || day > 31 || !Number.isInteger(year)) {
    return null;
  }

  let parsed = new Date(Date.UTC(year, monthIndex, day));
  if (!match[3] && parsed.getTime() > now.getTime()) {
    year -= 1;
    parsed = new Date(Date.UTC(year, monthIndex, day));
  }

  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== monthIndex ||
    parsed.getUTCDate() !== day
  ) {
    return null;
  }

  return parsed.toISOString().slice(0, 10);
}

function hasRequiredSteamAccountAge(memberSince: string | null) {
  if (!memberSince) {
    return false;
  }

  const joinedAt = new Date(`${memberSince}T00:00:00.000Z`);
  if (Number.isNaN(joinedAt.getTime())) {
    return false;
  }

  const eligibleAt = new Date(joinedAt);
  eligibleAt.setUTCFullYear(eligibleAt.getUTCFullYear() + MIN_STEAM_ACCOUNT_AGE_YEARS);
  return eligibleAt.getTime() <= Date.now();
}

function normalizeSteamPersonaName(value: unknown, steamId64: string) {
  const cleaned = String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 40);

  return cleaned || `${DEFAULT_STEAM_USERNAME_PREFIX}_${steamId64.slice(-8)}`;
}

async function fetchSteamProfileSummary(steamId64: string): Promise<SteamProfileSummary | null> {
  const profileUrl = `https://steamcommunity.com/profiles/${steamId64}`;

  try {
    const response = await fetch(`${profileUrl}?xml=1`, {
      headers: {
        "User-Agent": "HustleArena/1.0",
      },
    });

    const body = await response.text();
    if (!response.ok) {
      return null;
    }

    const personaName = extractSteamXmlValue(body, "steamID");
    const avatarUrl = extractSteamXmlValue(body, "avatarFull") || extractSteamXmlValue(body, "avatarMedium") || null;
    const memberSince = parseSteamMemberSince(extractSteamXmlValue(body, "memberSince"));

    return {
      personaName: normalizeSteamPersonaName(personaName, steamId64),
      avatarUrl,
      memberSince,
      profileUrl,
    };
  } catch (error) {
    console.warn("Failed to load Steam profile summary:", error);
    return null;
  }
}

function getSteamDisplayUsername(desiredUsername: string, steamId64: string) {
  return normalizeSteamPersonaName(desiredUsername, steamId64);
}

async function syncSteamProfileName(userId: string, username: string, steamId64: string, steamProfile?: SteamProfileSummary | null) {
  const supabaseAdmin = getSupabaseAdmin();
  const { error: profileError } = await supabaseAdmin
    .from("profiles")
    .update({
      username,
      avatar_url: steamProfile?.avatarUrl || undefined,
      steam_avatar_url: steamProfile?.avatarUrl || null,
      steam_member_since: steamProfile?.memberSince || null,
      steam_profile_url: steamProfile?.profileUrl || `https://steamcommunity.com/profiles/${steamId64}`,
      steam_profile_fetched_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", userId);

  if (profileError) {
    throw profileError;
  }

  const { error: userError } = await supabaseAdmin.auth.admin.updateUserById(userId, {
    user_metadata: {
      username,
      avatar_url: steamProfile?.avatarUrl || undefined,
      steam_avatar_url: steamProfile?.avatarUrl || null,
      steam_member_since: steamProfile?.memberSince || null,
      steam_profile_url: steamProfile?.profileUrl || `https://steamcommunity.com/profiles/${steamId64}`,
      steam_id64: steamId64,
      steam_verified: true,
      provider: "steam",
    },
  });

  if (userError) {
    throw userError;
  }
}

async function ensureSteamSupabaseUser(steamId64: string, steamProfile: SteamProfileSummary | null) {
  const supabaseAdmin = getSupabaseAdmin();
  const syntheticEmail = `steam_${steamId64}@steam.hustle-arena.local`;
  const steamPersonaName = steamProfile?.personaName || `${DEFAULT_STEAM_USERNAME_PREFIX}_${steamId64.slice(-8)}`;

  const { data: existingProfile, error: existingProfileError } = await supabaseAdmin
    .from("profiles")
    .select("id, email, username")
    .eq("steam_id64", steamId64)
    .maybeSingle();

  if (existingProfileError) {
    throw existingProfileError;
  }

  if (existingProfile?.id && existingProfile.email) {
    const username = getSteamDisplayUsername(steamPersonaName, steamId64);
    await syncSteamProfileName(existingProfile.id as string, username, steamId64, steamProfile);

    return {
      userId: existingProfile.id as string,
      email: existingProfile.email as string,
    };
  }

  const { data: emailProfile, error: emailProfileError } = await supabaseAdmin
    .from("profiles")
    .select("id, email, username")
    .eq("email", syntheticEmail)
    .maybeSingle();

  if (emailProfileError) {
    throw emailProfileError;
  }

  if (emailProfile?.id && emailProfile.email) {
    const username = getSteamDisplayUsername(steamPersonaName, steamId64);
    await syncSteamProfileName(emailProfile.id as string, username, steamId64, steamProfile);

    return {
      userId: emailProfile.id as string,
      email: emailProfile.email as string,
    };
  }

  const username = getSteamDisplayUsername(steamPersonaName, steamId64);
  const { data: createdUser, error: createUserError } = await supabaseAdmin.auth.admin.createUser({
    email: syntheticEmail,
    email_confirm: true,
    password: crypto.randomBytes(32).toString("base64url"),
    user_metadata: {
      username,
      avatar_url: steamProfile?.avatarUrl || null,
      steam_avatar_url: steamProfile?.avatarUrl || null,
      steam_member_since: steamProfile?.memberSince || null,
      steam_profile_url: steamProfile?.profileUrl || `https://steamcommunity.com/profiles/${steamId64}`,
      steam_id64: steamId64,
      steam_verified: true,
      provider: "steam",
    },
  });

  if (createUserError || !createdUser.user?.id || !createdUser.user.email) {
    throw createUserError || new Error("Failed to create Steam user.");
  }

  await syncSteamProfileName(createdUser.user.id, username, steamId64, steamProfile);

  return {
    userId: createdUser.user.id,
    email: createdUser.user.email,
  };
}

async function createSteamMagicLink(email: string, frontendOrigin: string) {
  const supabaseAdmin = getSupabaseAdmin();
  const { data, error } = await supabaseAdmin.auth.admin.generateLink({
    type: "magiclink",
    email,
    options: {
      redirectTo: `${frontendOrigin}/?steam_login=success`,
    },
  });

  if (error || !data.properties?.action_link) {
    throw error || new Error("Failed to create Steam login session.");
  }

  return data.properties.action_link;
}

steamRouter.post("/login/start", (req, res) => {
  const returnOrigin = getFrontendOrigin(req.body?.returnOrigin || req.headers.origin);
  const authUrl = getSteamAuthUrl(createState({ returnOrigin }));
  res.json({ authUrl });
});

steamRouter.get("/login/start", (req, res) => {
  const returnOrigin = getFrontendOrigin(req.query.returnOrigin || req.headers.referer || req.headers.origin);
  res.redirect(getSteamAuthUrl(createState({ returnOrigin })));
});

steamRouter.get("/callback", async (req, res) => {
  let frontendOrigin = getFrontendOrigin();

  try {
    const state = verifyState(req.query.state);
    frontendOrigin = getFrontendOrigin(state.returnOrigin);
    const steamId64 = await verifySteamOpenId(req.query);
    const steamProfile = await fetchSteamProfileSummary(steamId64);
    if (!steamProfile?.memberSince) {
      res.redirect(`${frontendOrigin}/?steam_login=private_age`);
      return;
    }
    if (!hasRequiredSteamAccountAge(steamProfile.memberSince)) {
      res.redirect(`${frontendOrigin}/?steam_login=ineligible`);
      return;
    }

    const steamUser = await ensureSteamSupabaseUser(steamId64, steamProfile);
    const supabaseAdmin = getSupabaseAdmin();
    const { error } = await supabaseAdmin.rpc("link_verified_steam_id64", {
      p_user_id: steamUser.userId,
      p_steam_id64: steamId64,
    });

    if (error) {
      throw error;
    }

    const actionLink = await createSteamMagicLink(steamUser.email, frontendOrigin);
    res.redirect(actionLink);
  } catch (error) {
    console.error("Steam OpenID callback failed:", error);
    res.redirect(`${frontendOrigin}/?steam_login=error`);
  }
});
