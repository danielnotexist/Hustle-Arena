import { createClient } from '@supabase/supabase-js';
import { appEnv, isSupabaseConfigured } from './env';

if (!isSupabaseConfigured()) {
  console.warn('Supabase URL or Anon Key is missing. Please check your environment variables.');
}

export const supabase = createClient(
  appEnv.supabaseUrl || 'https://placeholder.supabase.co',
  appEnv.supabaseAnonKey || 'placeholder',
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  }
);

export function isSupabaseAbortError(error: unknown) {
  const message = String((error as { message?: string } | null)?.message || '');
  const details = String((error as { details?: string } | null)?.details || '');
  const hint = String((error as { hint?: string } | null)?.hint || '');

  return (
    message.includes('AbortError') ||
    message.includes('The operation was aborted') ||
    message.includes('Request was aborted') ||
    details.includes('Request was aborted') ||
    hint.includes('Request was aborted')
  );
}
