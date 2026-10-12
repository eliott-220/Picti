// Double appui sur l'image du viseur = caméra arrière ↔ avant (0.23.0, comme Snap ou Instagram) : il
// remplace le bouton selfie. Jamais de photo, et rien depuis les boutons, les photos ou les feuilles.

/** Délai maximal entre deux appuis (fin de l'un, fin de l'autre) (ms). */
export const DOUBLE_TAP_MS = 300
/** Distance maximale entre les deux appuis (px). */
export const DOUBLE_TAP_PX = 30
/** Un appui : doigt levé vite (ms)… */
export const TAP_MAX_MS = 250
/** … sans avoir bougé (px) : sinon c'est un glissement. */
export const TAP_SLOP_PX = 10

export interface TapPoint {
  x: number
  y: number
  /** Instant (ms). */
  t: number
}

/** Doigt posé en `down`, levé en `up` : est-ce un appui (court, presque immobile) ? */
export function isTap(down: TapPoint, up: TapPoint): boolean {
  return up.t - down.t <= TAP_MAX_MS && Math.hypot(up.x - down.x, up.y - down.y) <= TAP_SLOP_PX
}

/** `next` fait-il un double appui avec l'appui précédent `previous` (assez tôt, assez près) ? */
export function isDoubleTap(previous: TapPoint | null, next: TapPoint): boolean {
  if (!previous) return false
  const dt = next.t - previous.t
  return dt > 0 && dt <= DOUBLE_TAP_MS && Math.hypot(next.x - previous.x, next.y - previous.y) <= DOUBLE_TAP_PX
}

/**
 * Ce qui garde son propre appui : boutons (bouton rouge, rail, pastilles, frise), photos posées dans
 * le décor (un appui sur une photo reste prioritaire), champs, feuilles et fenêtres.
 */
export const NO_DOUBLE_TAP =
  'button, a, input, select, textarea, label, [role="button"], [role="slider"], [role="dialog"], [role="alertdialog"], .shutter-group, .bottom-nav, .rail, .sensor-status, .home-timeline, .overlay-photo.clickable, .capture-card'

/** Un double appui peut-il partir de cet élément (l'image elle-même, le décor) ? */
export function doubleTapAllowed(target: EventTarget | null): boolean {
  const el = target as { closest?: (selectors: string) => unknown } | null
  return !el?.closest?.(NO_DOUBLE_TAP)
}
