import basicSsl from '@vitejs/plugin-basic-ssl'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

// `npm run dev:https` sert l'app en HTTPS sur le réseau local :
// caméra, GPS et boussole ne sont accessibles qu'en contexte sécurisé.
export default defineConfig(({ mode }) => ({
  plugins: [react(), ...(mode === 'https' ? [basicSsl()] : [])],
  test: {
    include: ['src/**/*.test.ts'],
  },
}))
