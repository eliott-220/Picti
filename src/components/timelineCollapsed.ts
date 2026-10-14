import { useSyncExternalStore } from 'react'

// Frise du viseur réduite en vignette (0.24.2) : choix gardé tant qu'on ne l'a pas rouverte, d'un écran à
// l'autre (le viseur se démonte sous le menu, la carte, en Reproduire…), jusqu'à la fermeture de l'app ; au
// prochain lancement, la frise repart dépliée (rien n'est enregistré).
let collapsed = false
const listeners = new Set<() => void>()

export function setTimelineCollapsed(value: boolean): void {
  if (value === collapsed) return
  collapsed = value
  listeners.forEach((l) => l())
}

export function useTimelineCollapsed(): boolean {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => collapsed,
  )
}
