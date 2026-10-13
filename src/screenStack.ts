// Pile des écrans (0.23.1) : l'écran qu'on quitte en avançant reste monté, caché sous le nouveau ;
// au retour (flèche, geste d'iOS, bouton du navigateur), il réapparaît tel quel, tout de suite — plus
// d'écran blanc le temps de tout recharger. Une entrée par niveau de l'historique (`pictiDepth`).

import { createContext, useContext, useState } from 'react'
import { currentDepth, parseHash, type Route } from './router'

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

/** Pile des écrans, tenue à jour à chaque changement d'adresse (`route` vient de `useRoute`). */
export function useScreenStack(route: Route): ScreenSlot[] {
  const [state, setState] = useState(() => ({ route, stack: nextStack([], currentDepth(), location.hash) }))
  // Nouvelle adresse : la pile suit pendant le même rendu (pas d'image intermédiaire).
  if (state.route !== route) setState({ route, stack: nextStack(state.stack, currentDepth(), location.hash) })
  return slotsOf(state.stack)
}

/** Faux quand l'écran est caché sous un autre de la pile : caméra en pause, barre d'état laissée au-dessus. */
export const ScreenActiveContext = createContext(true)

export function useScreenActive(): boolean {
  return useContext(ScreenActiveContext)
}
