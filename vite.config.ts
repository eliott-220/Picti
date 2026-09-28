import basicSsl from '@vitejs/plugin-basic-ssl'
import react from '@vitejs/plugin-react'
import type { Plugin } from 'vite'
import { defineConfig } from 'vitest/config'

// Identifiant de la version construite : commit déployé par Vercel, sinon date du build.
const APP_VERSION = process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? new Date().toISOString()

/** Publie `version.json` : l'app le consulte pour savoir si une mise à jour est en ligne. */
function versionFile(): Plugin {
  return {
    name: 'picti-version',
    generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: 'version.json',
        source: JSON.stringify({ version: APP_VERSION, builtAt: new Date().toISOString() }),
      })
    },
  }
}

// `npm run dev:https` sert l'app en HTTPS sur le réseau local :
// caméra, GPS et boussole ne sont accessibles qu'en contexte sécurisé.
export default defineConfig(({ mode }) => ({
  plugins: [react(), versionFile(), ...(mode === 'https' ? [basicSsl()] : [])],
  define: {
    __APP_VERSION__: JSON.stringify(APP_VERSION),
    __APP_BUILT_AT__: JSON.stringify(new Date().toISOString()),
  },
  // Processus de fond de MapLibre (module ES).
  worker: { format: 'es' },
  test: {
    include: ['src/**/*.test.ts'],
  },
}))
