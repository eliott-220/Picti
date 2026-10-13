// Pile des écrans (0.23.1) : l'écran qu'on quitte en avançant reste monté, caché sous le nouveau ;
// au retour (flèche, geste d'iOS, bouton du navigateur), il réapparaît tel quel, tout de suite — plus
// d'écran blanc le temps de tout recharger. Une entrée par niveau de l'historique (`pictiDepth`).
// Passage d'un écran à l'autre (0.23.3) : le nouveau pousse l'ancien (`slotTransition`), sauf vers ou
// depuis l'accueil.

import { createContext, useCallback, useContext, useState } from 'react'
import { currentDepth, navigationKind, parseHash, type NavigationKind, type Route } from './router'

/** Écrans de la barre du bas : un seul `Home` (viseur, carte, amis, mes photos, profil) qui reste monté. */
export const SHELL_ROUTES: ReadonlySet<Route['name']> = new Set(['accueil', 'carte', 'amis', 'photos', 'profil'])
/** Écrans gardés montés au plus (le plus ancien est démonté au-delà, et rechargé si on y revient). */
export const MAX_SCREENS = 5

export interface StackEntry {
  depth: number
  hash: string
}

/** Écran à afficher : sa clé React (stable tant que c'est le même écran), sa route, et l'entrée du dessus. */
export interface ScreenSlot {
  key: string
  route: Route
}

/**
 * Pile après être arrivé sur `hash` au niveau `depth` : les entrées des niveaux inférieurs restent, celles
 * du même niveau ou au-dessus (écran remplacé, ou quitté par un retour) partent.
 */
export function nextStack(stack: readonly StackEntry[], depth: number, hash: string, max = MAX_SCREENS): StackEntry[] {
  const kept = stack.filter((e) => e.depth < depth)
  return [...kept, { depth, hash }].slice(-max)
}

/**
 * Écrans à rendre, du plus ancien au plus récent : les entrées consécutives de la barre du bas n'en font
 * qu'un (le même `Home`, sa clé ne change pas quand on passe du viseur à la carte ou au profil).
 */
export function slotsOf(stack: readonly StackEntry[]): ScreenSlot[] {
  const slots: ScreenSlot[] = []
  let shellKey: string | null = null
  for (const e of stack) {
    const route = parseHash(e.hash)
    if (SHELL_ROUTES.has(route.name)) {
      const last = slots.at(-1)
      if (last && shellKey && last.key === shellKey) {
        last.route = route
        continue
      }
      shellKey = `shell:${e.depth}`
      slots.push({ key: shellKey, route })
    } else {
      shellKey = null
      slots.push({ key: `${e.depth}:${e.hash}`, route })
    }
  }
  return slots
}

/**
 * Passage d'un écran de la pile à un autre (0.23.3) : le nouveau (`incoming`) pousse l'ancien
 * (`outgoing`), les deux glissent ensemble — en avançant (ou en remplaçant) le nouveau arrive par la
 * droite, au retour par la flèche de l'app il revient par la gauche et l'ancien repart à droite.
 */
export interface SlotTransition {
  id: number
  motion: 'forward' | 'back'
  /** Clé de l'écran qui arrive (en haut de la pile). */
  incoming: string
  /** Écran qui part, gardé à l'écran le temps du passage. */
  outgoing: ScreenSlot
  /** Vrai s'il a déjà quitté la pile (retour, remplacement) : rendu en plus, puis démonté. */
  ghost: boolean
}

/**
 * Passage entre les écrans du haut de `prev` et de `next`, ou null quand rien ne glisse : même écran (les
 * onglets de la barre glissent entre eux dans `Home`), vers l'accueil ou depuis lui (inchangé : la page
 * passe par-dessus le viseur), retour du système (`pop` : le geste d'iOS a déjà fait glisser les écrans).
 */
export function slotTransition(
  prev: readonly ScreenSlot[],
  next: readonly ScreenSlot[],
  kind: NavigationKind,
): Omit<SlotTransition, 'id'> | null {
  const from = prev.at(-1)
  const to = next.at(-1)
  if (!from || !to || from.key === to.key || kind === 'pop') return null
  if (from.route.name === 'accueil' || to.route.name === 'accueil') return null
  return {
    motion: kind === 'back' ? 'back' : 'forward',
    incoming: to.key,
    outgoing: from,
    ghost: !next.some((s) => s.key === from.key),
  }
}

let lastTransition = 0

/**
 * Pile des écrans, tenue à jour à chaque changement d'adresse (`route` vient de `useRoute`) ; `slots`
 * comprend, le temps du passage, l'écran qui vient de quitter la pile ; `endTransition` : passage fini.
 */
export function useScreenStack(route: Route): {
  slots: ScreenSlot[]
  transition: SlotTransition | null
  endTransition: (id: number) => void
} {
  const [state, setState] = useState(() => ({
    route,
    stack: nextStack([], currentDepth(), location.hash),
    transition: null as SlotTransition | null,
  }))
  // Nouvelle adresse : la pile suit pendant le même rendu (pas d'image intermédiaire).
  if (state.route !== route) {
    const stack = nextStack(state.stack, currentDepth(), location.hash)
    const t = slotTransition(slotsOf(state.stack), slotsOf(stack), navigationKind())
    setState({ route, stack, transition: t && { ...t, id: ++lastTransition } })
  }
  const endTransition = useCallback(
    (id: number) => setState((s) => (s.transition?.id === id ? { ...s, transition: null } : s)),
    [],
  )
  const slots = slotsOf(state.stack)
  const t = state.transition
  if (t?.ghost && !slots.some((s) => s.key === t.outgoing.key)) slots.push(t.outgoing)
  return { slots, transition: t, endTransition }
}

/** Faux quand l'écran est caché sous un autre de la pile : caméra en pause, barre d'état laissée au-dessus. */
export const ScreenActiveContext = createContext(true)

export function useScreenActive(): boolean {
  return useContext(ScreenActiveContext)
}
