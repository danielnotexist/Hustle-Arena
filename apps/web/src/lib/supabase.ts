import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || import.meta.env.NEXT_PUBLIC_SUPABASE_URL || ''
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || import.meta.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('❌ Supabase environment variables are MISSING! For Vite, they should start with VITE_ (e.g., VITE_SUPABASE_URL).')
}

// Use a placeholder if missing to prevent the app from crashing (white screen)
const finalUrl = supabaseUrl || 'https://placeholder.supabase.co'
const finalKey = supabaseAnonKey || 'placeholder'

export const supabase = createClient(finalUrl, finalKey)
