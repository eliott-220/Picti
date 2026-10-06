// Regroupement des photos prises « au même endroit » (un lieu) : dans la caméra,
// la photo en tête de pile s'affiche devant, les autres se font défiler.

import { distanceMeters, type GeoPoint } from './geodesy'
import { angleDiffDeg } from './math'

/**
 * Rayon d'un lieu (m) : 5 m par défaut (le rayon de capture), élargi jusqu'à la moins bonne
 * précision GPS des deux photos, sans dépasser 10 m ; précision inconnue → 10 m.
 */
export const SPOT_RADIUS_MIN = 5
export const SPOT_RADIUS_MAX = 10
/** Deux photos au même endroit mais visant à plus de 45° l'une de l'autre : deux lieux (dos à dos). */
export const SPOT_HEADING_TOLERANCE = 45

/** Ce qu'il faut savoir d'une prise de vue pour la ranger dans un lieu. */
export interface SpotPoint {
  position: GeoPoint
  /** Précision de la position (m), si connue. */
  accuracy?: number | null
  /** Cap de l'objectif (°), si connu. */
  heading?: number | null
}

/** Rayon (m) dans lequel deux prises de vue peuvent être au même endroit. */
export function spotRadius(a: SpotPoint, b: SpotPoint): number {
  if (a.accuracy == null || b.accuracy == null) return SPOT_RADIUS_MAX
  return Math.min(SPOT_RADIUS_MAX, Math.max(SPOT_RADIUS_MIN, a.accuracy, b.accuracy))
}

/**
 * Même lieu : assez proches (`spotRadius`) et visant dans des directions compatibles (cap à
 * ±45° près) ; sans cap connu, seule la distance compte.
 */
export function sameSpot(a: SpotPoint, b: SpotPoint): boolean {
  if (distanceMeters(a.position, b.position) > spotRadius(a, b)) return false
  if (a.heading == null || b.heading == null) return true
  return Math.abs(angleDiffDeg(a.heading, b.heading)) <= SPOT_HEADING_TOLERANCE
}

export interface Spot<T> {
  /** Prise de vue de référence : celle de la photo la plus récente du lieu (stable). */
  anchor: SpotPoint
  /** Position de référence (celle de l'ancre). */
  position: GeoPoint
  /** Photos du lieu, dans l'ordre de la pile (`order`, par défaut de la plus récente à la plus ancienne). */
  items: T[]
}

/**
 * Regroupe des prises de vue par lieu (`sameSpot`). Chaque lieu est ancré sur sa photo la plus
 * récente (une photo très aimée ne déplace pas le lieu) ; ses photos sont ensuite rangées dans
 * l'ordre de la pile (`order`). Les lieux sont renvoyés du plus récent au plus ancien.
 */
export function groupBySpot<T>(
  items: T[],
  point: (item: T) => SpotPoint,
  date: (item: T) => number,
  order?: (a: T, b: T) => number,
): Spot<T>[] {
  const sorted = [...items].sort((a, b) => date(b) - date(a))
  const spots: Spot<T>[] = []
  for (const item of sorted) {
    const p = point(item)
    let best: Spot<T> | null = null
    let bestDistance = Infinity
    for (const spot of spots) {
      if (!sameSpot(spot.anchor, p)) continue
      const d = distanceMeters(spot.position, p.position)
      if (d < bestDistance) {
        best = spot
        bestDistance = d
      }
    }
    if (best) best.items.push(item)
    else spots.push({ anchor: p, position: p.position, items: [item] })
  }
  if (order) for (const spot of spots) spot.items.sort(order)
  return spots
}

/**
 * Ordre de la pile d'un lieu : score décroissant (`PILE_SCORE`), la plus récente devant à
 * égalité ; une photo ajoutée depuis moins de `NEW_PHOTO_BOOST_HOURS` passe en tête, pour
 * qu'elle ait une chance d'être vue avant d'avoir des likes.
 */
export const PILE_SCORE = {
  /** Poids d'un like (à distance ou sur place). */
  like: 1,
  /**
   * Poids supplémentaire d'un like sur place (capture), prévu pour plus tard : il faudra alors
   * un compteur séparé des likes sur place (aujourd'hui, `likes_count` les compte tous).
   */
  onSiteLike: 0,
}
export const NEW_PHOTO_BOOST_HOURS = 24

export interface PileEntry {
  /** Nombre de likes. */
  likes: number
  /** Likes sur place (captures), si connus. */
  onSiteLikes?: number
  /** Date d'ajout dans PICTI (ms). */
  addedAt: number
  /** Date de la photo (prise de vue, à défaut ajout, ms). */
  time: number
}

export const pileScore = (e: PileEntry) => e.likes * PILE_SCORE.like + (e.onSiteLikes ?? 0) * PILE_SCORE.onSiteLike

/** Comparateur de la pile (à passer à `sort`), à l'instant `now`. */
export function pileOrder<T>(entry: (item: T) => PileEntry, now = Date.now()): (a: T, b: T) => number {
  const boost = NEW_PHOTO_BOOST_HOURS * 3600_000
  return (a, b) => {
    const ea = entry(a)
    const eb = entry(b)
    const newA = now - ea.addedAt < boost
    const newB = now - eb.addedAt < boost
    if (newA !== newB) return newA ? -1 : 1
    if (!newA) {
      const ds = pileScore(eb) - pileScore(ea)
      if (ds) return ds
    }
    return eb.time - ea.time
  }
}

/**
 * Rang de la photo voisine dans une pile, en boucle : après la dernière, on revient à la
 * première (et inversement).
 */
export const cycle = (index: number, step: number, count: number) => (((index + step) % count) + count) % count
