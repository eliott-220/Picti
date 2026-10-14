// Tutoriel du premier lancement (0.22.0) : l'utilisateur prend une photo d'essai, se tourne
// jusqu'à ce qu'elle sorte de l'écran, puis la retrouve. Il ne se déplace pas : seule compte la
// rotation du téléphone depuis la prise (ARKit ou gyroscope), jamais le GPS ni la boussole —
// souvent faux à l'intérieur, chez soi.

import { angleDiffDeg, DEG, dot } from './math'
import type { ViewportCamera } from './optics'
import { anglesFromBasis, type CameraBasis } from './orientation'
import { VIEW_HEADING_TOLERANCE, VIEW_PITCH_TOLERANCE } from './views'

export const TUTORIAL = {
  /** La plaque est sortie de l'écran quand l'écart dépasse le demi-champ de cette marge (°). */
  offViewMargin: 10,
  /** Écarts tolérés pour capturer (°) : ceux d'une même vue (`sameView`), comme une vraie photo. */
  heading: VIEW_HEADING_TOLERANCE,
  pitch: VIEW_PITCH_TOLERANCE,
  /**
   * Rythme des vibrations (ms entre deux) : lent loin de la plaque, rapide dessus ; jamais moins de 120 ms
   * (0.24.0 : mêmes impulsions en chasse et en Reproduire ; 110 ms avant).
   */
  pulseSlow: 900,
  pulseFast: 120,
  /** Sous ce niveau d'alignement, pas de vibration. */
  pulseFrom: 0.08,
  /** Plaque loin de l'alignement : floue (px à l'écran) et pâle ; dessus : nette et presque opaque. */
  maxBlur: 10,
  minOpacity: 0.35,
  maxOpacity: 0.95,
}

/** Écart (°) de la caméra actuelle avec celle de la prise : > 0 → tourner à droite / lever. */
export interface RelativeError {
  heading: number
  pitch: number
}

export function relativeError(shot: CameraBasis, now: CameraBasis): RelativeError {
  const target = anglesFromBasis(shot)
  const current = anglesFromBasis(now)
  return { heading: angleDiffDeg(current.heading, target.heading), pitch: target.pitch - current.pitch }
}

/**
 * Où se trouve la plaque dans l'image actuelle (°) : `x` > 0 à droite, `y` > 0 en haut ; au-delà de
 * 90°, elle est derrière. La plaque est accrochée dans l'axe de la prise de vue.
 */
export function plateOffset(shot: CameraBasis, now: CameraBasis): { x: number; y: number } {
  const z = dot(shot.f, now.f)
  return { x: Math.atan2(dot(shot.f, now.r), z) / DEG, y: Math.atan2(dot(shot.f, now.u), z) / DEG }
}

/** Demi-champs (°) de la vue affichée à l'écran. */
export function halfField(cam: ViewportCamera): { x: number; y: number } {
  return { x: Math.atan(cam.width / 2 / cam.focal) / DEG, y: Math.atan(cam.height / 2 / cam.focal) / DEG }
}

/** Étape 2 → 3 : la plaque est entièrement hors champ (écart > demi-champ + 10°, sur l'un des axes). */
export function plateOffView(offset: { x: number; y: number }, half: { x: number; y: number }, margin = TUTORIAL.offViewMargin): boolean {
  return Math.abs(offset.x) > half.x + margin || Math.abs(offset.y) > half.y + margin
}

/**
 * Le centre de la plaque est à l'écran : en portrait, le demi-champ horizontal (~17°) est plus
 * étroit que la tolérance de cap (20°) — on ne capture pas une plaque qu'on ne voit presque plus.
 */
export function plateInView(offset: { x: number; y: number }, half: { x: number; y: number }): boolean {
  return Math.abs(offset.x) <= half.x && Math.abs(offset.y) <= half.y
}

/**
 * Niveau d'alignement sur la plaque, de 0 à 1 : 1 dessus, ½ à la limite des tolérances de capture,
 * quasi nul au-delà de deux fois. Il règle la netteté, l'opacité et le rythme des vibrations.
 */
export function alignmentLevel(err: RelativeError): number {
  const e2 = (err.heading / TUTORIAL.heading) ** 2 + (err.pitch / TUTORIAL.pitch) ** 2
  return Math.exp(-Math.LN2 * e2)
}

/** « Capturer » s'active : cap à ±20° et inclinaison à ±15° de la prise. */
export const canCaptureRelative = (err: RelativeError): boolean =>
  Math.abs(err.heading) <= TUTORIAL.heading && Math.abs(err.pitch) <= TUTORIAL.pitch

/** Aspect de la plaque selon l'alignement : opacité et flou (px à l'écran). */
export function plateLook(level: number): { opacity: number; blur: number } {
  const l = Math.min(1, Math.max(0, level))
  return {
    opacity: TUTORIAL.minOpacity + (TUTORIAL.maxOpacity - TUTORIAL.minOpacity) * l,
    blur: TUTORIAL.maxBlur * (1 - l),
  }
}

/**
 * Intervalle entre deux vibrations (ms), qui se rapprochent en s'alignant (progression
 * géométrique, comme un compteur Geiger) ; null : trop loin, pas de vibration.
 */
export function pulseInterval(level: number): number | null {
  if (!(level >= TUTORIAL.pulseFrom)) return null
  const l = Math.min(1, level)
  return Math.round(TUTORIAL.pulseSlow * (TUTORIAL.pulseFast / TUTORIAL.pulseSlow) ** l)
}

/**
 * Prochaine impulsion d'alignement (tutoriel, chasse, Reproduire) : intervalle (ms, jamais sous
 * `TUTORIAL.pulseFast`) et force — `tick` loin, `strong` au-delà de la moitié ; null : pas de vibration.
 */
export function alignmentPulse(level: number): { gap: number; kind: 'tick' | 'strong' } | null {
  const interval = pulseInterval(level)
  if (interval == null) return null
  return { gap: Math.max(TUTORIAL.pulseFast, interval), kind: level >= 0.5 ? 'strong' : 'tick' }
}
