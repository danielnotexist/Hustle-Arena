import { isSupabaseConfigured } from "../lib/env";
import type { PlatformSessionState } from "./types";
import { useLegacyFirebaseSession } from "./use-legacy-firebase-session";
import { useSupabaseSession } from "./use-supabase-session";

export function usePlatformSession(): PlatformSessionState {
  const shouldUseSupabase = isSupabaseConfigured();
  const legacySession = useLegacyFirebaseSession(!shouldUseSupabase);
  const supabaseSession = useSupabaseSession(shouldUseSupabase);

  if (shouldUseSupabase) {
    return supabaseSession;
  }

  return legacySession;
}
