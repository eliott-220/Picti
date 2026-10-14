import { useSyncExternalStore } from 'react'
import { WARM_COLD } from '../geo/warmCold'

// Cible du chaud / froid (0.24.0) : la photo choisie — chasse en cours (« Retrouver » / « Capturer »), « Y aller »
// d'une photo à recaler —, gardée le temps de la visite ; et les photos ignorées d'un appui sur la croix,
// pendant une heure (gardées sur l'appareil).

const IGNORED_KEY = 'picti.guidage.ignorees'

function readIgnored(): Record<string, number> {
  try {
    const raw = JSON.parse(localStorage.getItem(IGNORED_KEY) ?? '{}') as unknown
    if (!raw || typeof raw !== 'object') return {}
    const now = Date.now()
    return Object.fromEntries(Object.entries(raw).filter(([, until]) => typeof until === 'number' && until > now))
  } catch {
    return {}
  }
}

export interface GuideChoice {
  chosen: string | null
  ignored: Readonly<Record<string, number>>
}

let choice: GuideChoice = { chosen: null, ignored: readIgnored() }
const listeners = new Set<() => void>()

function publish(next: GuideChoice) {
  if (next.ignored !== choice.ignored)
    try {
      localStorage.setItem(IGNORED_KEY, JSON.stringify(next.ignored))
    } catch {
      // Stockage refusé : vaut pour cette visite.
    }
  choice = next
  listeners.forEach((l) => l())
}

/** Guider vers cette photo (chasse, « Y aller ») ; elle n'est plus ignorée. */
export function chooseGuideTarget(id: string): void {
  if (choice.chosen === id && !(id in choice.ignored)) return
  const ignored = { ...choice.ignored }
  delete ignored[id]
  publish({ chosen: id, ignored })
}

/** Fin de la chasse de cette photo (capturée, recalée) : on revient à la plus proche. */
export function releaseGuideTarget(id: string): void {
  if (choice.chosen === id) publish({ ...choice, chosen: null })
}

/** Croix : cette photo n'est plus proposée pendant une heure ; le guidage passe à la suivante. */
export function ignoreGuideTarget(id: string, now = Date.now()): void {
  const ignored = { ...choice.ignored, [id]: now + WARM_COLD.ignoreMs }
  publish({ chosen: choice.chosen === id ? null : choice.chosen, ignored })
}

function subscribe(onChange: () => void) {
  listeners.add(onChange)
  return () => {
    listeners.delete(onChange)
  }
}

export function useGuideChoice(): GuideChoice {
  return useSyncExternalStore(subscribe, () => choice)
}
