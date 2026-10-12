// Écrans voisins du viseur, ouverts en glissant le doigt (comme Snap) : le profil arrive par la
// droite quand on glisse vers la gauche (0.21.1), la carte par la gauche quand on glisse vers la
// droite (0.23.0). Sur la carte, glisser vers la gauche depuis le bord droit la referme.

/** Sens du doigt : `left` = de droite à gauche, `right` = de gauche à droite. */
export type SwipeDirection = 'left' | 'right'

/** Part de la largeur à parcourir pour que l'écran s'ouvre (ou se ferme) quand on lâche. */
export const OPEN_RATIO = 0.35
/** Vitesse (px/ms) d'un geste vif qui ouvre l'écran, même lâché tôt. */
export const OPEN_SPEED = 0.5
/** Durée (ms) de la fin du geste sur laquelle on mesure sa vitesse au lâcher. */
export const SPEED_WINDOW_MS = 100
/** Distance minimale (px) d'un geste vif. */
export const FLICK_MIN = 40
/** Déplacement (px) avant de décider du sens du geste. */
export const SLOP = 10
/** Durée de l'arrivée de l'écran, ou de son retour (ms). */
export const SLIDE_MS = 240
/**
 * Délai (ms) avant de préparer l'écran à ouvrir, caché : son premier affichage coûte 100 à 300 ms,
 * que le doigt ne doit pas attendre. Après le démarrage de la caméra, pour ne pas le ralentir.
 */
export const PREPARE_MS = 1500
/** Carte : bande (px) collée au bord droit d'où part le geste qui la referme ; ailleurs, le doigt déplace la carte. */
export const EDGE_BAND = 24

const sign = (dir: SwipeDirection) => (dir === 'left' ? -1 : 1)

/**
 * Sens du geste une fois le doigt parti : l'un des sens `allowed` (plus horizontal que vertical),
 * `other` sinon (le geste est laissé au reste de l'écran), null tant que le doigt a peu bougé.
 */
export function swipeIntent(
  dx: number,
  dy: number,
  allowed: readonly SwipeDirection[] = ['left'],
): SwipeDirection | 'other' | null {
  if (Math.hypot(dx, dy) < SLOP) return null
  if (Math.abs(dx) <= Math.abs(dy)) return 'other'
  const dir: SwipeDirection = dx < 0 ? 'left' : 'right'
  return allowed.includes(dir) ? dir : 'other'
}

/** Distance glissée dans le sens `dir` (px), bornée à la largeur de l'écran. */
export function swipeOffset(dx: number, width: number, dir: SwipeDirection = 'left'): number {
  return Math.min(Math.max(sign(dir) * dx, 0), Math.max(width, 0))
}

/**
 * Vitesse du doigt dans le sens `dir` (px/ms) au lâcher, mesurée sur ses dernières positions
 * (`SPEED_WINDOW_MS`) : un geste commencé lentement puis lancé compte comme vif.
 */
export function releaseSpeed(samples: readonly { x: number; t: number }[], dir: SwipeDirection = 'left'): number {
  const last = samples.at(-1)
  if (!last) return 0
  const first = samples.find((p) => last.t - p.t <= SPEED_WINDOW_MS) ?? last
  return first === last ? 0 : (sign(dir) * (last.x - first.x)) / Math.max(1, last.t - first.t)
}

/**
 * Lâché après `dx` px, le doigt allant dans le sens `dir` à `speed` px/ms : l'écran s'ouvre (assez
 * loin, ou geste assez vif).
 */
export function opensOnRelease(dx: number, speed: number, width: number, dir: SwipeDirection = 'left'): boolean {
  const distance = sign(dir) * dx
  if (distance <= 0 || width <= 0) return false
  return distance >= width * OPEN_RATIO || (distance >= FLICK_MIN && speed > OPEN_SPEED)
}

/** Le doigt est-il posé dans la bande du bord droit (`EDGE_BAND`) d'un écran qui va de `left` à `left + width` ? */
export function inRightEdge(x: number, left: number, width: number, band = EDGE_BAND): boolean {
  return x >= left + width - band && x <= left + width
}

/**
 * Éléments qui gardent leurs propres gestes : déclencheur (appui long puis glisser), barre du bas,
 * frise des photos du lieu, champs et réglettes, feuilles et fenêtres. Les piles de photos du viseur
 * arrêtent elles-mêmes le geste (`useCardSwipe`). Les autres boutons (rail…) ne servent qu'à l'appui :
 * le geste peut partir d'eux — le rail occupe justement le bord droit.
 */
export const OWN_GESTURES =
  'input, select, textarea, [role="slider"], .shutter-group, .bottom-nav, .home-timeline, [role="dialog"], [role="alertdialog"]'

/** Le geste peut partir de cet élément (décor, photo seule, boutons du rail, pastilles d'information). */
export function freeToSwipe(target: EventTarget | null): boolean {
  const el = target as { closest?: (selectors: string) => unknown } | null
  return !el?.closest?.(OWN_GESTURES)
}
