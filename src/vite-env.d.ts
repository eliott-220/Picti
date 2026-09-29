/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string
  readonly VITE_SUPABASE_KEY?: string
}

/** Version de l'app (commit déployé ou date du build), injectée par Vite. */
declare const __APP_VERSION__: string
declare const __APP_BUILT_AT__: string
/** Numéro de version (package.json, ex. « 0.8.1 »), affiché sous la forme x.xxx.x. */
declare const __APP_NUMBER__: string
