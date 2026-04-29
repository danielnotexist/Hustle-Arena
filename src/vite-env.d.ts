/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string
  readonly VITE_SUPABASE_ANON_KEY: string
  readonly VITE_API_BASE_URL: string
  readonly VITE_PLATFORM_HOT_WALLET_ADDRESS: string
  readonly VITE_PLATFORM_HOT_WALLET_NETWORK: string
  readonly GEMINI_API_KEY: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
