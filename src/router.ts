// Routeur minimal par ancre (#/…) : suffisant pour une application
// monopage, compatible avec n'importe quel hébergement statique.

import { useSyncExternalStore } from 'react'

export type Route =
  | { name: 'accueil' }
  | { name: 'profil' }
  | { name: 'chasses' }
  | { name: 'proximite' }
  | { name: 'carte' }
  | { name: 'recherche'; filters: boolean }
  | { name: 'photo'; id: string }
  | { name: 'chasse'; id: string }
  | { name: 'recaler'; id: string }

export function parseHash(hash: string): Route {
  const [path, query = ''] = hash.replace(/^#/, '').split('?')
  const parts = path.split('/').filter(Boolean).map(decodeURIComponent)
  const [head, id] = parts
  switch (head) {
    case 'profil':
      return { name: 'profil' }
    case 'chasses':
      return { name: 'chasses' }
    case 'proximite':
      return { name: 'proximite' }
    case 'carte':
      return { name: 'carte' }
    case 'recherche':
      return { name: 'recherche', filters: new URLSearchParams(query).has('filtres') }
    case 'photo':
    case 'chasse':
    case 'recaler':
      return id ? { name: head, id } : { name: 'accueil' }
    default:
      return { name: 'accueil' }
  }
}

function subscribe(onChange: () => void) {
  window.addEventListener('hashchange', onChange)
  return () => window.removeEventListener('hashchange', onChange)
}

let cachedHash: string | null = null
let cachedRoute: Route = { name: 'accueil' }

function snapshot(): Route {
  if (location.hash !== cachedHash) {
    cachedHash = location.hash
    cachedRoute = parseHash(location.hash)
  }
  return cachedRoute
}

export function useRoute(): Route {
  return useSyncExternalStore(subscribe, snapshot, () => cachedRoute)
}

// Profondeur de navigation interne : permet un « retour » qui ne sort
// jamais de l'application (lien direct, rechargement…).
let depth = 0

export function navigate(path: string, { replace = false } = {}) {
  const hash = `#${path}`
  if (replace) {
    history.replaceState(null, '', hash)
    window.dispatchEvent(new HashChangeEvent('hashchange'))
  } else {
    depth++
    location.hash = hash
  }
}

export function goBack() {
  if (depth > 0) {
    depth--
    history.back()
  } else {
    navigate('/', { replace: true })
  }
}
