// Couleurs inversées (depuis 0.013.0) : la caméra est en couleur, les photos des autres
// restent en noir et blanc tant qu'on ne les a pas capturées. La couleur est la récompense
// de la chasse.

import { useCallback, useMemo } from 'react'
import { TOLERANCE_SCORE } from '../geo/alignment'
import { useStore } from './storeContext'

export interface ColorContext {
  /** Utilisateur connecté. */
  userId: string
  /** Photos qu'il a capturées. */
  capturedIds: ReadonlySet<string>
}

/** Une photo est en couleur si j'en suis l'auteur ou si je l'ai capturée ; en noir et blanc sinon. */
export function photoInColor(photo: { id: string; owner?: string | null }, ctx: ColorContext): boolean {
  return (photo.owner != null && photo.owner === ctx.userId) || ctx.capturedIds.has(photo.id)
}

/**
 * Couleur progressive pendant la chasse : saturation de la photo visée selon le score
 * d'alignement (`computeAlignment`). Nulle quand on est loin ou mal aligné (score sous `start`),
 * elle monte en douceur jusqu'à `max` au score atteint à la limite des tolérances de capture
 * (`TOLERANCE_SCORE`) : presque aligné, la photo retrouve 40 % de ses couleurs ; la capture
 * donne le reste.
 */
export const HUNT_COLOR = { start: 0.15, max: 0.4 }

export function huntSaturation(score: number): number {
  const t = Math.min(1, Math.max(0, (score - HUNT_COLOR.start) / (TOLERANCE_SCORE - HUNT_COLOR.start)))
  return HUNT_COLOR.max * t * t * (3 - 2 * t)
}

/** Règle de couleur de l'utilisateur connecté (voir `photoInColor`). */
export function useColorRule(): (photo: { id: string; owner?: string | null }) => boolean {
  const { userId, captures } = useStore()
  const capturedIds = useMemo(() => new Set(captures.map((c) => c.photoId)), [captures])
  return useCallback((photo) => photoInColor(photo, { userId, capturedIds }), [userId, capturedIds])
}

/**
 * La photo `id` s'affiche-t-elle en couleur ? `owner` : son auteur, s'il est connu de l'appelant
 * (carte) ; à défaut, celui de la photo dans le store. Auteur inconnu : noir et blanc, sauf capture.
 */
export function usePhotoInColor(id: string | null | undefined, owner?: string | null): boolean {
  const { photos } = useStore()
  const inColor = useColorRule()
  if (!id) return true
  return inColor({ id, owner: owner ?? photos.find((p) => p.id === id)?.owner })
}
