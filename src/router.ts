// Routeur minimal par ancre (#/…) : suffisant pour une application
// monopage, compatible avec n'importe quel hébergement statique.

import { useEffect, useRef, useSyncExternalStore } from 'react'

export type Route =
  | { name: 'accueil' }
  | { name: 'profil' }
  /** Onglet Amis de la barre (0.23.1) : notifications, puis amis ; anciennes adresses `#/profil/amis`, `#/notifications`. */
  | { name: 'amis' }
  /** Onglet Mes photos de la barre (0.23.1). */
  | { name: 'photos' }
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
  /** Viseur avec la photo à reproduire en calque. */
  | { name: 'reproduire'; id: string }
  /** Profil public d'un utilisateur. */
  | { name: 'personne'; id: string }
  /** Tutoriel du premier lancement, revu depuis le menu. */
  | { name: 'tutoriel' }
  /** Paramètres (depuis Mon profil › ⚙️). */
  | { name: 'parametres' }

export function parseHash(hash: string): Route {
  const [path, query = ''] = hash.replace(/^#/, '').split('?')
  const parts = path.split('/').filter(Boolean).map(decodeURIComponent)
  const [head, id, sub] = parts
  switch (head) {
    case 'profil':
      return id === 'amis' ? { name: 'amis' } : { name: 'profil' }
    case 'amis':
    case 'notifications':
      return { name: 'amis' }
    case 'photos':
      return { name: 'photos' }
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
    case 'tutoriel':
      return { name: 'tutoriel' }
    case 'parametres':
      return { name: 'parametres' }
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
// jamais de l'application (lien direct, rechargement…). Chaque entrée de l'historique
// garde la sienne (`pictiDepth`) : un retour fait sans `goBack` (bouton du navigateur,
// glissement depuis le bord gauche dans l'app iOS) la remet d'accord.
let depth = 0

const depthOf = (state: unknown) => (state as { pictiDepth?: number } | null)?.pictiDepth ?? 0
/** Vrai pendant `location.hash = …` : un `popstate` émis à ce moment ne dit rien de la profondeur. */
let navigating = false

/**
 * Comment on est arrivé sur l'écran affiché : `push` (en avançant), `replace`, `back` (flèche retour de
 * l'app, `goBack`) ou `pop` (retour du système : geste d'iOS, bouton du navigateur ou d'Android — iOS a
 * déjà fait glisser les écrans, rien à rejouer).
 */
export type NavigationKind = 'push' | 'replace' | 'back' | 'pop'
let lastNavigation: NavigationKind = 'push'
/** `goBack` en cours : le `popstate` qui suit est un retour de l'app, pas du système. */
let backFromApp = false

export function navigationKind(): NavigationKind {
  return lastNavigation
}

/** Profondeur de l'entrée courante de l'historique (pile des écrans gardés montés, `screenStack.ts`). */
export function currentDepth(): number {
  return depth
}

/** Note la profondeur (et `mark`) dans l'entrée courante de l'historique. */
function markDepth(mark?: Record<string, unknown>) {
  history.replaceState({ ...(history.state as object | null), ...mark, pictiDepth: depth }, '')
}

/**
 * Va à `path` (ancre). `replace` : remplace l'entrée courante au lieu d'en ajouter une ;
 * `mark` : drapeaux gardés dans l'entrée de l'historique (relus par `historyMark`).
 */
export function navigate(path: string, { replace = false, mark }: { replace?: boolean; mark?: Record<string, unknown> } = {}) {
  const hash = `#${path}`
  if (replace) {
    lastNavigation = 'replace'
    history.replaceState({ ...mark, pictiDepth: depth }, '', hash)
    window.dispatchEvent(new HashChangeEvent('hashchange'))
  } else {
    lastNavigation = 'push'
    depth++
    navigating = true
    location.hash = hash
    navigating = false
    markDepth(mark)
  }
}

/** Drapeau `key` posé par `navigate(…, { mark })` sur l'entrée courante de l'historique. */
export function historyMark(key: string): unknown {
  return (history.state as Record<string, unknown> | null)?.[key]
}

export function goBack() {
  if (depth > 0) {
    depth--
    backFromApp = true
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
      overlays[i].close()
    }
    // Profondeur de l'entrée retrouvée, quel que soit le chemin du retour.
    if (!navigating) {
      depth = depthOf(history.state)
      lastNavigation = backFromApp ? 'back' : 'pop'
    }
    backFromApp = false
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
      history.pushState({ ...(history.state as object | null), pictiOverlay: n, pictiDepth: depth }, '')
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
