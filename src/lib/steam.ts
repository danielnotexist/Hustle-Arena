import { appEnv } from "./env";

export function startSteamLogin() {
  if (!appEnv.apiBaseUrl) {
    throw new Error("Steam login backend is not configured.");
  }

  const loginUrl = new URL("/api/steam/login/start", appEnv.apiBaseUrl);
  loginUrl.searchParams.set("returnOrigin", window.location.origin);
  window.location.assign(loginUrl.toString());
}
