// Glisser le doigt de droite à gauche sur le viseur pour ouvrir un écran (le profil), qui arrive
// par la droite en suivant le doigt : le pendant du retour par le bord gauche de l'app iOS.

/** Part de la largeur à parcourir pour que l'écran s'ouvre quand on lâche. */
export const OPEN_RATIO = 0.35
/** Vitesse (px/ms) d'un geste vif qui ouvre l'écran, même lâché tôt. */
export const OPEN_SPEED = 0.5
/** Durée (ms) de la fin du geste sur laquelle on mesure sa vitesse au lâcher. */
export const SPEED_WINDOW_MS = 100
/** Distance minimale (px) d'un geste vif. */
export const FLICK_MIN = 40
/** Déplacement (px) avant de décider du sens du geste. */
export const SLOP = 10
/** Durée de l'arrivée de l'écran, ou de son retour à droite (ms). */
export const SLIDE_MS = 240
/**
 * Délai (ms) avant de préparer l'écran à ouvrir, caché : son premier affichage coûte 100 à 300 ms,
 * que le doigt ne doit pas attendre. Après le démarrage de la caméra, pour ne pas le ralentir.
 */
export const PREPARE_MS = 1500

/**
 * Sens du geste une fois le doigt parti : `open` vers la gauche (plus horizontal que vertical),
 * `other` sinon (le geste est laissé au reste de l'écran), null tant que le doigt a peu bougé.
 */
export function swipeIntent(dx: number, dy: number): 'open' | 'other' | null {
  if (Math.hypot(dx, dy) < SLOP) return null
  return dx < 0 && -dx > Math.abs(dy) ? 'open' : 'other'
}

/** Distance glissée vers la gauche (px), bornée à la largeur de l'écran. */
export function swipeOffset(dx: number, width: number): number {
  return Math.min(Math.max(-dx, 0), Math.max(width, 0))
}

/**
 * Vitesse du doigt vers la gauche (px/ms) au lâcher, mesurée sur ses dernières positions
 * (`SPEED_WINDOW_MS`) : un geste commencé lentement puis lancé compte comme vif.
 */
export function releaseSpeed(samples: readonly { x: number; t: number }[]): number {
  const last = samples.at(-1)
  if (!last) return 0
  const first = samples.find((p) => last.t - p.t <= SPEED_WINDOW_MS) ?? last
  return first === last ? 0 : (first.x - last.x) / Math.max(1, last.t - first.t)
}

/**
 * Lâché après `dx` px, le doigt allant vers la gauche à `speed` px/ms : l'écran s'ouvre (assez loin,
 * ou geste assez vif).
 */
export function opensOnRelease(dx: number, speed: number, width: number): boolean {
  const distance = -dx
  if (distance <= 0 || width <= 0) return false
  return distance >= width * OPEN_RATIO || (distance >= FLICK_MIN && speed > OPEN_SPEED)
}

/**
 * Éléments qui gardent leurs propres gestes : déclencheur (appui long puis glisser), frise des photos
 * du lieu, champs et réglettes, feuilles et fenêtres. Les piles de photos du viseur arrêtent
 * elles-mêmes le geste (`useCardSwipe`). Les autres boutons (rail, menu…) ne servent qu'à l'appui :
 * le geste peut partir d'eux — le rail occupe justement le bord droit.
 */
export const OWN_GESTURES =
  'input, select, textarea, [role="slider"], .shutter-group, .home-timeline, [role="dialog"], [role="alertdialog"]'

/** Le geste peut partir de cet élément (décor, photo seule, boutons du rail, pastilles d'information). */
export function freeToSwipe(target: EventTarget | null): boolean {
  const el = target as { closest?: (selectors: string) => unknown } | null
  return !el?.closest?.(OWN_GESTURES)
}
