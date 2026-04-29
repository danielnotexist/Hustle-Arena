import { appEnv } from "./env";
import { supabase } from "./supabase";

function buildUrl(path: string) {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return appEnv.apiBaseUrl ? `${appEnv.apiBaseUrl}${normalizedPath}` : normalizedPath;
}

export async function platformFetch(path: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers);

  if (!headers.has("Content-Type") && init.body) {
    headers.set("Content-Type", "application/json");
  }

  if (appEnv.apiBaseUrl) {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;

    if (token && !headers.has("Authorization")) {
      headers.set("Authorization", `Bearer ${token}`);
    }
  }

  return fetch(buildUrl(path), {
    ...init,
    headers,
  });
}

export async function hasPlatformApiSession() {
  if (!appEnv.apiBaseUrl || !appEnv.railwayHotPathsEnabled) {
    return false;
  }

  const { data } = await supabase.auth.getSession();
  return Boolean(data.session?.access_token);
}

export async function hasPlatformNotificationsSession() {
  if (!appEnv.apiBaseUrl || !appEnv.railwayNotificationsEnabled) {
    return false;
  }

  const { data } = await supabase.auth.getSession();
  return Boolean(data.session?.access_token);
}
