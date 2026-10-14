import { describe, expect, it } from 'vitest'
import { fromENU } from './geodesy'
import { guideTrend, logGuide, pickGuideTarget, stepCrossing, WARM_COLD, warmth, type GuideCandidate } from './warmCold'

const here = { lat: 46.1591, lon: -1.1518 }
/** Point à `m` mètres au nord d'ici. */
const north = (m: number) => fromENU(here, [0, m, 0])
const photo = (id: string, m: number | null, extra: Partial<GuideCandidate> = {}): GuideCandidate => ({
  id,
  position: m == null ? null : north(m),
  mine: false,
  geoframed: true,
  captured: false,
  ...extra,
})

describe('chaud / froid : couleurs', () => {
  it('bleu au-delà de 300 m, orange de 300 à 80 m, rouge en dessous', () => {
    expect(warmth(500)).toBe('froid')
    expect(warmth(301)).toBe('froid')
    expect(warmth(300)).toBe('tiede')
    expect(warmth(80)).toBe('tiede')
    expect(warmth(79.9)).toBe('chaud')
    expect(warmth(20)).toBe('chaud')
  })
})

describe('chaud / froid : choix de la cible', () => {
  it('la plus proche à capturer : d’un autre, géocadrée, pas encore capturée, à moins de 500 m', () => {
    const photos = [
      photo('mienne', 30, { mine: true }),
      photo('capturee', 40, { captured: true }),
      photo('a-recaler', 50, { geoframed: false }),
      photo('sans-position', null),
      photo('loin', 450),
      photo('proche', 120),
    ]
    const t = pickGuideTarget(photos, here, { now: 0 })!
    expect(t).toMatchObject({ id: 'proche', chosen: false })
    expect(t.distance).toBeCloseTo(120, 0)
    expect(pickGuideTarget([photo('trop-loin', 520)], here, { now: 0 })).toBeNull()
  })

  it('la photo choisie (chasse en cours, « Y aller ») passe avant la plus proche, même la mienne à recaler', () => {
    const photos = [photo('proche', 60), photo('a-recaler', 300, { mine: true, geoframed: false })]
    expect(pickGuideTarget(photos, here, { chosen: 'a-recaler', now: 0 })).toMatchObject({ id: 'a-recaler', chosen: true })
    // Au-delà de 500 m : rien, pas même la plus proche (on ne guide pas vers une autre en silence).
    expect(pickGuideTarget([photo('proche', 60), photo('choisie', 900)], here, { chosen: 'choisie', now: 0 })).toBeNull()
  })

  it('croix : ignorée une heure, le guidage passe à la suivante', () => {
    const photos = [photo('a', 60), photo('b', 200)]
    const ignored = { a: 1000 + WARM_COLD.ignoreMs }
    expect(pickGuideTarget(photos, here, { ignored, now: 1000 })!.id).toBe('b')
    expect(pickGuideTarget(photos, here, { ignored, now: 1000 + WARM_COLD.ignoreMs + 1 })!.id).toBe('a')
    expect(pickGuideTarget(photos, here, { chosen: 'a', ignored, now: 1000 })!.id).toBe('b')
  })
})

describe('chaud / froid : vibrations aux paliers', () => {
  it('rien au départ ; tick à 200, 100, 50 m ; strong à 20 m', () => {
    let s = stepCrossing(null, 260)
    expect(s.pulse).toBeNull()
    const pulses: (string | null)[] = []
    for (const d of [240, 199, 150, 99, 60, 49, 30, 19]) {
      s = stepCrossing(s.passed, d)
      pulses.push(s.pulse)
    }
    expect(pulses).toEqual([null, 'tick', null, 'tick', null, 'tick', null, 'strong'])
  })

  it('départ sous un palier : il ne vibre pas ; saut de plusieurs paliers : une seule impulsion', () => {
    expect(stepCrossing(null, 90)).toEqual({ passed: [200, 100], pulse: null })
    expect(stepCrossing([200, 100], 15).pulse).toBe('strong')
    expect(stepCrossing([200], 45)).toEqual({ passed: [200, 100, 50], pulse: 'tick' })
  })

  it('le bruit du GPS au bord d’un palier ne refait pas vibrer ; s’éloigner nettement le réarme', () => {
    let s = stepCrossing(null, 105)
    s = stepCrossing(s.passed, 99)
    expect(s.pulse).toBe('tick')
    for (const d of [103, 98, 108, 100]) {
      s = stepCrossing(s.passed, d)
      expect(s.pulse).toBeNull()
    }
    s = stepCrossing(s.passed, 100 + WARM_COLD.rearm + 1)
    s = stepCrossing(s.passed, 99)
    expect(s.pulse).toBe('tick')
  })
})

describe('chaud / froid : « Plus chaud / Plus froid »', () => {
  const samples = [
    { at: 0, distance: 200 },
    { at: 5_000, distance: 190 },
  ]
  it('écart net depuis 10 s', () => {
    expect(guideTrend(samples, 10_000, 170, 5)).toBe('Plus chaud')
    expect(guideTrend(samples, 10_000, 230, 5)).toBe('Plus froid')
  })
  it('rien : écart sous 10 m ou sous la précision du GPS, ou pas de relevé assez ancien', () => {
    expect(guideTrend(samples, 10_000, 193, 5)).toBeNull()
    expect(guideTrend(samples, 10_000, 170, 40)).toBeNull()
    expect(guideTrend(samples, 9_000, 100, 5)).toBeNull()
  })
  it('relevés : la tendance et les impulsions suivent la cible, une autre cible repart de zéro', () => {
    let log = logGuide(null, 'a', 230, 0, 5)
    expect(log).toMatchObject({ pulse: null, beats: 0, trend: null })
    log = logGuide(log, 'a', 195, 11_000, 5)
    expect(log).toMatchObject({ pulse: 'tick', beats: 1, trend: 'Plus chaud' })
    log = logGuide(log, 'b', 150, 12_000, 5)
    expect(log).toMatchObject({ id: 'b', pulse: null, beats: 0, trend: null, passed: [200] })
  })
})
