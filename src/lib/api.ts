import { appEnv } from "./env";
import { supabase } from "./supabase";

type PlatformFetchInit = RequestInit & {
  skipAuth?: boolean;
};

function buildUrl(path: string) {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return appEnv.apiBaseUrl ? `${appEnv.apiBaseUrl}${normalizedPath}` : normalizedPath;
}

export async function platformFetch(path: string, init: PlatformFetchInit = {}) {
  const { skipAuth = false, ...requestInit } = init;
  const headers = new Headers(init.headers);

  if (!headers.has("Content-Type") && requestInit.body) {
    headers.set("Content-Type", "application/json");
  }

  if (appEnv.apiBaseUrl && !skipAuth) {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;

    if (token && !headers.has("Authorization")) {
      headers.set("Authorization", `Bearer ${token}`);
    }
  }

  return fetch(buildUrl(path), {
    ...requestInit,
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
