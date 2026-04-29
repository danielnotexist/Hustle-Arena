import { createClient } from "@supabase/supabase-js";
import { backendConfig, getMissingSupabaseEnv } from "./config";

function assertSupabaseConfigured() {
  const missing = getMissingSupabaseEnv();
  if (missing.length) {
    throw new Error(`Missing Supabase backend environment variables: ${missing.join(", ")}`);
  }
}

const clientOptions = {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
};

export function getSupabaseAnon() {
  assertSupabaseConfigured();
  return createClient(backendConfig.supabaseUrl, backendConfig.supabaseAnonKey, clientOptions);
}

export function getSupabaseForBearerToken(token: string) {
  assertSupabaseConfigured();
  return createClient(backendConfig.supabaseUrl, backendConfig.supabaseAnonKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
    global: {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    },
  });
}

export function getSupabaseAdmin() {
  assertSupabaseConfigured();
  return createClient(backendConfig.supabaseUrl, backendConfig.supabaseServiceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
