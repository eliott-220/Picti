// Outils mathématiques de base : vecteurs 3D et angles.

export type Vec3 = readonly [number, number, number]

export const DEG = Math.PI / 180

export const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]]
export const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
export const scale = (a: Vec3, k: number): Vec3 => [a[0] * k, a[1] * k, a[2] * k]
export const dot = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
export const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
]
export const norm = (a: Vec3): number => Math.hypot(a[0], a[1], a[2])
export const normalize = (a: Vec3): Vec3 => {
  const n = norm(a)
  return n === 0 ? a : scale(a, 1 / n)
}
export const lerp3 = (a: Vec3, b: Vec3, t: number): Vec3 => add(a, scale(sub(b, a), t))

export const clamp = (x: number, min: number, max: number): number => Math.min(max, Math.max(min, x))

/** Ramène un angle dans [0, 360). */
export function normalizeDeg(deg: number): number {
  const r = deg % 360
  return r < 0 ? r + 360 : r
}

/** Écart signé le plus court de `from` vers `to`, dans (-180, 180]. */
export function angleDiffDeg(from: number, to: number): number {
  const d = normalizeDeg(to - from)
  return d > 180 ? d - 360 : d
}

/** Interpolation d'Hermite : 0 sous `edge0`, 1 au-delà de `edge1`. */
export function smoothstep(edge0: number, edge1: number, x: number): number {
  if (edge1 === edge0) return x < edge0 ? 0 : 1
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1)
  return t * t * (3 - 2 * t)
}
