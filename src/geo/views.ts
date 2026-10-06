// Vues et versions : une VUE = même lieu (`sameSpot`) ET même direction de visée. Une photo prise
// dans une vue existante en est une VERSION (une « reproduction »), qu'elle ait été prise avec le
// bouton « Reproduire » ou en photo classique.

import { angleDiffDeg } from './math'
import { sameSpot, type SpotPoint } from './spots'

/**
 * Écarts tolérés entre deux photos d'une même vue (°). L'orientation comparée est celle
 * réellement enregistrée : pour un selfie, celle de l'objectif avant (cap retourné).
 */
export const VIEW_HEADING_TOLERANCE = 20
export const VIEW_PITCH_TOLERANCE = 15

export interface ViewPoint extends SpotPoint {
  heading: number
  pitch: number
}

export function sameView(a: ViewPoint, b: ViewPoint): boolean {
  return (
    sameSpot(a, b) &&
    Math.abs(angleDiffDeg(a.heading, b.heading)) <= VIEW_HEADING_TOLERANCE &&
    Math.abs(a.pitch - b.pitch) <= VIEW_PITCH_TOLERANCE
  )
}

/** Visibilité d'une photo, de la plus restreinte à la plus large. */
type Visibility = 'prive' | 'amis' | 'public'
const RANK: Record<Visibility, number> = { prive: 0, amis: 1, public: 2 }

/** Une version ne peut pas être plus visible que sa photo parente (vérifié aussi par la base). */
export const capVisibility = (wanted: Visibility, parent: Visibility): Visibility =>
  RANK[wanted] <= RANK[parent] ? wanted : parent

export interface ParentCandidate {
  id: string
  view: ViewPoint
  visibility: Visibility
  /** Date de la photo (prise de vue, à défaut ajout, ms) : la plus ancienne de la vue l'emporte. */
  time: number
}

/**
 * Photo parente d'une photo classique qui tombe dans une vue existante : parmi les photos de
 * cette vue que je peux voir, celle que j'ai capturée le plus récemment (`capturedAt`), sinon la
 * plus ancienne. Une photo privée n'a pas de versions, et une parente moins visible que la
 * nouvelle photo l'obligerait à se restreindre : elles sont écartées. Aucune → null.
 */
export function chooseParent(
  photo: { view: ViewPoint; visibility: Visibility },
  candidates: ParentCandidate[],
  capturedAt: ReadonlyMap<string, number>,
): string | null {
  const inView = candidates.filter(
    (c) => c.visibility !== 'prive' && RANK[c.visibility] >= RANK[photo.visibility] && sameView(photo.view, c.view),
  )
  if (!inView.length) return null
  const captured = inView
    .filter((c) => capturedAt.has(c.id))
    .sort((a, b) => capturedAt.get(b.id)! - capturedAt.get(a.id)!)
  if (captured.length) return captured[0].id
  return [...inView].sort((a, b) => a.time - b.time)[0].id
}
