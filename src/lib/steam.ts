import { platformFetch } from "./api";

export async function startSteamLogin() {
  const response = await platformFetch("/api/steam/login/start", {
    method: "POST",
  });
  const payload = await response.json().catch(() => ({}));

  if (!response.ok || !payload?.authUrl) {
    throw new Error(payload?.error || "Failed to start Steam login.");
  }

  window.location.assign(payload.authUrl);
}
