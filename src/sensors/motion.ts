// Accéléromètre partagé par toute l'app : dit si le spectateur marche ou
// se tient immobile (voir `geo/motion.ts`). Sur iPhone, il n'envoie rien
// tant que l'accès « mouvement et orientation » (celui de la boussole)
// n'est pas accordé : l'état reste alors inconnu.

import { feedMotion, motionState, type MotionDetector, type MotionState } from '../geo/motion'

let detector: MotionDetector | null = null
let users = 0

const vec = (v: DeviceMotionEventAcceleration | null) =>
  v && v.x != null && v.y != null && v.z != null ? ([v.x, v.y, v.z] as const) : null

function onMotion(e: DeviceMotionEvent) {
  detector = feedMotion(detector, {
    acceleration: vec(e.acceleration),
    withGravity: vec(e.accelerationIncludingGravity),
    t: performance.now(),
  })
}

/** Écoute l'accéléromètre tant qu'un écran en a besoin ; renvoie de quoi arrêter. */
export function watchMotion(): () => void {
  if (typeof window === 'undefined' || !('DeviceMotionEvent' in window)) return () => {}
  if (users++ === 0) window.addEventListener('devicemotion', onMotion)
  let released = false
  return () => {
    if (released) return
    released = true
    if (--users === 0) {
      window.removeEventListener('devicemotion', onMotion)
      detector = null
    }
  }
}

/** Le spectateur marche-t-il en ce moment ? */
export function currentMotion(): MotionState {
  return motionState(detector, performance.now())
}

/**
 * Pas comptés depuis le début (marches reconnues seulement), sens de la marche en cours dans
 * le repère de l'objectif (avant, droite) et pesanteur mesurée ; null sans accéléromètre.
 */
export function walkedSteps() {
  return detector ? { walked: detector.walked, direction: detector.direction, gravity: detector.gravity } : null
}
