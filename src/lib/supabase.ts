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

export function isSupabaseInvalidRefreshTokenError(error: unknown) {
  const message = String((error as { message?: string } | null)?.message || '');
  const details = String((error as { details?: string } | null)?.details || '');
  const hint = String((error as { hint?: string } | null)?.hint || '');
  const code = String((error as { code?: string | number } | null)?.code || '');
  const combined = `${message} ${details} ${hint}`.toLowerCase();

  return (
    combined.includes('invalid refresh token') ||
    combined.includes('refresh token not found') ||
    code.toLowerCase().includes('refresh')
  );
}

export async function clearSupabaseLocalSession() {
  try {
    await supabase.auth.signOut({ scope: 'local' });
  } catch {
    // Ignore cleanup failures here; the caller is already handling a broken local session.
  }
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
