// Projection d'une photo géocadrée dans la vue caméra du spectateur.
//
// Modèle : la photo est un rectangle plan (« plan-photo ») placé devant
// le point de prise de vue, à la distance `depth` du sujet, orienté
// comme l'objectif au moment du déclenchement et dimensionné selon son
// champ de vision. Vu depuis le point de vue exact, il recouvre donc
// parfaitement le décor réel ; vu d'ailleurs, il apparaît de biais,
// plus petit ou décalé — c'est l'effet « fenêtre sur le passé ».

import { add, DEG, dot, norm, scale, sub, type Vec3 } from './math'
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
 * haut-gauche, haut-droit, bas-droit, bas-gauche. `size` réduit le plan
 * autour de son centre (voir `displayScale`).
 */
export function photoPlaneCorners(
  basis: CameraBasis,
  photo: PhotoGeometry,
  origin: Vec3 = [0, 0, 0],
  size = 1,
): Quad<Vec3> {
  const f = focalPx(photo.focal35, photo.width, photo.height)
  const halfW = (size * photo.depth * photo.width) / (2 * f)
  const halfH = (size * photo.depth * photo.height) / (2 * f)
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

/**
 * Photo vue de loin : au point de vue, le plan-photo recouvre exactement le
 * décor ; en s'éloignant, il rapetisse plus vite que ne le voudrait la seule
 * perspective, pour que la photo paraisse lointaine — une carte posée à
 * l'endroit de la prise de vue, qui grandit à mesure qu'on s'en approche.
 * Sujet à 6 m, dans l'axe : à 20 m, 8 % de sa taille au point de vue (23 %
 * sans réduction), à 10 m 21 % (38 %), à 5 m 44 % (55 %).
 */
export const FAR = {
  /** Distance au point de vue (m) qui règle la réduction. */
  distance: 7,
  /** Hauteur apparente minimale (°) : de très loin, la photo reste repérable. */
  minAngle: 5,
}

/** Réduction du plan-photo quand le spectateur est à `distance` m du point de vue. */
export const farScale = (distance: number) => 1 / Math.hypot(1, distance / FAR.distance)

/**
 * Taille du plan-photo vu depuis `eye` (repère centré sur le point de vue) :
 * `farScale`, sans descendre sous la hauteur apparente minimale (quitte, de
 * très loin, à agrandir le plan).
 */
export function displayScale(basis: CameraBasis, photo: PhotoGeometry, eye: Vec3): number {
  const f = focalPx(photo.focal35, photo.width, photo.height)
  const halfH = (photo.depth * photo.height) / (2 * f)
  const toCenter = norm(sub(scale(basis.f, photo.depth), eye))
  const min = (toCenter * Math.tan((FAR.minAngle * DEG) / 2)) / halfH
  return Math.max(farScale(Math.hypot(eye[0], eye[1])), min)
}

/**
 * Le spectateur (`eye`, repère centré sur le point de vue) voit la photo de
 * face : il se tient du côté du photographe par rapport au plan-photo.
 * Au-delà (on l'a dépassée), on la verrait de dos, à l'envers.
 */
export function facesViewer(basis: CameraBasis, depth: number, eye: Vec3): boolean {
  return dot(eye, basis.f) < depth
}

/**
 * |cos| de l'angle entre la visée du spectateur vers le centre du plan-photo et l'axe de la
 * prise de vue (`basis.f`) : 1 en face (ou pile derrière), 0 quand on voit le plan par la tranche.
 */
export function viewCosine(basis: CameraBasis, depth: number, eye: Vec3): number {
  const toCenter = sub(scale(basis.f, depth), eye)
  const d = norm(toCenter)
  return d > 1e-9 ? Math.abs(dot(toCenter, basis.f)) / d : 1
}

/**
 * Effacement par la tranche : sous `hidden` (≈ 85° de l'axe) la photo disparaît, au-delà de
 * `full` (≈ 70°) elle est pleinement visible ; entre les deux, fondu progressif.
 */
export const EDGE_FADE = { hidden: 0.08, full: 0.35 }

/** Opacité de 0 à 1 selon `viewCosine` (courbe douce, « smoothstep »). */
export function edgeFade(cos: number): number {
  const t = Math.min(1, Math.max(0, (cos - EDGE_FADE.hidden) / (EDGE_FADE.full - EDGE_FADE.hidden)))
  return t * t * (3 - 2 * t)
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
