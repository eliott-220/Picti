// Alignement du spectateur avec le point de vue d'une photo géocadrée :
// c'est ce qui permet de « capturer » une photo lors d'une chasse.

import { bearingDeg, compassPoint, distanceMeters, formatDistance, toENU, type GeoFix, type GeoPoint } from './geodesy'
import { angleDiffDeg, type Vec3 } from './math'
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

/**
 * Largeurs (°, m) des courbes du score d'alignement : l'écart pour lequel chaque terme
 * retombe à 1/e. Le score n'est qu'une indication (la capture suit `ALIGN_TOLERANCE`).
 */
export const ALIGN_SCORE = {
  heading: 12,
  pitch: 12,
  roll: 25,
  /** Au-delà du rayon « sur place ». */
  distance: 20,
}

/** Score atteint sur place, à la limite des tolérances de capture (≈ 0,48). */
export const TOLERANCE_SCORE = Math.exp(
  -((ALIGN_TOLERANCE.heading / ALIGN_SCORE.heading) ** 2) -
    (ALIGN_TOLERANCE.pitch / ALIGN_SCORE.pitch) ** 2 -
    (ALIGN_TOLERANCE.roll / ALIGN_SCORE.roll) ** 2,
)

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

  const positionScore =
    distance == null ? 0 : distance <= radius ? 1 : Math.exp(-(((distance - radius) / ALIGN_SCORE.distance) ** 2))
  const orientationScore = a
    ? Math.exp(
        -((headingError! / ALIGN_SCORE.heading) ** 2) -
          (pitchError! / ALIGN_SCORE.pitch) ** 2 -
          (rollError! / ALIGN_SCORE.roll) ** 2,
      )
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
 * Position de l'œil utilisée pour la projection, relative au point de vue :
 * la position réelle du spectateur, même tout près, pour que la photo reste
 * à sa place quand il se déplace. L'altitude GPS, bien trop imprécise, est
 * ignorée : on suppose le spectateur à la hauteur du photographe.
 * `offset` : recalage retranché (voir `SPOT_CALIBRATION_MS`).
 */
export function viewerEye(viewpoint: GeoPoint, viewer: GeoPoint, offset: Vec3 = [0, 0, 0]): Vec3 {
  const [east, north] = toENU(viewpoint, viewer)
  return [east - offset[0], north - offset[1], 0]
}

/**
 * Recalage au point de vue, lors d'une chasse : le GPS n'étant précis qu'à
 * quelques mètres, quand la photo est alignée (sur place, bonne orientation,
 * téléphone immobile) juste avant sa capture, on considère le chasseur au
 * point de vue exact et l'écart restant est attribué au GPS. Il s'efface en
 * ce temps (ms) et la photo se confond avec le décor ; ensuite il ne bouge
 * plus : si l'on se déplace, la photo garde sa place.
 */
export const SPOT_CALIBRATION_MS = 400
