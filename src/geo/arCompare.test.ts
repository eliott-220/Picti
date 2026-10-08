import { describe, expect, it } from 'vitest'
import { GeoAligner, localToGeo, transformOf, type AlignTransform, type LocalPoint } from './arAlign'
import { approachTransform } from './arPose'
import { fromENU, toENU } from './geodesy'
import type { MotionState } from './motion'
import { trackFix, updateTrack, walkTrack, type Track } from './tracking'

// Comparaison sur les mêmes marches simulées (GPS à erreur corrélée, boussole faussée) : le suivi
// actuel de l'app (`tracking.ts`, avec ou sans pas comptés) et le calage du suivi visuel (`arAlign.ts`).

const ORIGIN = { lat: 46.1558, lon: -1.152 }

function seeded(seed: number) {
  let s = seed >>> 0
  return () => (s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32
}

interface Run {
  /** Erreur moyenne de position (m). */
  error: number
  /** Saut moyen de l'erreur d'une seconde à l'autre (m) : ce qui fait « flotter » les photos. */
  jitter: number
}

/** Une marche : 30 s vers le nord, 30 s vers l'est (1,3 m/s), puis 30 s immobile ; un relevé par seconde. */
export function simulate(seed: number): { gps: Run; tracker: Run; steps: Run; visual: Run } {
  const rand = seeded(seed)
  const gauss = () => Math.sqrt(-2 * Math.log(rand() + 1e-12)) * Math.cos(2 * Math.PI * rand())
  const sigma = 4
  const k = Math.exp(-1 / 30)
  let ne = gauss() * sigma
  let nn = gauss() * sigma
  const theta = rand() * 360
  const bias = 7
  const stride = 1 + 0.08 * gauss()

  const truthAt = (t: number): [number, number] => (t <= 30 ? [0, 1.3 * t] : t <= 60 ? [1.3 * (t - 30), 39] : [39, 39])
  const walking = (t: number) => t > 0 && t <= 60
  // Repère du suivi visuel : origine au départ, cap arbitraire θ (ENU = Rot(θ)·local).
  const local = ([e, n]: [number, number]): LocalPoint => {
    const c = Math.cos((-theta * Math.PI) / 180)
    const s = Math.sin((-theta * Math.PI) / 180)
    return [e * c + n * s, -e * s + n * c]
  }

  let tracker: Track | null = null
  let steps: Track | null = null
  const aligner = new GeoAligner()
  // Calage affiché : il rejoint le calage calculé en douceur, comme dans l'app (`AR_TRACKING.smoothing`).
  let shown: AlignTransform | null = null
  const err = { gps: [] as [number, number][], tracker: [] as [number, number][], steps: [] as [number, number][], visual: [] as [number, number][] }

  for (let t = 0; t <= 90; t++) {
    ne = ne * k + sigma * Math.sqrt(1 - k * k) * gauss()
    nn = nn * k + sigma * Math.sqrt(1 - k * k) * gauss()
    const [te, tn] = truthAt(t)
    const p = fromENU(ORIGIN, [te + ne + gauss(), tn + nn + gauss(), 0])
    const fix = { lat: p.lat, lon: p.lon, alt: null, accuracy: 5, timestamp: t * 1000, speed: walking(t) ? 1.3 : 0 }
    const motion: MotionState = walking(t) ? 'moving' : t <= 62 && t > 60 ? 'settling' : 'still'

    // Suivi actuel, sans pas comptés (sens de marche inconnu, ou sans accéléromètre).
    tracker = updateTrack(tracker, fix, motion)
    // Suivi actuel avec les pas (2 par seconde, sens exact, longueur faussée de quelques %).
    if (steps && walking(t)) {
      const [pe, pn] = truthAt(t - 1)
      steps = walkTrack(steps, (te - pe) * stride, (tn - pn) * stride)
    }
    steps = updateTrack(steps, fix, motion, t <= 62)
    // Suivi visuel : position locale exacte, boussole faussée.
    aligner.addGps(fix, local([te, tn]))
    aligner.addHeading(theta + bias + gauss() * 3)
    shown = approachTransform(shown, transformOf(aligner.solve())!, 1000, 1500)

    const at = (g: { lat: number; lon: number }): [number, number] => {
      const [e, n] = toENU(ORIGIN, g)
      return [e - te, n - tn]
    }
    err.gps.push(at(fix))
    err.tracker.push(at(trackFix(tracker)))
    err.steps.push(at(trackFix(steps)))
    err.visual.push(at(localToGeo(shown, local([te, tn]))))
  }
  const summarize = (xs: [number, number][]): Run => {
    const from = xs.slice(5)
    const error = from.reduce((a, [e, n]) => a + Math.hypot(e, n), 0) / from.length
    let jitter = 0
    for (let i = 1; i < from.length; i++) jitter += Math.hypot(from[i][0] - from[i - 1][0], from[i][1] - from[i - 1][1])
    return { error, jitter: jitter / (from.length - 1) }
  }
  return { gps: summarize(err.gps), tracker: summarize(err.tracker), steps: summarize(err.steps), visual: summarize(err.visual) }
}

/** Moyennes sur `n` marches. */
export function compare(n = 200) {
  const total = { gps: { error: 0, jitter: 0 }, tracker: { error: 0, jitter: 0 }, steps: { error: 0, jitter: 0 }, visual: { error: 0, jitter: 0 } }
  for (let i = 0; i < n; i++) {
    const r = simulate(1000 + i)
    for (const key of ['gps', 'tracker', 'steps', 'visual'] as const) {
      total[key].error += r[key].error / n
      total[key].jitter += r[key].jitter / n
    }
  }
  return total
}

describe('suivi visuel face au suivi actuel (200 marches simulées)', () => {
  const r = compare()

  // Mesuré le 08/10/2026 (moyennes) : GPS seul 5,1 m et 2,2 m/s ; suivi actuel 4,9 m et 1,1 m/s, avec des
  // pas comptés sans erreur de sens 5,0 m et 0,26 m/s ; suivi visuel 4,1 m et 0,14 m/s. (Une seconde
  // d'écart : le tremblement d'une image à l'autre, que seul le vrai suivi visuel supprime, n'y est pas.)
  it('les photos ne flottent plus : leur place bouge de quelques centimètres par seconde', () => {
    expect(r.visual.jitter).toBeLessThan(0.15)
    expect(r.visual.jitter).toBeLessThan(r.tracker.jitter / 5)
    expect(r.visual.jitter).toBeLessThan(r.steps.jitter / 1.5)
  })

  it('dans l’absolu, plus juste que le suivi actuel (la moyenne de tous les relevés de la marche)', () => {
    expect(r.visual.error).toBeLessThan(r.tracker.error * 0.9)
    expect(r.visual.error).toBeLessThan(r.steps.error * 0.9)
  })
})
