// Première photo publique (0.24.0) : une feuille, une seule fois par compte et par appareil — « Les photos
// publiques sont visibles par tout le monde, à l'endroit exact où tu les as prises… » · Compris · Passer en
// Amis. La publication attend la réponse ; la feuille fermée sans choisir vaut « Passer en Amis » (le plus
// prudent), sans perdre la photo.

import type { Visibility } from './types'

const keyOf = (userId: string) => `picti.photo-publique.${userId}`
const seen = new Set<string>()
const listeners = new Set<() => void>()
let pending: { promise: Promise<Visibility>; resolve: (v: Visibility) => void } | null = null

function alreadySeen(userId: string): boolean {
  if (seen.has(userId)) return true
  try {
    return localStorage.getItem(keyOf(userId)) === 'vu'
  } catch {
    return false
  }
}

/** Visibilité finale d'une photo publique : `public` tout de suite si l'avertissement a déjà été vu. */
export function confirmPublicPhoto(userId: string): Promise<Visibility> {
  if (alreadySeen(userId)) return Promise.resolve('public')
  // Deux photos publiées coup sur coup : une seule feuille, la même réponse.
  if (pending) return pending.promise
  let resolve!: (v: Visibility) => void
  const promise = new Promise<Visibility>((r) => (resolve = r))
  pending = {
    promise,
    resolve: (v) => {
      if (v === 'public') {
        seen.add(userId)
        try {
          localStorage.setItem(keyOf(userId), 'vu')
        } catch {
          // Mémoire seule : gardé pour cette ouverture.
        }
      }
      pending = null
      listeners.forEach((l) => l())
      resolve(v)
    },
  }
  listeners.forEach((l) => l())
  return promise
}

/** Une réponse est attendue (la feuille doit être affichée). */
export const publicNoticePending = (): boolean => pending != null

/** Réponse de la feuille. */
export function answerPublicNotice(v: Visibility) {
  pending?.resolve(v)
}

export function onPublicNotice(l: () => void): () => void {
  listeners.add(l)
  return () => {
    listeners.delete(l)
  }
}
