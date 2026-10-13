// Bouton rouge de la barre (0.23.3) : sur le viseur, rond rouge et symbole du mode ; ailleurs, appareil
// photo seul, comme les autres pictogrammes. Aspect de chaque calque selon `away` (0 viseur → 1 ailleurs,
// `--away` de la barre) — les mêmes formules que `.nav-shutter` dans styles.css, pour le natif d'iOS 26.

/** Opacité, échelle et rotation (degrés) d'un calque. */
export interface Look {
  alpha: number
  scale: number
  angle: number
}

/**
 * Le rond rouge rétrécit et s'efface, le symbole du mode s'efface en tournant pendant que l'appareil photo
 * arrive en tournant dans l'autre sens. « Réduire les animations » : simple fondu.
 */
export function awayLook(away: number, reduceMotion = false): { disc: Look; mode: Look; camera: Look } {
  const a = Math.min(1, Math.max(0, Number.isFinite(away) ? away : 0))
  if (reduceMotion) {
    const fade = (alpha: number): Look => ({ alpha, scale: 1, angle: 0 })
    return { disc: fade(1 - a), mode: fade(1 - a), camera: fade(a) }
  }
  return {
    disc: { alpha: 1 - a, scale: 1 - 0.45 * a, angle: 0 },
    mode: { alpha: 1 - a, scale: 1 - 0.4 * a, angle: -45 * a + 0 },
    camera: { alpha: a, scale: 0.6 + 0.4 * a, angle: 45 * (1 - a) + 0 },
  }
}

/** `--away` d'un élément de la barre (hérité de `.bottom-nav`), 0 hors de la barre. */
export function readAway(el: Element | null): number {
  if (!el) return 0
  const v = parseFloat(getComputedStyle(el).getPropertyValue('--away'))
  return Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0
}

/** `--tab` de la barre (place de la bulle de l'onglet actif, 0.24.0) ; 2 (le bouton rouge) à défaut. */
export function readTab(el: Element | null): number {
  if (!el) return 2
  const v = parseFloat(getComputedStyle(el).getPropertyValue('--tab'))
  return Number.isFinite(v) ? v : 2
}
