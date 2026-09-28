// Regroupement des photos prises « au même endroit » : dans la caméra, la
// plus récente d'un lieu s'affiche devant, les plus anciennes se font défiler.

import { distanceMeters, type GeoPoint } from './geodesy'

/** Rayon (m) sous lequel deux prises de vue sont considérées au même endroit. */
export const SAME_SPOT_RADIUS = 10

export interface Spot<T> {
  /** Position de référence : celle de la photo la plus récente du lieu. */
  position: GeoPoint
  /** Photos du lieu, de la plus récente à la plus ancienne. */
  items: T[]
}

/**
 * Regroupe des éléments géolocalisés par lieu. Chaque lieu est ancré sur sa
 * photo la plus récente ; les lieux sont renvoyés du plus récent au plus ancien.
 */
export function groupBySpot<T>(
  items: T[],
  position: (item: T) => GeoPoint,
  date: (item: T) => number,
  radius = SAME_SPOT_RADIUS,
): Spot<T>[] {
  const sorted = [...items].sort((a, b) => date(b) - date(a))
  const spots: Spot<T>[] = []
  for (const item of sorted) {
    const p = position(item)
    let best: Spot<T> | null = null
    let bestDistance = Infinity
    for (const spot of spots) {
      const d = distanceMeters(spot.position, p)
      if (d <= radius && d < bestDistance) {
        best = spot
        bestDistance = d
      }
    }
    if (best) best.items.push(item)
    else spots.push({ position: p, items: [item] })
  }
  return spots
}

/**
 * Rang de la photo voisine dans une pile, en boucle : après la plus
 * ancienne, on revient à la plus récente (et inversement).
 */
export const cycle = (index: number, step: number, count: number) => (((index + step) % count) + count) % count
