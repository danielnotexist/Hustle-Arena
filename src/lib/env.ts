const env = import.meta.env;

export const appEnv = {
  supabaseUrl: env.VITE_SUPABASE_URL?.trim() || "",
  supabaseAnonKey: env.VITE_SUPABASE_ANON_KEY?.trim() || "",
  apiBaseUrl: env.VITE_API_BASE_URL?.trim().replace(/\/$/, "") || "",
  railwayHotPathsEnabled: env.VITE_ENABLE_RAILWAY_HOT_PATHS?.trim() === "true",
  railwayNotificationsEnabled: env.VITE_ENABLE_RAILWAY_NOTIFICATIONS?.trim() !== "false",
  platformHotWalletAddress: env.VITE_PLATFORM_HOT_WALLET_ADDRESS?.trim() || "",
  platformHotWalletNetwork: env.VITE_PLATFORM_HOT_WALLET_NETWORK?.trim() || "BEP20",
};

export function isSupabaseConfigured() {
  return Boolean(appEnv.supabaseUrl && appEnv.supabaseAnonKey);
}
