// Routeur minimal par ancre (#/…) : suffisant pour une application
// monopage, compatible avec n'importe quel hébergement statique.

import { useEffect, useRef, useSyncExternalStore } from 'react'

export type Route =
  | { name: 'accueil' }
  /** `#/profil/amis` : directement sur « Mes amis ». */
  | { name: 'profil'; section?: 'amis' }
  | { name: 'chasses' }
  | { name: 'proximite' }
  | { name: 'carte' }
  | { name: 'recherche'; filters: boolean }
  /** Fiche d'une photo ; `#/photo/<id>/fil` : directement sur « Au fil du temps ». */
  | { name: 'photo'; id: string; section?: 'fil' }
  | { name: 'chasse'; id: string }
  | { name: 'recaler'; id: string }
  /** Lien d'invitation : `#/ami/<code ami>`. */
  | { name: 'ami'; code: string }
  /** Galerie de toutes les photos du lieu d'une photo. */
  | { name: 'galerie'; id: string }
  | { name: 'notifications' }
  /** Viseur avec la photo à reproduire en calque. */
  | { name: 'reproduire'; id: string }
  /** Profil public d'un utilisateur. */
  | { name: 'personne'; id: string }

export function parseHash(hash: string): Route {
  const [path, query = ''] = hash.replace(/^#/, '').split('?')
  const parts = path.split('/').filter(Boolean).map(decodeURIComponent)
  const [head, id, sub] = parts
  switch (head) {
    case 'profil':
      return id === 'amis' ? { name: 'profil', section: 'amis' } : { name: 'profil' }
    case 'chasses':
      return { name: 'chasses' }
    case 'proximite':
      return { name: 'proximite' }
    case 'carte':
      return { name: 'carte' }
    case 'recherche':
      return { name: 'recherche', filters: new URLSearchParams(query).has('filtres') }
    case 'photo':
      if (!id) return { name: 'accueil' }
      return sub === 'fil' ? { name: 'photo', id, section: 'fil' } : { name: 'photo', id }
    case 'chasse':
    case 'recaler':
    case 'galerie':
    case 'reproduire':
    case 'personne':
      return id ? { name: head, id } : { name: 'accueil' }
    case 'notifications':
      return { name: 'notifications' }
    case 'ami':
      return id ? { name: 'ami', code: id } : { name: 'accueil' }
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

// ---------- Feuilles et fenêtres par-dessus un écran ----------
// Une feuille ouverte (fiche après une capture, avant / après…) ajoute une entrée à l'historique
// sans changer d'adresse : le bouton retour du téléphone ou du navigateur la ferme avant de
// quitter l'écran. Chaque entrée porte son numéro ; au retour, les feuilles plus récentes que
// l'entrée retrouvée se ferment.

interface Overlay {
  n: number
  close: () => void
  popped: boolean
}

const overlays: Overlay[] = []
let overlayCount = 0
/** Feuille qui vient de se démonter : son entrée est reprise si elle se remonte aussitôt (StrictMode). */
let releasing: { n: number; timer: ReturnType<typeof setTimeout> } | null = null

const overlayOf = (state: unknown) => (state as { pictiOverlay?: number } | null)?.pictiOverlay ?? 0

if (typeof window !== 'undefined') {
  window.addEventListener('popstate', () => {
    const level = overlayOf(history.state)
    for (let i = overlays.length - 1; i >= 0 && overlays[i].n > level; i--) {
      overlays[i].popped = true
      depth = Math.max(0, depth - 1)
      overlays[i].close()
    }
  })
}

/** À appeler dans une feuille : tant qu'elle est affichée, « retour » appelle `onClose`. */
export function useBackCloses(onClose: () => void) {
  const closeRef = useRef(onClose)
  useEffect(() => {
    closeRef.current = onClose
  })
  useEffect(() => {
    let n: number
    if (releasing && overlayOf(history.state) === releasing.n) {
      clearTimeout(releasing.timer)
      n = releasing.n
      releasing = null
    } else {
      n = ++overlayCount
      depth++
      history.pushState({ ...(history.state as object | null), pictiOverlay: n }, '')
    }
    const overlay: Overlay = { n, close: () => closeRef.current(), popped: false }
    overlays.push(overlay)
    return () => {
      overlays.splice(overlays.indexOf(overlay), 1)
      // Fermée par « retour », ou un autre écran s'est ouvert par-dessus : rien à retirer.
      if (overlay.popped || overlayOf(history.state) !== n) return
      // Fermée depuis l'écran (✕, glissement) : son entrée quitte l'historique.
      releasing = {
        n,
        timer: setTimeout(() => {
          releasing = null
          if (overlayOf(history.state) !== n) return
          depth = Math.max(0, depth - 1)
          history.back()
        }, 0),
      }
    }
  }, [])
}
