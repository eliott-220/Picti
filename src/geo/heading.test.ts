import { describe, expect, it } from 'vitest'
import { NORTH, updateNorth, type NorthState } from './heading'
import { angleDiffDeg, normalizeDeg } from './math'

const STEP = 1000 / 60
/** Le gyroscope de l'iPhone part d'une direction arbitraire. */
const GYRO_ZERO = 137

/** Bruit pseudo-aléatoire reproductible dans [-1, 1]. */
function noise(seed: number) {
  let s = seed
  return () => {
    s = (s * 1103515245 + 12345) % 2147483648
    return (s / 2147483648) * 2 - 1
  }
}

interface Scenario {
  /** Cap réel de l'objectif (°) à l'instant t (s). */
  heading: (t: number) => number
  /** Inclinaison de l'objectif (°). */
  pitch?: (t: number) => number
  /** Retard de la boussole (s) et amplitude de son bruit (°). */
  lag?: number
  jitter?: number
  /** Dérive du gyroscope (°/s). */
  drift?: number
  /** Décalage de la boussole (°) à l'instant t (recalibration). */
  compassBias?: (t: number) => number
}

/** Simule les capteurs à 60 Hz ; renvoie l'erreur de cap (°) à chaque instant. */
function simulate(s: Scenario, duration: number, filter: typeof updateNorth = updateNorth) {
  const rand = noise(3)
  const errors: { t: number; error: number }[] = []
  let state: NorthState | null = null
  for (let ms = 0; ms <= duration * 1000; ms += STEP) {
    const t = ms / 1000
    const truth = s.heading(t)
    const gyro = normalizeDeg(truth + GYRO_ZERO + (s.drift ?? 0) * t)
    const compass = normalizeDeg(
      s.heading(Math.max(0, t - (s.lag ?? 0))) + (s.jitter ?? 0) * rand() + (s.compassBias?.(t) ?? 0),
    )
    state = filter(state, { gyroHeading: gyro, compass, accuracy: 10, pitch: s.pitch?.(t) ?? 0, t: ms })
    errors.push({ t, error: angleDiffDeg(truth, gyro + state.offset) })
  }
  return errors
}

/** Ancien recalage : 10 % de l'écart à chaque mesure, comme si l'on suivait la boussole. */
const followCompass: typeof updateNorth = (prev, r) => {
  const measured = angleDiffDeg(r.gyroHeading, r.compass)
  const offset = prev ? prev.offset + angleDiffDeg(prev.offset, measured) * 0.1 : measured
  return { offset, since: 0, t: r.t, gyro: r.gyroHeading, rate: 0, bigSince: null, catching: false }
}

const maxError = (errors: { t: number; error: number }[], from = 0, to = Infinity) =>
  Math.max(...errors.filter((e) => e.t >= from && e.t <= to).map((e) => Math.abs(e.error)))

describe('cap : gyroscope recalé sur la boussole', () => {
  it('prend le nord de la boussole dès la première mesure', () => {
    const state = updateNorth(null, { gyroHeading: 10, compass: 350, accuracy: 10, pitch: 0, t: 0 })
    expect(normalizeDeg(10 + state.offset)).toBeCloseTo(350, 6)
  })

  it('en tournant, la photo ne traîne pas derrière le téléphone', () => {
    // Immobile 3 s, puis balayage à 60°/s pendant 1,5 s, puis immobile ; boussole en retard de 0,3 s.
    const heading = (t: number) => (t < 3 ? 20 : t < 4.5 ? 20 + 60 * (t - 3) : 110)
    const scenario = { heading, lag: 0.3, jitter: 1 }
    expect(maxError(simulate(scenario, 8), 2)).toBeLessThan(3)
    // En suivant la boussole à chaque mesure, la photo traînait de plus de 10° derrière le téléphone.
    expect(maxError(simulate(scenario, 8, followCompass), 2)).toBeGreaterThan(10)
  })

  it('en tournant lentement, reste juste', () => {
    const heading = (t: number) => (t < 3 ? 0 : t < 6 ? 10 * (t - 3) : 30)
    expect(maxError(simulate({ heading, lag: 0.3, jitter: 1 }, 10), 2)).toBeLessThan(2)
  })

  it('immobile, le bruit de la boussole ne fait pas trembler le cap', () => {
    const errors = simulate({ heading: () => 200, jitter: 4 }, 12)
    const late = errors.filter((e) => e.t > 6).map((e) => e.error)
    expect(Math.max(...late) - Math.min(...late)).toBeLessThan(1)
  })

  it('corrige la lente dérive du gyroscope', () => {
    const errors = simulate({ heading: () => 45, drift: 0.05, jitter: 2 }, 60)
    expect(maxError(errors, 10)).toBeLessThan(1)
  })

  it('ignore la boussole quand l’objectif vise le sol', () => {
    // À plat, la boussole ne donne plus le cap de l'objectif : 150° d'écart, sans effet.
    const scenario = {
      heading: () => 90,
      pitch: (t: number) => (t < 3 ? 0 : -80),
      compassBias: (t: number) => (t < 3 ? 0 : 150),
    }
    expect(maxError(simulate(scenario, 8), 2)).toBeLessThan(0.5)
  })

  it('adopte en quelques secondes un nouveau nord (boussole recalibrée)', () => {
    const errors = simulate({ heading: () => 300, compassBias: (t: number) => (t < 3 ? 0 : 40) }, 9)
    // L'écart avec l'ancien nord vaut alors 40°.
    expect(Math.abs(angleDiffDeg(errors[errors.length - 1].error, 40))).toBeLessThan(3)
  })

  it('rattrape vite un très grand écart qui persiste', () => {
    const scenario = { heading: () => 300, compassBias: (t: number) => (t < 3 ? 0 : 120) }
    const errors = simulate(scenario, 3 + NORTH.bigErrorMs / 1000 + 1.5)
    expect(Math.abs(angleDiffDeg(errors[errors.length - 1].error, 120))).toBeLessThan(2)
  })

  it('après une pause (app en arrière-plan), se recale aussitôt', () => {
    let state = updateNorth(null, { gyroHeading: 0, compass: 0, accuracy: 10, pitch: 0, t: 0 })
    for (let ms = STEP; ms < 3000; ms += STEP) {
      state = updateNorth(state, { gyroHeading: 0, compass: 0, accuracy: 10, pitch: 0, t: ms })
    }
    // Au retour, le repère du gyroscope a changé de 70°.
    for (let ms = 60_000; ms < 61_000; ms += STEP) {
      state = updateNorth(state, { gyroHeading: 70, compass: 0, accuracy: 10, pitch: 0, t: ms })
    }
    expect(Math.abs(angleDiffDeg(70 + state.offset, 0))).toBeLessThan(1)
  })
})
