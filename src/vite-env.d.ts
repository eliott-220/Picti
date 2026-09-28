/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string
  readonly VITE_SUPABASE_KEY?: string
}

/** Date ISO du build (injectée par `vite.config.ts`). */
declare const __BUILD_ID__: string
