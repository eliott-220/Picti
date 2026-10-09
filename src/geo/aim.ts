// Croix de visée : la photo qui se trouve sous le centre de l'écran.

import type { PhotoProjection, Quad } from './projection'

interface Point {
  x: number
  y: number
}

/**
 * Le point `p` est-il dans le quadrilatère convexe `quad` (bords compris) ? Les coins se suivent
 * dans un sens ou dans l'autre (une photo vue de dos, comme sur une vitre, est en miroir).
 * Quadrilatère aplati (photo vue par la tranche) : jamais.
 */
export function pointInQuad(p: Point, quad: Quad<Point>): boolean {
  let side = 0
  for (let i = 0; i < 4; i++) {
    const a = quad[i]
    const b = quad[(i + 1) % 4]
    const cross = Math.sign((b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x))
    if (!cross) continue
    if (side && cross !== side) return false
    side = cross
  }
  return side !== 0
}

/** La croix, au centre de l'écran, est-elle sur la photo projetée (carte telle qu'affichée) ? */
export function aimsAt(projection: PhotoProjection, screen: { width: number; height: number }): boolean {
  return projection.onScreen && pointInQuad({ x: screen.width / 2, y: screen.height / 2 }, projection.corners)
}
