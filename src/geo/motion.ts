// Détection de la marche à partir de l'accéléromètre : on compte les pas.
//
// Même immobile, la position GPS d'un téléphone dérive de quelques mètres.
// Pour que les photos restent à leur place sans trembler, on ne suit ces
// variations que lorsqu'on marche vraiment. Chaque pas fait rebondir le
// téléphone verticalement (1 à 3 m/s²), à intervalles réguliers ; viser,
// lever ou tourner le téléphone produit des mouvements isolés ou lents, qui
// ne forment pas une suite de pas : ils ne comptent pas comme une marche.

import { dot, lerp3, norm, sub, type Vec3 } from './math'

/**
 * - `moving` : on marche ;
 * - `settling` : on vient de s'arrêter, le GPS rattrape son retard ;
 * - `still` : immobile ;
 * - `unknown` : pas d'accéléromètre.
 */
export type MotionState = 'moving' | 'settling' | 'still' | 'unknown'

export const MOTION = {
  /** Rebond vertical (m/s²) qui compte comme un pas… */
  stepPeak: 0.5,
  /** …une fois l'accélération redescendue sous ce seuil depuis le pas précédent. */
  stepReset: -0.1,
  /** Intervalle entre deux pas (ms) : plus court, c'est une secousse ; plus long, la marche s'est arrêtée. */
  minStepGap: 250,
  maxStepGap: 1200,
  /** Pas réguliers à partir desquels on marche : un geste isolé n'est pas une marche. */
  minSteps: 3,
  /** Lissage de l'accélération verticale (s). */
  smoothing: 0.04,
  /** Après le dernier pas, le GPS rattrape son retard pendant ce temps (ms). */
  settle: 4000,
  /** Sans mesure depuis ce délai (ms), l'accéléromètre est considéré absent. */
  stale: 1000,
  /** Durée d'estimation de la pesanteur (s), quand le capteur ne la retire pas lui-même. */
  gravityWindow: 1,
}

export interface MotionSample {
  /** Accélération propre, pesanteur retirée (m/s²), si le capteur la fournit. */
  acceleration: Vec3 | null
  /** Accélération pesanteur comprise (m/s²). */
  withGravity: Vec3 | null
  /** Instant de la mesure (ms). */
  t: number
}

export interface MotionDetector {
  /** Pesanteur estimée, quand seule l'accélération brute est disponible. */
  gravity: Vec3 | null
  /** Accélération verticale lissée (m/s², positive vers le haut). */
  vertical: number
  /** L'accélération est redescendue depuis le dernier pas : le suivant peut compter. */
  armed: boolean
  /** Instant du dernier pas (ms). */
  lastStep: number
  /** Pas réguliers consécutifs. */
  steps: number
  /** Nombre total de pas comptés. */
  total: number
  /** Instant de la dernière mesure (ms). */
  lastSample: number
}

/** Intègre une mesure de l'accéléromètre. */
export function feedMotion(prev: MotionDetector | null, s: MotionSample): MotionDetector | null {
  const dt = prev ? Math.min(0.2, Math.max(0, (s.t - prev.lastSample) / 1000)) : 0
  let gravity = prev?.gravity ?? null
  let a: Vec3
  if (s.acceleration) {
    a = s.acceleration
    if (s.withGravity) gravity = sub(s.withGravity, s.acceleration)
  } else if (s.withGravity) {
    gravity = gravity ? lerp3(gravity, s.withGravity, 1 - Math.exp(-dt / MOTION.gravityWindow)) : s.withGravity
    a = sub(s.withGravity, gravity)
  } else {
    return prev
  }
  // Composante verticale : la marche fait rebondir le téléphone, tourner sur soi-même le
  // déplace surtout à l'horizontale. Sans pesanteur connue, on le suppose tenu droit.
  const g = gravity ? norm(gravity) : 0
  const up = g > 1 ? dot(a, gravity!) / g : a[1]
  const vertical = prev ? prev.vertical + (up - prev.vertical) * (1 - Math.exp(-dt / MOTION.smoothing)) : 0

  let armed = prev?.armed ?? true
  let lastStep = prev?.lastStep ?? -Infinity
  let steps = prev?.steps ?? 0
  let total = prev?.total ?? 0
  // Prêt pour le pas suivant : l'accélération est redescendue, ou la marche s'était arrêtée.
  if (vertical < MOTION.stepReset || s.t - lastStep > MOTION.maxStepGap) armed = true
  if (armed && vertical > MOTION.stepPeak && s.t - lastStep >= MOTION.minStepGap) {
    steps = s.t - lastStep <= MOTION.maxStepGap ? steps + 1 : 1
    lastStep = s.t
    armed = false
    total++
  }
  return { gravity, vertical, armed, lastStep, steps, total, lastSample: s.t }
}

/** État de déplacement à l'instant `now` (ms, même horloge que les mesures). */
export function motionState(d: MotionDetector | null, now: number): MotionState {
  if (!d || now - d.lastSample > MOTION.stale) return 'unknown'
  if (d.steps < MOTION.minSteps) return 'still'
  const since = now - d.lastStep
  return since <= MOTION.maxStepGap ? 'moving' : since <= MOTION.settle ? 'settling' : 'still'
}
