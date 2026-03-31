import { createClient } from '@supabase/supabase-js';
import { env } from '../config/env';

export const serviceRoleClient = createClient(env.supabaseUrl, env.supabaseServiceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});
