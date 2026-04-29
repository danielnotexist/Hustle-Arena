import dotenv from "dotenv";

dotenv.config();

function readEnv(name: string, fallback = "") {
  return process.env[name]?.trim() || fallback;
}

function readRequiredEnv(name: string) {
  const value = readEnv(name);
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export const backendConfig = {
  nodeEnv: readEnv("NODE_ENV", "development"),
  port: Number(readEnv("PORT", "3001")),
  frontendOrigin: readEnv("FRONTEND_ORIGIN", "http://localhost:5173"),
  supabaseUrl: readRequiredEnv("SUPABASE_URL"),
  supabaseAnonKey: readRequiredEnv("SUPABASE_ANON_KEY"),
  supabaseServiceRoleKey: readRequiredEnv("SUPABASE_SERVICE_ROLE_KEY"),
};

export const isProduction = backendConfig.nodeEnv === "production";
