// Guidage vers une photo (0.24.0) : flèches de « À proximité » et, plus tard, chaud / froid du viseur.
//
// Une flèche montre où aller depuis l'endroit où l'on est, quand on tient le téléphone — à plat comme
// debout. Le cap de l'objectif (`anglesFromBasis`) ne convient pas à plat : l'objectif vise le sol, sa
// direction horizontale n'est que du bruit (les flèches de « À proximité » sautaient au hasard). On prend
// la direction horizontale de « avant + haut de l'écran » : à plat, le haut de l'écran ; debout,
// l'objectif ; entre les deux, les deux montrent le même côté.
//
// La position aussi tremble : quelques mètres de bruit GPS font tourner la flèche d'une photo proche. Le
// guidage garde une position de référence qui ne suit pas les sauts plus petits que la précision du point,
// et ne montre pas de flèche (« ici ») quand la photo est plus près que cette précision.

import { anglesFromBasis, type CameraBasis } from './orientation'
import { bearingDeg, distanceMeters, type GeoFix, type GeoPoint } from './geodesy'
import { angleDiffDeg, clamp, DEG, normalizeDeg } from './math'
import { NORTH } from './heading'

export const GUIDE = {
  /** Longueur horizontale minimale de « avant + haut » : en deçà, le cap du téléphone n'est pas défini. */
  minHorizontal: 0.2,
  /** Précision plancher (m) : en deçà, on ne compte plus sur le GPS pour dire « ici ». */
  minAccuracy: 1,
}

/**
 * Cap du téléphone tel qu'on le tient (°, 0 = nord, sens horaire) : direction horizontale de l'objectif
 * plus le haut de l'écran — le haut de l'écran à plat, l'objectif debout. Null si le téléphone ne montre
 * aucune direction (rare : écran vertical, de profil).
 */
export function deviceHeading({ f, u }: CameraBasis): number | null {
  const x = f[0] + u[0]
  const y = f[1] + u[1]
  if (Math.hypot(x, y) < GUIDE.minHorizontal) return null
  return normalizeDeg(Math.atan2(x, y) / DEG)
}

/**
 * Direction et inclinaison à comparer à la boussole d'iOS (`webkitCompassHeading`) : celle de l'objectif
 * tant qu'il vise à moins de `NORTH.maxPitch` de l'horizon (téléphone debout), sinon celle du haut de
 * l'écran (téléphone à plat : c'est elle que donne alors la boussole). Avant la 0.24.0, à plat, le premier
 * recalage du nord partait du cap de l'objectif — indéfini — et faussait le nord de tous les écrans
 * jusqu'à ce qu'on relève le téléphone.
 */
export function compassReference(basis: CameraBasis): { heading: number; pitch: number } {
  const camera = anglesFromBasis(basis)
  if (Math.abs(camera.pitch) <= NORTH.maxPitch) return { heading: camera.heading, pitch: camera.pitch }
  const { u } = basis
  return {
    heading: normalizeDeg(Math.atan2(u[0], u[1]) / DEG),
    pitch: Math.asin(clamp(u[2], -1, 1)) / DEG,
  }
}

/**
 * Angle de la flèche à l'écran (°, 0 = vers le haut de l'écran) vers un cap `bearing` : relatif au cap du
 * téléphone, ou au nord (nord en haut) sans cap fiable.
 */
export function arrowDeg(heading: number | null, bearing: number): number {
  return heading == null ? normalizeDeg(bearing) : angleDiffDeg(heading, bearing)
}

/**
 * Angle « déroulé » pour une transition CSS : le même que `next` à 360° près, le plus proche de `prev` —
 * une flèche qui passe de 350° à 10° tourne de 20°, pas de 340° dans l'autre sens.
 */
export function unwrapDeg(prev: number | null, next: number): number {
  return prev == null || !Number.isFinite(prev) ? next : prev + angleDiffDeg(prev, next)
}

/**
 * Position de référence du guidage : elle ne suit pas les sauts du GPS plus petits que la précision du
 * nouveau point (bruit), seulement un vrai déplacement — ou un point nettement plus précis.
 */
export function steadyViewer(anchor: GeoFix | null, fix: GeoFix): GeoFix {
  if (!anchor) return fix
  const accuracy = Math.max(fix.accuracy, GUIDE.minAccuracy)
  if (distanceMeters(anchor, fix) > accuracy || fix.accuracy < anchor.accuracy * 0.5) return fix
  return anchor
}

/** Vers une photo : distance (m) et cap (°) ; cap null = « ici » (plus près que la précision du GPS). */
export interface GuideStep {
  distance: number
  bearing: number | null
}

/** Distance et cap de `viewer` vers `target` ; « ici » sous la précision `accuracy` (m). */
export function guideTo(viewer: GeoPoint, target: GeoPoint, accuracy: number): GuideStep {
  const distance = distanceMeters(viewer, target)
  return { distance, bearing: distance <= Math.max(accuracy, GUIDE.minAccuracy) ? null : bearingDeg(viewer, target) }
}
