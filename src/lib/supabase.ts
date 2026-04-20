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

export function isSupabaseTransientNetworkError(error: unknown) {
  const message = String((error as { message?: string } | null)?.message || '');
  const details = String((error as { details?: string } | null)?.details || '');
  const code = String((error as { code?: string | number } | null)?.code || '');

  return (
    message.includes('NetworkError when attempting to fetch resource') ||
    message.includes('Failed to fetch') ||
    message.includes('Load failed') ||
    details.includes('NetworkError when attempting to fetch resource') ||
    code === '502'
  );
}

export function isSupabaseMissingRowError(error: unknown) {
  const code = String((error as { code?: string | number } | null)?.code || "");
  const message = String((error as { message?: string } | null)?.message || "");
  const details = String((error as { details?: string } | null)?.details || "");
  const combined = `${message} ${details}`;

  return (
    code === "PGRST116" ||
    combined.includes("JSON object requested, multiple (or no) rows returned") ||
    combined.includes("The result contains 0 rows")
  );
}
