// Alignement du spectateur avec le point de vue d'une photo géocadrée :
// c'est ce qui permet de « capturer » une photo lors d'une chasse.

import { bearingDeg, compassPoint, distanceMeters, formatDistance, type GeoFix, type GeoPoint } from './geodesy'
import { angleDiffDeg, scale, smoothstep, type Vec3 } from './math'
import type { CameraAngles } from './orientation'

export const ALIGN_TOLERANCE = {
  /** Écart de cap toléré (°). */
  heading: 6,
  /** Écart d'inclinaison toléré (°). */
  pitch: 6,
  /** Écart de roulis toléré (°). */
  roll: 12,
  /** Rayon minimal (m) : en deçà, la précision du GPS ne permet pas mieux. */
  radius: 8,
}

export interface Alignment {
  /** Distance au point de vue (m), null sans position. */
  distance: number | null
  /** Cap à suivre pour rejoindre le point de vue. */
  bearing: number | null
  /** Rayon dans lequel on considère être « sur place » (m). */
  radius: number
  /** Écarts signés : > 0 → tourner à droite / lever / pencher à droite. */
  headingError: number | null
  pitchError: number | null
  rollError: number | null
  /** Qualité globale de l'alignement, de 0 à 1. */
  score: number
  onSpot: boolean
  aligned: boolean
}

export function computeAlignment(
  target: { position: GeoPoint; angles: CameraAngles },
  viewer: { position: GeoFix | null; angles: CameraAngles | null },
): Alignment {
  const radius = Math.max(ALIGN_TOLERANCE.radius, viewer.position?.accuracy ?? 0)
  const distance = viewer.position ? distanceMeters(viewer.position, target.position) : null
  const bearing = viewer.position && distance! > 0.5 ? bearingDeg(viewer.position, target.position) : null
  const a = viewer.angles
  const headingError = a ? angleDiffDeg(a.heading, target.angles.heading) : null
  const pitchError = a ? target.angles.pitch - a.pitch : null
  const rollError = a ? angleDiffDeg(a.roll, target.angles.roll) : null

  const positionScore = distance == null ? 0 : distance <= radius ? 1 : Math.exp(-(((distance - radius) / 20) ** 2))
  const orientationScore = a
    ? Math.exp(-((headingError! / 12) ** 2) - (pitchError! / 12) ** 2 - (rollError! / 25) ** 2)
    : 0
  const onSpot = distance != null && distance <= radius
  const aligned =
    onSpot &&
    Math.abs(headingError!) <= ALIGN_TOLERANCE.heading &&
    Math.abs(pitchError!) <= ALIGN_TOLERANCE.pitch &&
    Math.abs(rollError!) <= ALIGN_TOLERANCE.roll

  return {
    distance,
    bearing,
    radius,
    headingError,
    pitchError,
    rollError,
    score: positionScore * orientationScore,
    onSpot,
    aligned,
  }
}

/** Consigne à afficher pour guider le chasseur. */
export function guidance(al: Alignment, hasOrientation: boolean): string {
  if (al.distance == null) return 'Recherche de votre position…'
  if (!al.onSpot) {
    const dir = al.bearing != null ? ` vers le ${compassPoint(al.bearing)}` : ''
    return `Point de vue à ${formatDistance(al.distance)}${dir}`
  }
  if (!hasOrientation) return 'Boussole indisponible : alignez la photo à l’œil'
  if (Math.abs(al.headingError!) > ALIGN_TOLERANCE.heading) {
    return al.headingError! > 0 ? 'Tournez-vous vers la droite' : 'Tournez-vous vers la gauche'
  }
  if (Math.abs(al.pitchError!) > ALIGN_TOLERANCE.pitch) {
    return al.pitchError! > 0 ? 'Levez légèrement le téléphone' : 'Baissez légèrement le téléphone'
  }
  if (Math.abs(al.rollError!) > ALIGN_TOLERANCE.roll) return 'Redressez le téléphone'
  return 'Ne bougez plus…'
}

/**
 * Position de l'œil utilisée pour la projection, relative au point de vue.
 * Le GPS d'un téléphone n'est précis qu'à quelques mètres : une fois « sur
 * place », on cale l'œil sur le point de vue exact (seule l'orientation
 * compte), puis on réintroduit progressivement la parallaxe en s'éloignant.
 */
export function parallaxEye(viewerEnu: Vec3, distance: number, radius: number): Vec3 {
  return scale(viewerEnu, smoothstep(radius, radius + 25, distance))
}
