// Frise de la photo visée (0.24.2) : règles du geste, sans React. Plus de flèches : glisser le doigt à
// gauche / à droite change de photo dans la pile du lieu ; sur le viseur, glisser vers le bas range la
// frise en vignette (image seule) en bas à droite, symétrique du Menu 4 carrés. Voir `useTimelineGesture`.

import { clamp } from '../geo/math'

/** Déplacement (px) au-delà duquel le sens du geste est décidé, une fois pour toutes. */
export const AXIS_LOCK_PX = 8
/** Glissé horizontal (px) qui change de photo au lâcher… */
export const STEP_DISTANCE = 56
/** … ou geste vif : vitesse (px/ms) et distance minimale (px). */
export const STEP_SPEED = 0.35
export const STEP_FLICK_PX = 20
/** Part du trajet vers la vignette au-delà de laquelle la frise lâchée se range. */
export const COLLAPSE_AT = 1 / 3
/** Geste vif vers le bas : vitesse (px/ms) et distance minimale (px). */
export const COLLAPSE_SPEED = 0.5
export const COLLAPSE_FLICK_PX = 16
/** Trajet minimal (px) du glissé vers le bas, même si la vignette est presque à la hauteur de la frise. */
export const MIN_TRAVEL = 60
/** Arrondis (px) de la frise et de la vignette : les mêmes que `.timeline` et `.timeline-mini` (styles.css). */
export const TIMELINE_RADIUS = 28
export const MINI_RADIUS = 12
/** Mesure de la vitesse au lâcher : derniers relevés (ms). */
export const SPEED_WINDOW_MS = 100

/** Le contenu suit le doigt de cette part : léger déplacement. */
const FOLLOW = 0.6
/** Résistance au bout de la pile : déplacement maximal (px). */
const EDGE_STRETCH = 32

/** Sens décidé : changer de photo, réduire, ou rien (vers le haut, pile d'une photo…). */
export type TimelineAxis = 'x' | 'down' | 'none'

/** Rectangle à l'écran (px). */
export interface Box {
  left: number
  top: number
  width: number
  height: number
}

/**
 * Sens du geste dès les premiers pixels (`null` : pas encore décidé). Horizontal : changer de photo (pile de
 * plus d'une photo) ; vers le bas : réduire (viseur) ; vers le haut : rien.
 */
export function lockAxis(dx: number, dy: number, { canStep, canCollapse }: { canStep: boolean; canCollapse: boolean }): TimelineAxis | null {
  if (Math.hypot(dx, dy) < AXIS_LOCK_PX) return null
  if (Math.abs(dx) > Math.abs(dy)) return canStep ? 'x' : 'none'
  return dy > 0 && canCollapse ? 'down' : 'none'
}

/** Pas demandé par un glissé horizontal : vers la gauche → +1 (suivante), vers la droite → −1 (précédente). */
export const stepOf = (dx: number): 1 | -1 => (dx < 0 ? 1 : -1)

/** Le pas mène à une photo de la pile (pas de boucle aux extrémités). */
export function canStepTo(index: number, count: number, step: 1 | -1): boolean {
  const to = index + step
  return to >= 0 && to < count
}

/** Déplacement du contenu sous le doigt : léger ; au bout de la pile, petite résistance élastique. */
export function slideOffset(dx: number, index: number, count: number): number {
  if (dx === 0) return 0
  if (canStepTo(index, count, stepOf(dx))) return dx * FOLLOW
  return Math.sign(dx) * EDGE_STRETCH * (1 - Math.exp(-Math.abs(dx) / (EDGE_STRETCH * 2)))
}

/** Opacité du contenu pendant le glissé : il s'efface un peu en s'éloignant. */
export function slideOpacity(offset: number): number {
  return 1 - Math.min(1, Math.abs(offset) / 160) * 0.7
}

/** Lâché : le pas à faire (assez loin, ou geste vif dans le même sens), sinon `null` (retour en place). */
export function releaseStep(dx: number, speed: number, index: number, count: number): 1 | -1 | null {
  if (dx === 0) return null
  const step = stepOf(dx)
  if (!canStepTo(index, count, step)) return null
  const far = Math.abs(dx) >= STEP_DISTANCE
  const flick = Math.abs(dx) >= STEP_FLICK_PX && Math.abs(speed) >= STEP_SPEED && Math.sign(speed) === Math.sign(dx)
  return far || flick ? step : null
}

/** Vitesse (px/ms, signée) sur les derniers relevés `{ v, t }` (position, instant). */
export function speedOf(samples: readonly { v: number; t: number }[], windowMs = SPEED_WINDOW_MS): number {
  if (samples.length < 2) return 0
  const last = samples[samples.length - 1]
  const first = samples.find((s) => last.t - s.t <= windowMs) ?? samples[0]
  const dt = last.t - first.t
  return dt > 0 ? (last.v - first.v) / dt : 0
}

/** Trajet du doigt (px) pour une réduction complète : du centre de la frise au centre de la vignette. */
export function collapseTravel(from: Box, to: Box): number {
  return Math.max(MIN_TRAVEL, to.top + to.height / 2 - (from.top + from.height / 2))
}

/** Avancement de la réduction (0 dépliée → 1 vignette) pour un glissé de `dy` px vers le bas. */
export function collapseProgress(dy: number, travel: number): number {
  return clamp(dy / travel, 0, 1)
}

/** Lâchée : la frise finit de se ranger (au-delà d'un tiers du trajet, ou geste vif vers le bas). */
export function releaseCollapse(progress: number, speedY: number, dy: number): boolean {
  return progress >= COLLAPSE_AT || (speedY >= COLLAPSE_SPEED && dy >= COLLAPSE_FLICK_PX)
}

/** Aspect de la frise pendant sa réduction. */
export interface CollapseFrame {
  /** Décalage vertical de la frise (px). */
  y: number
  /** Partie visible, dans le repère de la frise : retraits haut, droite, bas, gauche (px). */
  inset: [number, number, number, number]
  /** Arrondi de la partie visible (px). */
  radius: number
  /** Opacité des infos (miniature, date, auteur, distance, like, bouton). */
  info: number
  /** Opacité de l'image qui remplit la partie visible. */
  image: number
  /** Liseré blanc de la vignette (0 → 1). */
  edge: number
  /** Opacité de l'ensemble (1 ; « Réduire les animations » : simple fondu). */
  opacity: number
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t
/** 0 avant `a`, 1 après `b`, en douceur entre les deux. */
const smooth = (a: number, b: number, t: number) => {
  const x = clamp((t - a) / (b - a), 0, 1)
  return x * x * (3 - 2 * x)
}

/**
 * Frise à l'avancement `p` de sa réduction : la partie visible passe du rectangle de la frise (`from`) à
 * celui de la vignette (`to`, coin bas droit) — elle descend avec le doigt (décalage vertical) et se resserre
 * vers la droite (découpe) ; les infos s'effacent pendant que l'image de la photo visée la remplit, liseré
 * blanc compris : à `p = 1`, c'est exactement la vignette. `reduce` (« Réduire les animations ») : la frise ne
 * bouge pas, elle s'efface.
 */
export function collapseFrame(p: number, from: Box, to: Box, reduce = false): CollapseFrame {
  if (reduce) {
    return { y: 0, inset: [0, 0, 0, 0], radius: TIMELINE_RADIUS, info: 1, image: 0, edge: 0, opacity: 1 - p }
  }
  // Vignette dans le repère de la frise (non déplacée).
  const left = to.left - from.left
  const top = to.top - from.top
  // Le bas de la partie visible suit le décalage : la découpe du bas reste nulle.
  const y = p * (top + to.height - from.height)
  return {
    y,
    inset: [
      Math.max(0, p * (from.height - to.height)),
      Math.max(0, p * (from.width - (left + to.width))),
      0,
      Math.max(0, p * left),
    ],
    radius: lerp(TIMELINE_RADIUS, MINI_RADIUS, p),
    info: 1 - smooth(0, 0.55, p),
    image: smooth(0.15, 0.75, p),
    edge: smooth(0.5, 1, p),
    opacity: 1,
  }
}
