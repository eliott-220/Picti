import { useSyncExternalStore } from 'react'
import type { Visibility } from './types'

// Visibilité de la prochaine photo (pastille du viseur, feuille d'import). Elle part du réglage
// du profil ; un choix fait avec la pastille tient jusqu'à la fermeture de l'app, sans devenir
// le nouveau réglage.
let sessionChoice: Visibility | null = null
const listeners = new Set<() => void>()

function subscribe(onChange: () => void) {
  listeners.add(onChange)
  return () => {
    listeners.delete(onChange)
  }
}

/** Choix de la session ; `null` : revenir au réglage du profil. */
export function setShotVisibility(v: Visibility | null): void {
  sessionChoice = v
  listeners.forEach((l) => l())
}

export function useShotVisibility(profileDefault: Visibility): Visibility {
  const choice = useSyncExternalStore(subscribe, () => sessionChoice)
  return choice ?? profileDefault
}
