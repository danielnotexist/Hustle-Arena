import { createClient } from "@supabase/supabase-js";
import { backendConfig } from "./config";

export const supabaseAnon = createClient(
  backendConfig.supabaseUrl,
  backendConfig.supabaseAnonKey,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  }
);

export const supabaseAdmin = createClient(
  backendConfig.supabaseUrl,
  backendConfig.supabaseServiceRoleKey,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  }
);
