// Poses du suivi visuel (ARKit, app iOS) → repère du calage et repère ENU.
//
// Repère du suivi (ARKit, `worldAlignment = .gravity`) : y vers le haut, x et z à l'horizontale, cap
// arbitraire. Repère local du calage (`arAlign.ts`) : (e', n', u) = (x, −z, y), direct comme l'ENU ;
// il ne lui manque que la rotation θ autour de la verticale et la translation vers la Terre.
// Axes de la caméra (écran en portrait, `viewMatrix(for: .portrait)`) : droite, haut, arrière ; l'objectif
// regarde vers −arrière.

import { localToGeo, rotateLocal, type AlignTransform, type LocalPoint } from './arAlign'
import type { GeoPoint } from './geodesy'
import { approach, DEG, normalizeDeg, type Vec3 } from './math'
import { anglesFromBasis, rotateAboutUp, type CameraBasis } from './orientation'

export interface ArPose {
  /** Instant de l'image (ms, horloge de `Date.now()`). */
  t: number
  /** Position de la caméra dans le repère du suivi (m). */
  position: Vec3
  /** Axes de la caméra dans le repère du suivi. */
  right: Vec3
  up: Vec3
  back: Vec3
}

/** Vecteur du suivi → repère local (e', n', u). */
export const toLocal = (v: Vec3): Vec3 => [v[0], -v[2], v[1]]

/** Position horizontale de la caméra dans le repère local. */
export const localPoint = (pose: Pick<ArPose, 'position'>): LocalPoint => [pose.position[0], -pose.position[2]]

/** Base de la caméra dans le repère local (cap arbitraire). */
export function localBasis(pose: ArPose): CameraBasis {
  return { f: toLocal([-pose.back[0], -pose.back[1], -pose.back[2]]), r: toLocal(pose.right), u: toLocal(pose.up) }
}

/** Base de la caméra dans l'ENU, d'après le cap θ du calage. */
export const arBasis = (pose: ArPose, theta: number): CameraBasis => rotateAboutUp(localBasis(pose), theta)

/** Position géographique de la caméra d'après le calage. */
export const arPosition = (pose: ArPose, t: AlignTransform): GeoPoint => localToGeo(t, localPoint(pose))

/** Cap de l'objectif dans le repère local (degrés) et son inclinaison. */
export function localView(pose: ArPose): { heading: number; pitch: number } {
  const { heading, pitch } = anglesFromBasis(localBasis(pose))
  return { heading, pitch }
}

/**
 * Pose à l'instant `t` (relevé GPS) : interpolée entre les deux images qui l'encadrent ; null si `t`
 * sort de l'historique (relevé trop vieux, ou plus récent que la dernière image de plus de `maxAhead`).
 */
export function poseAt(history: readonly ArPose[], t: number, maxAhead = 150): ArPose | null {
  if (!history.length) return null
  const last = history[history.length - 1]
  if (t >= last.t) return t - last.t <= maxAhead ? last : null
  if (t < history[0].t) return null
  // Historique trié : recherche dichotomique de la première image après `t`.
  let lo = 0
  let hi = history.length - 1
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (history[mid].t < t) lo = mid + 1
    else hi = mid
  }
  const b = history[lo]
  const a = history[lo - 1] ?? b
  const k = b.t === a.t ? 0 : (t - a.t) / (b.t - a.t)
  const mix = (u: Vec3, v: Vec3): Vec3 => [u[0] + (v[0] - u[0]) * k, u[1] + (v[1] - u[1]) * k, u[2] + (v[2] - u[2]) * k]
  return { ...(k < 0.5 ? a : b), t, position: mix(a.position, b.position) }
}

/** Vitesse de rotation horizontale de l'objectif (degrés/s) sur les images récentes. */
export function turnRate(history: readonly ArPose[], window = 250): number {
  const last = history[history.length - 1]
  if (!last) return Infinity
  let first = last
  for (let i = history.length - 1; i >= 0 && last.t - history[i].t <= window; i--) first = history[i]
  const dt = (last.t - first.t) / 1000
  if (dt <= 0) return Infinity
  const h0 = localView(first).heading
  const h1 = localView(last).heading
  return Math.abs(normalizeDeg(h1 - h0 + 180) - 180) / dt
}

/**
 * Le repère du suivi a sauté entre deux images (ARKit s'est relocalisé) : le téléphone ne peut pas se
 * déplacer de plus de `maxSpeed` m/s. Au-delà d'une demi-seconde sans image, on ne peut pas trancher.
 */
export function poseJumped(prev: ArPose, next: ArPose, maxSpeed = 8): boolean {
  const dt = (next.t - prev.t) / 1000
  if (dt <= 0 || dt > 0.5) return false
  const d = Math.hypot(next.position[0] - prev.position[0], next.position[1] - prev.position[1], next.position[2] - prev.position[2])
  return d > 0.3 && d / dt > maxSpeed
}

/**
 * Point du repère local d'avant un saut, exprimé dans le repère d'après : la caméra n'a pas bougé entre
 * les deux images (`before` → `after`), le repère a tourné de `turn` degrés (cap local d'après − d'avant).
 */
export function acrossJump(q: LocalPoint, before: ArPose, after: ArPose, turn: number): LocalPoint {
  const [b0, b1] = localPoint(before)
  const [a0, a1] = localPoint(after)
  const [d0, d1] = rotateLocal([q[0] - b0, q[1] - b1], turn)
  return [a0 + d0, a1 + d1]
}

/** Conditions d'une mesure de boussole fiable (comme `geo/heading.ts`) : objectif proche de l'horizon, téléphone stable. */
export const COMPASS_SAMPLE = {
  /** Objectif à moins de ce nombre de degrés de l'horizon. */
  maxPitch: 55,
  /** Rotation plus lente que ce seuil (degrés/s) : la boussole est en retard quand on tourne. */
  maxTurnRate: 8,
  /** Précision annoncée par iOS (`webkitCompassAccuracy`, degrés) au-delà de laquelle on l'ignore. */
  maxAccuracy: 25,
}

/**
 * Mesure de θ (degrés) tirée de la boussole (cap de l'objectif annoncé par iOS) et de la pose du
 * même instant ; null si les conditions ne sont pas réunies.
 */
export function compassTheta(
  compass: number,
  accuracy: number | null,
  pose: ArPose,
  rate: number,
): number | null {
  if (!Number.isFinite(compass) || compass < 0) return null
  if (accuracy != null && (accuracy < 0 || accuracy > COMPASS_SAMPLE.maxAccuracy)) return null
  if (rate > COMPASS_SAMPLE.maxTurnRate) return null
  const { heading, pitch } = localView(pose)
  if (Math.abs(pitch) > COMPASS_SAMPLE.maxPitch) return null
  return normalizeDeg(compass - heading)
}

/** Calage affiché, qui rejoint le calage calculé en douceur (`tau` ms) : les photos ne sautent pas. */
export function approachTransform(shown: AlignTransform | null, target: AlignTransform, dt: number, tau: number): AlignTransform {
  if (!shown || shown.ref !== target.ref) return target
  // Grand écart (premier cap fiable, nouvelle session) : on y va directement.
  const dTheta = normalizeDeg(target.theta - shown.theta + 180) - 180
  if (Math.abs(dTheta) > 20 || Math.hypot(target.e0 - shown.e0, target.n0 - shown.n0) > 15) return target
  const [theta, e0, n0] = approach([shown.theta, shown.e0, shown.n0], [shown.theta + dTheta, target.e0, target.n0], dt, tau)
  return { ref: target.ref, theta: normalizeDeg(theta), e0, n0 }
}

/** Focale équivalente 24×36 d'une image de `width` × `height` px de focale `focal` px. */
export const focal35Of = (focal: number, width: number, height: number): number =>
  (focal * Math.hypot(36, 24)) / Math.hypot(width, height)

/** Champ de vision vertical (degrés) d'une image de `height` px de focale `focal` px. */
export const verticalFov = (focal: number, height: number): number => (2 * Math.atan(height / 2 / focal)) / DEG
