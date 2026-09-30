// Détection de la marche à partir de l'accéléromètre : on compte les pas.
//
// Même immobile, la position GPS d'un téléphone dérive de quelques mètres.
// Pour que les photos restent à leur place sans trembler, on ne suit ces
// variations que lorsqu'on marche vraiment. Chaque pas fait rebondir le
// téléphone verticalement (1 à 3 m/s²), à intervalles réguliers ; viser,
// lever ou tourner le téléphone produit des mouvements isolés ou lents, qui
// ne forment pas une suite de pas : ils ne comptent pas comme une marche.

import { dot, lerp3, norm, scale, sub, type Vec3 } from './math'
import type { CameraBasis } from './orientation'

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
  /** Longueur d'un pas (m), téléphone tenu devant soi : la position avance d'autant à chaque pas. */
  stepLength: 0.65,
  /**
   * Mémoire de la vitesse horizontale intégrée (s) : assez longue pour garder l'élan des
   * premiers pas (qui dit si l'on avance, recule ou marche de côté), assez courte pour
   * oublier les petits gestes de la main.
   */
  velocityWindow: 1.5,
  /** Élan minimal (m/s) des premiers pas pour en tirer une direction ; en deçà : droit devant. */
  minDirectionSpeed: 0.15,
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
  /**
   * Vitesse horizontale intégrée (m/s), dans le repère de l'objectif : `vf` vers l'avant
   * (là où vise la caméra), `vr` vers la droite de l'écran.
   */
  vf: number
  vr: number
  /** Somme des vitesses relevées aux premiers pas de la marche en cours. */
  push: [number, number]
  /** Direction de la marche en cours (repère de l'objectif, unitaire), fixée après `minSteps` pas. */
  direction: [number, number]
  /** Pas comptés dans des marches reconnues (au moins `minSteps` pas réguliers), depuis le début. */
  walked: number
}

const unit = (v: Vec3): Vec3 | null => {
  const l = norm(v)
  return l > 1e-3 ? scale(v, 1 / l) : null
}

/** Composante horizontale (perpendiculaire à la verticale `up`, unitaire) d'un axe du téléphone. */
const horizontal = (axis: Vec3, up: Vec3) => unit(sub(axis, scale(up, dot(axis, up))))

/**
 * Axes horizontaux de l'objectif dans le repère du téléphone (x à droite de l'écran, y vers
 * le haut de l'écran, z vers l'utilisateur) : l'avant est là où vise la caméra (−z) ; téléphone
 * presque à plat, c'est le haut de l'écran.
 */
function cameraAxes(up: Vec3): { forward: Vec3; right: Vec3 } | null {
  const lens: Vec3 = [0, 0, -1]
  const forward = Math.abs(dot(lens, up)) < 0.9 ? horizontal(lens, up) : horizontal([0, 1, 0], up)
  const right = horizontal([1, 0, 0], up)
  return forward && right ? { forward, right } : null
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

  // Vitesse horizontale : l'accélération intégrée, qui s'oublie en `velocityWindow` s.
  let vf = prev?.vf ?? 0
  let vr = prev?.vr ?? 0
  const axes = g > 1 ? cameraAxes(scale(gravity!, 1 / g)) : null
  const leak = Math.exp(-dt / MOTION.velocityWindow)
  vf = vf * leak + (axes ? dot(a, axes.forward) * dt : 0)
  vr = vr * leak + (axes ? dot(a, axes.right) * dt : 0)
  let push = prev?.push ?? [0, 0]
  let direction = prev?.direction ?? [1, 0]
  let walked = prev?.walked ?? 0

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
    // Les premiers pas donnent l'élan, donc le sens de la marche (en avant, en arrière, de côté).
    if (steps <= MOTION.minSteps) push = steps === 1 ? [vf, vr] : [push[0] + vf, push[1] + vr]
    if (steps === MOTION.minSteps) {
      const length = Math.hypot(push[0], push[1])
      direction = length / MOTION.minSteps >= MOTION.minDirectionSpeed ? [push[0] / length, push[1] / length] : [1, 0]
      // Marche reconnue : ses premiers pas comptent aussi.
      walked += MOTION.minSteps
    } else if (steps > MOTION.minSteps) {
      walked++
    }
  }
  return { gravity, vertical, armed, lastStep, steps, total, lastSample: s.t, vf, vr, push, direction, walked }
}

/** État de déplacement à l'instant `now` (ms, même horloge que les mesures). */
export function motionState(d: MotionDetector | null, now: number): MotionState {
  if (!d || now - d.lastSample > MOTION.stale) return 'unknown'
  if (d.steps < MOTION.minSteps) return 'still'
  const since = now - d.lastStep
  return since <= MOTION.maxStepGap ? 'moving' : since <= MOTION.settle ? 'settling' : 'still'
}

/**
 * Sens de la marche sur le terrain (Est, Nord, unitaire) : `direction` (repère de l'objectif,
 * voir `MotionDetector`) tourné selon l'orientation actuelle du téléphone. Téléphone presque
 * à plat, l'avant est le haut de l'écran, comme pour le détecteur.
 */
export function stepDirection(basis: CameraBasis, [f, r]: readonly [number, number]): [number, number] | null {
  const ground = (v: Vec3) => {
    const l = Math.hypot(v[0], v[1])
    return l > 1e-3 ? [v[0] / l, v[1] / l] : null
  }
  const forward = Math.abs(basis.f[2]) < 0.9 ? ground(basis.f) : ground(basis.u)
  const right = ground(basis.r)
  if (!forward || !right) return null
  const e = f * forward[0] + r * right[0]
  const n = f * forward[1] + r * right[1]
  const l = Math.hypot(e, n)
  return l > 1e-3 ? [e / l, n / l] : null
}

/**
 * Convention de signe de l'accéléromètre : +1 s'il suit la norme (au repos, l'accélération
 * « pesanteur comprise » pointe vers le haut), −1 s'il est inversé (certains navigateurs), null
 * si l'orientation ne permet pas de trancher. Le sens de la marche tiré de l'élan s'inverse avec
 * lui, alors que le comptage des pas n'en dépend pas. `basis` : orientation de l'objectif, écran
 * en portrait (x de l'écran = `r`, y = `u`, z = −`f`) ; `gravity` : pesanteur mesurée par le détecteur.
 */
export function accelerometerSign(basis: CameraBasis, gravity: Vec3 | null): 1 | -1 | null {
  const g = gravity ? norm(gravity) : 0
  if (g < 1) return null
  // Verticale (vers le haut) exprimée dans le repère du téléphone.
  const up: Vec3 = [basis.r[2], basis.u[2], -basis.f[2]]
  const agreement = dot(gravity!, up) / g
  return agreement > 0.5 ? 1 : agreement < -0.5 ? -1 : null
}
