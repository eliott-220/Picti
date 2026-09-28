// Projection d'une photo géocadrée dans la vue caméra du spectateur.
//
// Modèle : la photo est un rectangle plan (« plan-photo ») placé devant
// le point de prise de vue, à la distance `depth` du sujet, orienté
// comme l'objectif au moment du déclenchement et dimensionné selon son
// champ de vision. Vu depuis le point de vue exact, il recouvre donc
// parfaitement le décor réel ; vu d'ailleurs, il apparaît de biais,
// plus petit ou décalé — c'est l'effet « fenêtre sur le passé ».

import { add, dot, scale, sub, type Vec3 } from './math'
import { focalPx, type ViewportCamera } from './optics'
import type { CameraBasis } from './orientation'

export interface PhotoGeometry {
  /** Dimensions de l'image (px). */
  width: number
  height: number
  /** Focale équivalente 24×36 de la prise de vue. */
  focal35: number
  /** Distance supposée entre l'objectif et le sujet (m). */
  depth: number
}

export type Quad<T> = [T, T, T, T]

/**
 * Coins du plan-photo dans le repère ENU, dans l'ordre
 * haut-gauche, haut-droit, bas-droit, bas-gauche.
 */
export function photoPlaneCorners(basis: CameraBasis, photo: PhotoGeometry, origin: Vec3 = [0, 0, 0]): Quad<Vec3> {
  const f = focalPx(photo.focal35, photo.width, photo.height)
  const halfW = (photo.depth * photo.width) / (2 * f)
  const halfH = (photo.depth * photo.height) / (2 * f)
  const center = add(origin, scale(basis.f, photo.depth))
  const right = scale(basis.r, halfW)
  const up = scale(basis.u, halfH)
  return [
    add(sub(center, right), up),
    add(add(center, right), up),
    sub(add(center, right), up),
    sub(sub(center, right), up),
  ]
}

/** Point projeté à l'écran ; `z` = profondeur le long de l'axe de visée. */
export interface ScreenPoint {
  x: number
  y: number
  z: number
}

export function projectPoint(p: Vec3, eye: Vec3, basis: CameraBasis, cam: ViewportCamera): ScreenPoint {
  const d = sub(p, eye)
  const z = dot(d, basis.f)
  const x = dot(d, basis.r)
  const y = dot(d, basis.u)
  return {
    x: cam.width / 2 + (cam.focal * x) / z,
    y: cam.height / 2 - (cam.focal * y) / z,
    z,
  }
}

export interface PhotoProjection {
  corners: Quad<ScreenPoint>
  /** Tous les coins sont devant la caméra (projection exploitable). */
  inFront: boolean
  /** Le quadrilatère recouvre au moins en partie l'écran. */
  onScreen: boolean
}

export function projectPhoto(
  corners: Quad<Vec3>,
  eye: Vec3,
  basis: CameraBasis,
  cam: ViewportCamera,
  near = 0.1,
): PhotoProjection {
  const projected = corners.map((c) => projectPoint(c, eye, basis, cam)) as Quad<ScreenPoint>
  const inFront = projected.every((p) => p.z > near)
  const xs = projected.map((p) => p.x)
  const ys = projected.map((p) => p.y)
  const onScreen =
    inFront &&
    Math.max(...xs) > 0 &&
    Math.min(...xs) < cam.width &&
    Math.max(...ys) > 0 &&
    Math.min(...ys) < cam.height
  return { corners: projected, inFront, onScreen }
}

export type Point2 = readonly [number, number]

/**
 * Homographie H (3×3, ligne par ligne, h[8] = 1) envoyant les 4 points
 * `src` sur les 4 points `dst`. Retourne null si la configuration est
 * dégénérée (points alignés).
 */
export function homography(src: Quad<Point2>, dst: Quad<Point2>): number[] | null {
  // Système linéaire 8×8 : A·h = b
  const A: number[][] = []
  const b: number[] = []
  for (let i = 0; i < 4; i++) {
    const [x, y] = src[i]
    const [X, Y] = dst[i]
    A.push([x, y, 1, 0, 0, 0, -x * X, -y * X])
    b.push(X)
    A.push([0, 0, 0, x, y, 1, -x * Y, -y * Y])
    b.push(Y)
  }
  const h = solveLinear(A, b)
  return h ? [...h, 1] : null
}

/** Élimination de Gauss avec pivot partiel. */
function solveLinear(A: number[][], b: number[]): number[] | null {
  const n = b.length
  const M = A.map((row, i) => [...row, b[i]])
  for (let col = 0; col < n; col++) {
    let pivot = col
    for (let row = col + 1; row < n; row++) {
      if (Math.abs(M[row][col]) > Math.abs(M[pivot][col])) pivot = row
    }
    if (Math.abs(M[pivot][col]) < 1e-12) return null
    ;[M[col], M[pivot]] = [M[pivot], M[col]]
    for (let row = 0; row < n; row++) {
      if (row === col) continue
      const k = M[row][col] / M[col][col]
      if (k === 0) continue
      for (let c = col; c <= n; c++) M[row][c] -= k * M[col][c]
    }
  }
  return M.map((row, i) => row[n] / row[i])
}

export function applyHomography(h: number[], x: number, y: number): Point2 {
  const w = h[6] * x + h[7] * y + h[8]
  return [(h[0] * x + h[1] * y + h[2]) / w, (h[3] * x + h[4] * y + h[5]) / w]
}

/** Transformation CSS `matrix3d` équivalente (avec `transform-origin: 0 0`). */
export function toCssMatrix3d(h: number[]): string {
  const m = [h[0], h[3], 0, h[6], h[1], h[4], 0, h[7], 0, 0, 1, 0, h[2], h[5], 0, h[8]]
  return `matrix3d(${m.map((v) => +v.toFixed(10)).join(',')})`
}

/** Transformation CSS plaçant un élément `w` × `h` sur le quadrilatère projeté. */
export function quadTransform(w: number, h: number, quad: Quad<ScreenPoint>): string | null {
  const H = homography(
    [
      [0, 0],
      [w, 0],
      [w, h],
      [0, h],
    ],
    quad.map((p) => [p.x, p.y] as const) as Quad<Point2>,
  )
  return H ? toCssMatrix3d(H) : null
}
