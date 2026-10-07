import { VISIBILITIES, type Visibility } from '../data/types'

/** Appui maintenu sur le déclencheur au-delà duquel le choix du mode s'ouvre (ms). */
export const LONG_PRESS_MS = 300
/** Glissement horizontal qui ouvre le choix sans attendre l'appui long (px). */
export const SLIDE_START_PX = 12
/** Écart entre deux modes de la réglette, et glissement pour passer de l'un à l'autre (px). */
export const MODE_STEP = 64
/** Marge gardée entre la réglette et les bords de l'écran (px). */
const EDGE = 8

/**
 * Mode choisi en faisant glisser le doigt de `dx` px depuis l'appui (vers la droite : positif).
 * Les modes vont de gauche à droite dans l'ordre de `VISIBILITIES` (Public · Amis · Privé) ; au-delà
 * des extrémités, on reste sur le dernier.
 */
export function visibilityAtOffset(from: Visibility, dx: number, step = MODE_STEP): Visibility {
  const i = VISIBILITIES.indexOf(from) + Math.round(dx / step)
  return VISIBILITIES[Math.min(VISIBILITIES.length - 1, Math.max(0, i))]
}

/**
 * Position de la réglette : le mode de départ juste au-dessus du déclencheur (centre `centerX`),
 * décalée si besoin pour rester dans l'écran (`viewportWidth`). Renvoie l'abscisse de son bord gauche.
 */
export function modesLeft(from: Visibility, centerX: number, viewportWidth: number, step = MODE_STEP): number {
  const width = VISIBILITIES.length * step
  const left = centerX - step / 2 - VISIBILITIES.indexOf(from) * step
  return Math.min(Math.max(left, EDGE), viewportWidth - EDGE - width)
}
