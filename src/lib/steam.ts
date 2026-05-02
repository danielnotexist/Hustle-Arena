import { appEnv } from "./env";

const CANONICAL_PRODUCTION_ORIGIN = "https://project-7y6n1.vercel.app";

function getSteamReturnOrigin() {
  const currentOrigin = window.location.origin.replace(/\/$/, "");
  if (
    window.location.hostname.endsWith(".vercel.app") &&
    currentOrigin !== CANONICAL_PRODUCTION_ORIGIN
  ) {
    return CANONICAL_PRODUCTION_ORIGIN;
  }

  return currentOrigin;
}

export function startSteamLogin() {
  if (!appEnv.apiBaseUrl) {
    throw new Error("Steam login backend is not configured.");
  }

  const loginUrl = new URL("/api/steam/login/start", appEnv.apiBaseUrl);
  loginUrl.searchParams.set("returnOrigin", getSteamReturnOrigin());
  window.location.assign(loginUrl.toString());
}
