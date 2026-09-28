// Détection de la marche à partir de l'accéléromètre.
//
// Même immobile, la position GPS d'un téléphone dérive de quelques mètres.
// Pour que les photos restent à leur place sans trembler, on ne suit ces
// variations que lorsqu'on se déplace vraiment : chaque pas secoue le
// téléphone (1 à 3 m/s²), la main seule presque pas (moins de 0,2 m/s²).

import { dot, lerp3, norm, sub, type Vec3 } from './math'

/**
 * - `moving` : on marche ;
 * - `settling` : on vient de s'arrêter, le GPS rattrape son retard ;
 * - `still` : immobile ;
 * - `unknown` : pas d'accéléromètre.
 */
export type MotionState = 'moving' | 'settling' | 'still' | 'unknown'

export const MOTION = {
  /** Agitation (valeur efficace de l'accélération propre, m/s²) au-delà de laquelle on marche. */
  threshold: 0.35,
  /** Durée d'observation de l'agitation (s). */
  window: 0.25,
  /** Entre deux pas, on marche toujours (ms). */
  stepGap: 400,
  /** Après le dernier pas, le GPS rattrape son retard pendant ce temps (ms). */
  settle: 2000,
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
  /** Moyenne glissante du carré de l'accélération propre (m²/s⁴). */
  energy: number
  /** Dernier instant où le téléphone était agité (ms). */
  lastMove: number
  /** Instant de la dernière mesure (ms). */
  lastSample: number
}

/**
 * Intègre une mesure de l'accéléromètre. On n'en garde que la composante
 * verticale : la marche fait rebondir le téléphone, alors que tourner sur
 * soi-même pour regarder autour de soi le déplace surtout à l'horizontale.
 */
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
  const g = gravity ? norm(gravity) : 0
  const shake = g > 1 ? dot(a, gravity!) ** 2 / (g * g) : dot(a, a)
  const energy = prev ? prev.energy + (shake - prev.energy) * (1 - Math.exp(-dt / MOTION.window)) : 0
  return {
    gravity,
    energy,
    lastMove: Math.sqrt(energy) > MOTION.threshold ? s.t : (prev?.lastMove ?? -Infinity),
    lastSample: s.t,
  }
}

/** État de déplacement à l'instant `now` (ms, même horloge que les mesures). */
export function motionState(d: MotionDetector | null, now: number): MotionState {
  if (!d || now - d.lastSample > MOTION.stale) return 'unknown'
  const since = now - d.lastMove
  return since <= MOTION.stepGap ? 'moving' : since <= MOTION.settle ? 'settling' : 'still'
}
