import basicSsl from '@vitejs/plugin-basic-ssl'
import react from '@vitejs/plugin-react'
import type { Plugin } from 'vite'
import { defineConfig } from 'vitest/config'

// Identifiant unique de chaque build : embarqué dans l'app et publié dans `/version.json`.
// L'app compare les deux pour savoir qu'une nouvelle version est en ligne (voir `src/update.ts`).
const BUILD_ID = new Date().toISOString()

function versionFile(): Plugin {
  return {
    name: 'picti-version',
    apply: 'build',
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'version.json', source: JSON.stringify({ version: BUILD_ID }) })
    },
  }
}

// `npm run dev:https` sert l'app en HTTPS sur le réseau local :
// caméra, GPS et boussole ne sont accessibles qu'en contexte sécurisé.
export default defineConfig(({ mode }) => ({
  plugins: [react(), versionFile(), ...(mode === 'https' ? [basicSsl()] : [])],
  define: {
    __BUILD_ID__: JSON.stringify(BUILD_ID),
  },
  test: {
    include: ['src/**/*.test.ts'],
  },
}))
