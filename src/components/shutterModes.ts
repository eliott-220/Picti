import { VISIBILITIES, type Visibility } from '../data/types'

/** Appui maintenu sur le déclencheur au-delà duquel le carrousel des modes s'ouvre (ms). */
export const LONG_PRESS_MS = 300
/** Glissement horizontal qui ouvre le carrousel sans attendre l'appui long (px). */
export const SLIDE_START_PX = 12
/** Écart entre deux symboles du carrousel, et glissement pour passer de l'un à l'autre (px). */
export const MODE_STEP = 72
/** Au-delà du premier ou du dernier mode, le carrousel résiste (fraction suivie, recul maximal en px). */
const RUBBER = 0.25
const RUBBER_MAX = 20

const indexOf = (v: Visibility) => VISIBILITIES.indexOf(v)
const clampIndex = (i: number) => Math.min(VISIBILITIES.length - 1, Math.max(0, i))

/**
 * Décalage du carrousel quand le doigt a glissé de `dx` px (vers la droite : positif) : les symboles
 * suivent le doigt, mais résistent au-delà des extrémités (on ne dépasse pas Public ni Privé).
 */
export function stripOffset(from: Visibility, dx: number, step = MODE_STEP): number {
  const max = indexOf(from) * step
  const min = -(VISIBILITIES.length - 1 - indexOf(from)) * step
  const resist = (over: number) => Math.min(RUBBER_MAX, over * RUBBER)
  if (dx > max) return max + resist(dx - max)
  if (dx < min) return min - resist(min - dx)
  return dx
}

/**
 * Mode dont le symbole est dans le cercle rouge, le carrousel décalé de `offset` px. Les symboles
 * vont de gauche à droite dans l'ordre de `VISIBILITIES` (Public · Amis · Privé) : glisser vers la
 * gauche fait entrer celui de droite.
 */
export function visibilityAtOffset(from: Visibility, offset: number, step = MODE_STEP): Visibility {
  return VISIBILITIES[clampIndex(indexOf(from) - Math.round(offset / step))]
}

/** Position horizontale du symbole `v` par rapport au centre du cercle (px). */
export function modePosition(v: Visibility, from: Visibility, offset: number, step = MODE_STEP): number {
  return (indexOf(v) - indexOf(from)) * step + offset
}

/** Décalage qui met le symbole `v` au centre du cercle (au relâchement). */
export function offsetFor(v: Visibility, from: Visibility, step = MODE_STEP): number {
  return -(indexOf(v) - indexOf(from)) * step
}

/**
 * Aspect d'un symbole selon sa distance au centre, en nombre d'écarts : net et grand dans le cercle,
 * plus petit, flou et pâle à côté, effacé au-delà du voisin.
 */
export function modeLook(distance: number): { opacity: number; blur: number; scale: number } {
  const d = Math.abs(distance)
  const near = Math.min(d, 1)
  return {
    opacity: d <= 1 ? 1 - 0.2 * d : Math.max(0, 0.8 * (2 - d)),
    blur: 2 * near,
    scale: 1 - 0.3 * near,
  }
}

/** Nom affiché au-dessus du cercle : plein quand le symbole est centré, effacé à mi-chemin. */
export function labelOpacity(distance: number): number {
  return Math.max(0, 1 - 2 * Math.abs(distance))
}

/** Mode voisin (clavier : flèches), sans boucler. */
export function neighborVisibility(v: Visibility, dir: 1 | -1): Visibility {
  return VISIBILITIES[clampIndex(indexOf(v) + dir)]
}
