import { useSyncExternalStore } from 'react'
import { VISIBILITIES, type Visibility } from './types'

// Visibilité des prochaines photos (déclencheur du viseur, feuille d'import, profil). Public à la
// première ouverture de l'app ; dès que l'utilisateur change de mode, où que ce soit, son choix
// est gardé d'une ouverture à l'autre (sur cet appareil).
export const FIRST_VISIBILITY: Visibility = 'public'

const KEY = 'picti.visibilite'
// Astuce « restez appuyé sur le déclencheur » : quelques fois, tant qu'on n'a jamais changé de mode.
const HINT_KEY = 'picti.astuce.visibilite'
const HINT_TIMES = 3

function isVisibility(v: unknown): v is Visibility {
  return VISIBILITIES.includes(v as Visibility)
}

function readChoice(): Visibility | null {
  try {
    const v = localStorage.getItem(KEY)
    return isVisibility(v) ? v : null
  } catch {
    return null
  }
}

let choice: Visibility | null = readChoice()
const listeners = new Set<() => void>()

function subscribe(onChange: () => void) {
  listeners.add(onChange)
  return () => {
    listeners.delete(onChange)
  }
}

/** Visibilité des prochaines photos, hors React. */
export function getShotVisibility(): Visibility {
  return choice ?? FIRST_VISIBILITY
}

/** Nouveau mode : il vaut pour les photos suivantes et reste gardé à la prochaine ouverture. */
export function setShotVisibility(v: Visibility): void {
  choice = v
  try {
    localStorage.setItem(KEY, v)
  } catch {
    // Stockage indisponible (navigation privée) : le choix tient jusqu'à la fermeture de l'app.
  }
  listeners.forEach((l) => l())
}

export function useShotVisibility(): Visibility {
  return useSyncExternalStore(subscribe, getShotVisibility)
}

/**
 * Faut-il rappeler, après une photo, qu'un appui long sur le déclencheur change de mode ? Oui les
 * `HINT_TIMES` premières fois, tant que l'utilisateur n'a jamais changé de mode. Chaque appel compte.
 */
export function takeVisibilityHint(): boolean {
  if (choice) return false
  try {
    const shown = Number(localStorage.getItem(HINT_KEY)) || 0
    if (shown >= HINT_TIMES) return false
    localStorage.setItem(HINT_KEY, String(shown + 1))
    return true
  } catch {
    return false
  }
}
