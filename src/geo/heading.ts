// Nord de la boussole, recalé lentement sur le gyroscope (iPhone).
//
// Sur iPhone, l'angle alpha de DeviceOrientation vient du gyroscope : il suit
// les mouvements sans retard, mais par rapport à une direction arbitraire. La
// boussole (webkitCompassHeading) donne le nord, mais avec du bruit et du
// retard quand on tourne : s'y fier à chaque instant fait traîner les photos
// derrière le téléphone (elles « suivent la caméra »), puis revenir. On garde
// donc les mouvements du gyroscope et on ne corrige son écart avec le nord que
// lentement, quand le téléphone tourne peu et que l'objectif vise à peu près
// l'horizon (à plat, la boussole ne donne plus le cap de l'objectif).

import { angleDiffDeg, normalizeDeg } from './math'

export const NORTH = {
  /** Constante de temps du recalage sur la boussole (ms), téléphone stable. */
  tau: 2000,
  /** Recalage rapide (ms) : au démarrage, ou quand un grand écart persiste. */
  fastTau: 200,
  /** Durée du démarrage (ms). */
  warmup: 1000,
  /** Sans mesure depuis ce délai (ms : app en arrière-plan), on repart comme au démarrage. */
  maxGap: 1000,
  /**
   * Écart (°) qui, s'il persiste `bigErrorMs` téléphone stable, est recalé vite (boussole
   * recalibrée, repère du gyroscope changé), jusqu'à passer sous `smallError`.
   */
  bigError: 20,
  bigErrorMs: 2000,
  smallError: 1,
  /** Vitesse de rotation (°/s) au-delà de laquelle la boussole, en retard, n'est presque plus écoutée. */
  turnRate: 8,
  /** Lissage de la vitesse de rotation (ms). */
  rateSmoothing: 100,
  /** Inclinaison (°) de l'objectif au-delà de laquelle la boussole est ignorée (téléphone à plat, ciel). */
  maxPitch: 55,
  /** Précision (°) normale de la boussole ; moins précise, le recalage ralentit. */
  goodAccuracy: 15,
}

/** Correction à ajouter au cap du gyroscope pour obtenir le cap vrai (magnétique). */
export interface NorthState {
  /** Correction (°). */
  offset: number
  /** Première et dernière mesure (ms). */
  since: number
  t: number
  /** Cap du gyroscope à la dernière mesure (°). */
  gyro: number
  /** Vitesse de rotation lissée (°/s). */
  rate: number
  /** Depuis quand un grand écart persiste (ms), null sinon. */
  bigSince: number | null
  /** Recalage rapide en cours (grand écart persistant). */
  catching: boolean
}

export interface CompassReading {
  /** Cap de l'objectif d'après le gyroscope (°, référence arbitraire). */
  gyroHeading: number
  /** Cap de la boussole (°). */
  compass: number
  /** Précision annoncée (°) ; négative ou null : boussole à calibrer. */
  accuracy: number | null
  /** Inclinaison de l'objectif (°). */
  pitch: number
  /** Instant de la mesure (ms). */
  t: number
}

/** Intègre une mesure de la boussole. */
export function updateNorth(prev: NorthState | null, r: CompassReading): NorthState {
  const measured = angleDiffDeg(r.gyroHeading, r.compass)
  if (!prev) {
    return { offset: normalizeDeg(measured), since: r.t, t: r.t, gyro: r.gyroHeading, rate: 0, bigSince: null, catching: false }
  }
  if (r.t - prev.t > NORTH.maxGap) {
    return { ...prev, since: r.t, t: r.t, gyro: r.gyroHeading, rate: 0, bigSince: null, catching: false }
  }
  const dt = Math.max(0, r.t - prev.t)
  if (dt === 0) return prev
  const instant = Math.abs(angleDiffDeg(prev.gyro, r.gyroHeading)) / (dt / 1000)
  const rate = prev.rate + (instant - prev.rate) * (1 - Math.exp(-dt / NORTH.rateSmoothing))
  const next: NorthState = { ...prev, t: r.t, gyro: r.gyroHeading, rate }
  // Objectif vers le sol ou le ciel : le cap de la boussole n'est plus celui de l'objectif.
  if (Math.abs(r.pitch) > NORTH.maxPitch) return { ...next, bigSince: null }

  const error = angleDiffDeg(prev.offset, measured)
  const steady = rate < NORTH.turnRate
  const bigSince = steady && Math.abs(error) > NORTH.bigError ? (prev.bigSince ?? r.t) : null
  const catching =
    steady &&
    ((bigSince != null && r.t - bigSince >= NORTH.bigErrorMs) || (prev.catching && Math.abs(error) > NORTH.smallError))
  const fast = r.t - prev.since < NORTH.warmup || catching
  let tau = NORTH.fastTau
  if (!fast) {
    // En tournant, la boussole est en retard : on ne l'écoute presque plus.
    const calm = Math.max(1e-3, Math.exp(-((rate / NORTH.turnRate) ** 2)))
    const accuracy = r.accuracy != null && r.accuracy >= 0 ? Math.max(1, r.accuracy / NORTH.goodAccuracy) : 3
    tau = (NORTH.tau * accuracy) / calm
  }
  const k = 1 - Math.exp(-dt / tau)
  return { ...next, offset: normalizeDeg(prev.offset + error * k), bigSince, catching }
}
