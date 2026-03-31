import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || ''
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || ''

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('❌ Supabase environment variables are MISSING! Check your Vercel Environment Variables (Environment: Preview). Variables must start with VITE_.')
}

// Log for debugging (safe because it's public anon key anyway, but url is also useful)
console.log('Supabase Initialized with URL:', supabaseUrl ? 'OK' : 'MISSING')

export const supabase = createClient(
  supabaseUrl,
  supabaseAnonKey
)
