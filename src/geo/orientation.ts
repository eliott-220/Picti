// Orientation de la caméra arrière du téléphone.
//
// Repère monde : ENU (x = Est, y = Nord, z = Haut).
// Repère appareil (W3C DeviceOrientation) : x vers la droite de l'écran,
// y vers le haut de l'écran, z sortant de l'écran vers l'utilisateur.
// La caméra arrière regarde donc selon -z.

import { cross, DEG, dot, lerp3, normalize, normalizeDeg, scale, sub, type Vec3 } from './math'

/** Base orthonormée d'une caméra : avant (f), droite (r) et haut (u) de l'image. */
export interface CameraBasis {
  f: Vec3
  r: Vec3
  u: Vec3
}

/** Orientation lisible d'une prise de vue. */
export interface CameraAngles {
  /** Cap de l'objectif, en degrés depuis le nord, sens horaire. */
  heading: number
  /** Inclinaison : 0 = horizontale, positive vers le ciel. */
  pitch: number
  /** Roulis : positif quand le haut de l'image penche vers la droite. */
  roll: number
}

/**
 * Convertit les angles DeviceOrientation (alpha, beta, gamma) en base caméra.
 * Rotation intrinsèque Z-X'-Y'' telle que définie par la spécification W3C :
 * les colonnes de R = Rz(α)·Rx(β)·Ry(γ) sont les axes de l'appareil dans le monde.
 */
export function basisFromDeviceOrientation(alpha: number, beta: number, gamma: number): CameraBasis {
  const cZ = Math.cos(alpha * DEG)
  const sZ = Math.sin(alpha * DEG)
  const cX = Math.cos(beta * DEG)
  const sX = Math.sin(beta * DEG)
  const cY = Math.cos(gamma * DEG)
  const sY = Math.sin(gamma * DEG)

  const xAxis: Vec3 = [cZ * cY - sZ * sX * sY, cY * sZ + cZ * sX * sY, -cX * sY]
  const yAxis: Vec3 = [-cX * sZ, cZ * cX, sX]
  const zAxis: Vec3 = [cY * sZ * sX + cZ * sY, sZ * sY - cZ * cY * sX, cX * cY]

  return { f: scale(zAxis, -1), r: xAxis, u: yAxis }
}

/**
 * Tient compte de la rotation de l'écran (portrait / paysage) :
 * `screenAngle` = screen.orientation.angle (0, 90, 180, 270).
 */
export function rotateForScreen(basis: CameraBasis, screenAngle: number): CameraBasis {
  if (!screenAngle) return basis
  const c = Math.cos(screenAngle * DEG)
  const s = Math.sin(screenAngle * DEG)
  return {
    f: basis.f,
    u: normalize([
      basis.u[0] * c + basis.r[0] * s,
      basis.u[1] * c + basis.r[1] * s,
      basis.u[2] * c + basis.r[2] * s,
    ]),
    r: normalize([
      basis.r[0] * c - basis.u[0] * s,
      basis.r[1] * c - basis.u[1] * s,
      basis.r[2] * c - basis.u[2] * s,
    ]),
  }
}

/** Fait pivoter la base autour de la verticale : le cap augmente de `deg`. */
export function rotateAboutUp(basis: CameraBasis, deg: number): CameraBasis {
  const c = Math.cos(deg * DEG)
  const s = Math.sin(deg * DEG)
  const rot = (v: Vec3): Vec3 => [v[0] * c + v[1] * s, -v[0] * s + v[1] * c, v[2]]
  return { f: rot(basis.f), r: rot(basis.r), u: rot(basis.u) }
}

/** Base « sans roulis » pour un cap et une inclinaison donnés. */
function levelBasis(heading: number, pitch: number): CameraBasis {
  const ch = Math.cos(heading * DEG)
  const sh = Math.sin(heading * DEG)
  const cp = Math.cos(pitch * DEG)
  const sp = Math.sin(pitch * DEG)
  return {
    f: [sh * cp, ch * cp, sp],
    r: [ch, -sh, 0],
    u: [-sh * sp, -ch * sp, cp],
  }
}

export function basisFromAngles({ heading, pitch, roll }: CameraAngles): CameraBasis {
  const b = levelBasis(heading, pitch)
  const c = Math.cos(roll * DEG)
  const s = Math.sin(roll * DEG)
  return {
    f: b.f,
    r: [b.r[0] * c - b.u[0] * s, b.r[1] * c - b.u[1] * s, b.r[2] * c - b.u[2] * s],
    u: [b.u[0] * c + b.r[0] * s, b.u[1] * c + b.r[1] * s, b.u[2] * c + b.r[2] * s],
  }
}

export function anglesFromBasis({ f, u }: CameraBasis): CameraAngles {
  const pitch = Math.asin(Math.max(-1, Math.min(1, f[2]))) / DEG
  // Caméra quasi verticale : le cap de l'objectif n'est plus défini,
  // on le déduit alors de la direction du bas de l'image.
  const heading =
    Math.hypot(f[0], f[1]) > 1e-6
      ? normalizeDeg(Math.atan2(f[0], f[1]) / DEG)
      : normalizeDeg(Math.atan2(-u[0] * Math.sign(f[2]), -u[1] * Math.sign(f[2])) / DEG)
  const level = levelBasis(heading, pitch)
  const roll = Math.atan2(dot(u, level.r), dot(u, level.u)) / DEG
  return { heading, pitch, roll }
}

/**
 * Lissage exponentiel d'une base (filtre passe-bas) : `k` = poids de la
 * nouvelle mesure. On lisse les vecteurs plutôt que les angles pour éviter
 * les sauts de 359° à 0°.
 */
export function smoothBasis(prev: CameraBasis | null, next: CameraBasis, k: number): CameraBasis {
  if (!prev) return next
  const f = normalize(lerp3(prev.f, next.f, k))
  const uRaw = lerp3(prev.u, next.u, k)
  const u = normalize(sub(uRaw, scale(f, dot(uRaw, f))))
  return { f, u, r: cross(f, u) }
}
