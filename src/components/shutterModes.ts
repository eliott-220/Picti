import { VISIBILITIES, type Visibility } from '../data/types'

/** Appui maintenu sur le déclencheur au-delà duquel le choix du mode s'ouvre (ms). */
export const LONG_PRESS_MS = 300
/** Glissement vers le haut qui ouvre le choix du mode sans attendre l'appui long (px). */
export const SLIDE_START_PX = 12
/** Écart vertical entre deux symboles de la colonne, et glissement pour passer de l'un à l'autre (px). */
export const MODE_STEP = 68
/** Au-delà du dernier mode (ou sous le premier), la colonne résiste (fraction suivie, recul maximal en px). */
const RUBBER = 0.25
const RUBBER_MAX = 20

/**
 * Colonne des modes (0.23.0, carrousel **vertical**) : le mode actuel dans le cercle, les deux autres
 * au-dessus, dans l'ordre Public · Amis · Privé. Rien en dessous : la barre et le bord de l'écran (zone du
 * geste d'accueil d'iOS) n'en laissent pas la place.
 */
export function columnOrder(from: Visibility): Visibility[] {
  return [from, ...VISIBILITIES.filter((v) => v !== from)]
}

const indexIn = (from: Visibility, v: Visibility) => columnOrder(from).indexOf(v)
const clampIndex = (i: number) => Math.min(VISIBILITIES.length - 1, Math.max(0, i))

/**
 * Montée de la colonne quand le doigt a glissé de `dy` px (vers le bas : positif) : glisser vers le haut
 * fait descendre dans le cercle le symbole du dessus (« monter d'un mode »), redescendre le fait repartir.
 * La colonne résiste sous le premier mode et au-delà du dernier.
 */
export function columnLift(dy: number, step = MODE_STEP): number {
  const lift = -dy
  const max = (VISIBILITIES.length - 1) * step
  const resist = (over: number) => Math.min(RUBBER_MAX, over * RUBBER)
  if (lift < 0) return -resist(-lift)
  if (lift > max) return max + resist(lift - max)
  return lift
}

/** Mode dont le symbole est dans le cercle rouge, la colonne montée de `lift` px. */
export function visibilityAtLift(from: Visibility, lift: number, step = MODE_STEP): Visibility {
  return columnOrder(from)[clampIndex(Math.round(lift / step))]
}

/**
 * Position verticale du symbole `v` par rapport au centre du cercle (px, vers le bas : positif) :
 * au-dessus tant qu'il n'est pas choisi, dans le cercle quand il l'est, sous lui quand on monte au-delà.
 */
export function columnPosition(v: Visibility, from: Visibility, lift: number, step = MODE_STEP): number {
  return lift - indexIn(from, v) * step
}

/** Montée qui met le symbole `v` au centre du cercle (au relâchement). */
export function liftFor(v: Visibility, from: Visibility, step = MODE_STEP): number {
  return indexIn(from, v) * step
}

/**
 * Aspect d'un symbole selon sa distance au centre, en nombre d'écarts (négatif : au-dessus) : net et
 * grand dans le cercle, plus petit, flou et pâle au-dessus, effacé au-delà du voisin. Un symbole qui
 * passe sous le cercle s'efface vite (rien ne doit apparaître sur la barre).
 */
export function modeLook(distance: number): { opacity: number; blur: number; scale: number } {
  const d = Math.abs(distance)
  const near = Math.min(d, 1)
  const above = d <= 1 ? 1 - 0.2 * d : Math.max(0, 0.8 * (2 - d))
  return {
    opacity: distance > 0 ? Math.max(0, 1 - 2 * d) : above,
    blur: 2 * near,
    scale: 1 - 0.3 * near,
  }
}

/** Nom affiché à côté du cercle : plein quand le symbole est centré, effacé à mi-chemin. */
export function labelOpacity(distance: number): number {
  return Math.max(0, 1 - 2 * Math.abs(distance))
}

/** Mode voisin (clavier : flèches), sans boucler, dans l'ordre Public · Amis · Privé. */
export function neighborVisibility(v: Visibility, dir: 1 | -1): Visibility {
  return VISIBILITIES[clampIndex(VISIBILITIES.indexOf(v) + dir)]
}
