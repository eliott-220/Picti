// Contenus retirés de l'écran tout de suite (0.24.0) : une photo que je viens de signaler, les photos
// d'un compte que je viens de bloquer. La base les filtre ensuite d'elle-même (règles restrictives de la
// migration `socle_testeurs`) ; ce registre évite d'attendre un rechargement — store, carte, piles.

import { useSyncExternalStore } from 'react'

interface Hidden {
  photos: ReadonlySet<string>
  owners: ReadonlySet<string>
}

let hidden: Hidden = { photos: new Set(), owners: new Set() }
const listeners = new Set<() => void>()

function emit(next: Hidden) {
  hidden = next
  listeners.forEach((l) => l())
}

/** Photo signalée : elle disparaît aussitôt pour moi. */
export function hidePhoto(id: string) {
  if (hidden.photos.has(id)) return
  emit({ ...hidden, photos: new Set(hidden.photos).add(id) })
}

/** Compte bloqué : ses photos disparaissent aussitôt. */
export function hideOwner(id: string) {
  if (hidden.owners.has(id)) return
  emit({ ...hidden, owners: new Set(hidden.owners).add(id) })
}

/** Compte débloqué : ses photos peuvent revenir. */
export function showOwner(id: string) {
  if (!hidden.owners.has(id)) return
  const owners = new Set(hidden.owners)
  owners.delete(id)
  emit({ ...hidden, owners })
}

/** Cette photo est-elle retirée de l'écran ? */
export function isHiddenPhoto(photo: { id: string; owner: string }, h: Hidden = hidden): boolean {
  return h.photos.has(photo.id) || h.owners.has(photo.owner)
}

export function hiddenContent(): Hidden {
  return hidden
}

function subscribe(l: () => void) {
  listeners.add(l)
  return () => {
    listeners.delete(l)
  }
}

export function useHiddenContent(): Hidden {
  return useSyncExternalStore(subscribe, () => hidden)
}

/** Pour les tests : repart de zéro. */
export function resetHiddenContent() {
  emit({ photos: new Set(), owners: new Set() })
}
