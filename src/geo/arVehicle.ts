// Suivi visuel dans un véhicule (voiture, bus, tram) : ARKit suit l'intérieur du véhicule, pas la
// Terre — sa position reste immobile pendant que le GPS file, et son cap tourne n'importe comment
// (vu sur l'iPhone d'Eliott le 09/10 : 50 m à 15-20 km/h, ARKit immobile à 40 cm près, un faux
// demi-tour). Le calage n'a alors plus de sens : on revient au GPS et à la boussole, et l'on repart
// d'un calage neuf une fois redescendu. À vélo ou en courant, la caméra voit défiler le décor :
// ARKit avance avec le GPS, rien ne change.

export const VEHICLE = {
  /** Fenêtre d'observation (ms). */
  window: 10_000,
  /** Vitesse du GPS (m/s) au-delà de laquelle on se déplace plus vite qu'à pied. */
  fastSpeed: 2.5,
  /** Relevés rapides d'affilée pour entrer en mode véhicule. */
  fastFixes: 3,
  /** Déplacement du GPS (m) dans la fenêtre, et part minimale que le suivi visuel doit en faire. */
  minGpsMove: 20,
  minArShare: 0.3,
  /** Pour en sortir : à pied (vitesse sous ce seuil) pendant … ms. */
  slowSpeed: 1.5,
  exitAfter: 8_000,
}

/** Relevé GPS (ENU autour d'un point fixe, m) et position de la caméra au même instant (repère local). */
export interface MotionSample {
  t: number
  /** Position GPS (m). */
  e: number
  n: number
  /** Vitesse du GPS (m/s), null si inconnue. */
  speed: number | null
  /** Position du suivi visuel (repère local, m), null s'il ne suivait pas. */
  q: readonly [number, number] | null
}

export interface VehicleState {
  inVehicle: boolean
  /** Depuis quand on roule lentement (ms), pour sortir du mode véhicule. */
  slowSince: number | null
}

export const ON_FOOT: VehicleState = { inVehicle: false, slowSince: null }

/**
 * Met à jour l'état « dans un véhicule » d'après les relevés récents (triés, le dernier = maintenant).
 * Entrée : plusieurs relevés rapides d'affilée ET le suivi visuel ne fait pas le chemin du GPS.
 * Sortie : retour à une vitesse de marche, tenue `exitAfter` ms.
 */
export function updateVehicle(prev: VehicleState, samples: readonly MotionSample[]): VehicleState {
  const last = samples[samples.length - 1]
  if (!last) return prev
  if (prev.inVehicle) {
    const slow = last.speed != null && last.speed < VEHICLE.slowSpeed
    if (!slow) return { inVehicle: true, slowSince: null }
    const slowSince = prev.slowSince ?? last.t
    return last.t - slowSince >= VEHICLE.exitAfter ? ON_FOOT : { inVehicle: true, slowSince }
  }
  const recent = samples.filter((s) => last.t - s.t <= VEHICLE.window)
  const fast = recent.slice(-VEHICLE.fastFixes)
  if (fast.length < VEHICLE.fastFixes || !fast.every((s) => s.speed != null && s.speed > VEHICLE.fastSpeed)) return prev
  const first = recent[0]
  const gpsMove = Math.hypot(last.e - first.e, last.n - first.n)
  if (gpsMove < VEHICLE.minGpsMove) return prev
  // Le suivi visuel a-t-il fait le même chemin ? (Il ne suivait pas : on ne peut pas le savoir.)
  if (!first.q || !last.q) return prev
  const arMove = Math.hypot(last.q[0] - first.q[0], last.q[1] - first.q[1])
  return arMove < VEHICLE.minArShare * gpsMove ? { inVehicle: true, slowSince: null } : prev
}
