import dotenv from "dotenv";

dotenv.config();

function readEnv(name: string, fallback = "") {
  return process.env[name]?.trim() || fallback;
}

export const backendConfig = {
  nodeEnv: readEnv("NODE_ENV", "development"),
  port: Number(readEnv("PORT", "3001")),
  frontendOrigin: readEnv("FRONTEND_ORIGIN", "http://localhost:5173"),
  backendPublicUrl: readEnv("BACKEND_PUBLIC_URL", readEnv("RAILWAY_PUBLIC_DOMAIN") ? `https://${readEnv("RAILWAY_PUBLIC_DOMAIN")}` : "http://localhost:3001").replace(/\/$/, ""),
  steamOpenIdStateSecret: readEnv("STEAM_OPENID_STATE_SECRET"),
  supabaseUrl: readEnv("SUPABASE_URL"),
  supabaseAnonKey: readEnv("SUPABASE_ANON_KEY"),
  supabaseServiceRoleKey: readEnv("SUPABASE_SERVICE_ROLE_KEY"),
};

export const isProduction = backendConfig.nodeEnv === "production";

export function getMissingSupabaseEnv() {
  return [
    ["SUPABASE_URL", backendConfig.supabaseUrl],
    ["SUPABASE_ANON_KEY", backendConfig.supabaseAnonKey],
    ["SUPABASE_SERVICE_ROLE_KEY", backendConfig.supabaseServiceRoleKey],
  ]
    .filter(([, value]) => !value)
    .map(([name]) => name);
}
