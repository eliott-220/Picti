// Aide de précision de Reproduire ; indépendante du GPS et de sameView/version_of.
import { ALIGN_TOLERANCE } from './alignment'
import { DEG, dot, norm } from './math'
import type { ViewportCamera } from './optics'
import type { CameraBasis } from './orientation'
import { projectPoint } from './projection'

export interface OrientationGuide {
  kind: 'unavailable' | 'behind' | 'edge' | 'visible'
  aligned: boolean
  x: number
  y: number
  roll: number
  direction: number
  message: string
}

function validBasis(b: CameraBasis | null): b is CameraBasis {
  return !!b && [b.f, b.r, b.u].every((v) => v.every(Number.isFinite) && Math.abs(norm(v) - 1) < 0.01)
    && Math.abs(dot(b.f, b.u)) < 0.01 && Math.abs(dot(b.f, b.r)) < 0.01 && Math.abs(dot(b.u, b.r)) < 0.01
}

/** Base optique enregistrée, sans retournement selfie ; miroir UNE fois, à l'affichage. */
export function reproduceOrientation(
  target: CameraBasis | null,
  viewer: CameraBasis | null,
  cam: ViewportCamera | null,
  mirror = false,
): OrientationGuide {
  const unavailable: OrientationGuide = {
    kind: 'unavailable', aligned: false, x: 0, y: 0, roll: 0, direction: 0,
    message: 'Alignez la photo à l’œil',
  }
  if (!validBasis(target) || !validBasis(viewer) || !cam
    || ![cam.width, cam.height, cam.focal].every((v) => Number.isFinite(v) && v > 0)) return unavailable

  const right = dot(target.f, viewer.r)
  const up = dot(target.f, viewer.u)
  const forward = dot(target.f, viewer.f)
  const sx = mirror ? -1 : 1
  const direction = Math.atan2(sx * right, up) / DEG
  // À 90° aussi : aucune division par une profondeur nulle ni projection inversée.
  if (forward <= 1e-6) return {
    ...unavailable, kind: 'behind', direction,
    message: Math.hypot(right, up) < 0.01 ? 'Faites demi-tour pour retrouver la photo'
      : Math.abs(right) >= Math.abs(up) ? (sx * right > 0 ? 'Tournez le téléphone vers la droite' : 'Tournez le téléphone vers la gauche')
        : up > 0 ? 'Tournez le téléphone vers le haut' : 'Tournez le téléphone vers le bas',
  }

  const point = projectPoint(target.f, [0, 0, 0], viewer, cam)
  const dx = sx * (point.x - cam.width / 2)
  const dy = point.y - cam.height / 2
  // Angle du haut de la photo dans l'image courante : stable même en visant le zénith.
  const roll = sx * Math.atan2(dot(target.u, viewer.r), dot(target.u, viewer.u)) / DEG
  const headingError = Math.atan2(right, forward) / DEG
  const pitchError = Math.atan2(up, forward) / DEG
  // Les tolérances fines de la chasse (6° / 6° / 12°), dans le repère du viseur.
  // Ce verdict porte sur la mesure, JAMAIS sur les pixels bornés/lissés.
  const axesAligned = Math.abs(headingError) <= ALIGN_TOLERANCE.heading && Math.abs(pitchError) <= ALIGN_TOLERANCE.pitch
  const margin = 20
  const halfW = Math.max(1, cam.width / 2 - margin)
  const halfH = Math.max(1, cam.height / 2 - margin)
  const bound = Math.max(1, Math.abs(dx) / halfW, Math.abs(dy) / halfH)
  const kind = bound > 1 ? 'edge' : 'visible'
  const aligned = kind === 'visible' && axesAligned && Math.abs(roll) <= ALIGN_TOLERANCE.roll
  return {
    kind, aligned, x: cam.width / 2 + dx / bound, y: cam.height / 2 + dy / bound,
    roll, direction,
    message: aligned ? 'Orientation alignée' : axesAligned && Math.abs(roll) > ALIGN_TOLERANCE.roll
      ? 'Alignez les deux croix · faites pivoter le téléphone'
      : kind === 'edge' ? 'Alignez les deux croix · suivez la flèche' : 'Alignez les deux croix',
  }
}
