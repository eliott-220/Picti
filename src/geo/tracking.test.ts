import { describe, expect, it } from 'vitest'
import { fromENU, toENU } from './geodesy'
import type { MotionState } from './motion'
import { trackFix, trackPosition, updateTrack, type GpsFix, type Track } from './tracking'

const ORIGIN = { lat: 46.1557, lon: -1.1533 }

/** Relevé GPS à `east`, `north` mètres de l'origine, à l'instant `t` (s). */
const fixAt = (east: number, north: number, t: number, accuracy = 5, speed: number | null = null): GpsFix => ({
  ...fromENU(ORIGIN, [east, north, 0]),
  accuracy,
  timestamp: t * 1000,
  speed,
})

/** Position estimée (Est, Nord) par rapport à l'origine. */
const where = (track: Track, position?: readonly [number, number]) => {
  const [e, n] = toENU(ORIGIN, trackFix(track, position))
  return { e, n }
}

/** Bruit pseudo-aléatoire reproductible dans [-1, 1]. */
function noise(seed: number) {
  let s = seed
  return () => {
    s = (s * 1103515245 + 12345) % 2147483648
    return (s / 2147483648) * 2 - 1
  }
}

function run(fixes: GpsFix[], motion: MotionState, from: Track | null = null) {
  const history: Track[] = []
  let track = from
  for (const f of fixes) {
    track = updateTrack(track, f, motion)
    history.push(track)
  }
  return history
}

describe('suivi de la position', () => {
  it('part du premier relevé', () => {
    const [track] = run([fixAt(12, -7, 0)], 'moving')
    const p = where(track)
    expect(p.e).toBeCloseTo(12, 6)
    expect(p.n).toBeCloseTo(-7, 6)
  })

  it('à l’arrêt, les écarts du GPS ne font presque pas bouger la position', () => {
    const settled = run(
      Array.from({ length: 10 }, (_, i) => fixAt(0, 0, i)),
      'still',
    )[9]
    // Le GPS saute de ±3 m d'un relevé à l'autre.
    const fixes = Array.from({ length: 30 }, (_, i) => fixAt(i % 2 ? 3 : -3, i % 3 ? 2 : -2, 10 + i))
    const drift = (mode: MotionState) =>
      Math.max(...run(fixes, mode, settled).map((t) => Math.hypot(where(t).e, where(t).n)))
    expect(drift('still')).toBeLessThan(0.75)
    // En marchant, les mêmes relevés sont davantage pris en compte.
    expect(drift('moving')).toBeGreaterThan(2 * drift('still'))
  })

  it('en marchant, suit le déplacement', () => {
    const rand = noise(7)
    // 1,3 m/s vers le nord pendant 20 s, relevés à ±1 m près.
    const fixes = Array.from({ length: 21 }, (_, i) => fixAt(rand(), 1.3 * i + rand(), i))
    const history = run(fixes, 'moving')
    for (const [i, track] of history.entries()) {
      if (i < 5) continue
      const p = where(track)
      expect(Math.abs(p.n - 1.3 * i)).toBeLessThan(1.5)
      expect(Math.abs(p.e)).toBeLessThan(1.5)
    }
    // Vitesse de marche retrouvée.
    const last = history[20]
    expect(last.vn).toBeGreaterThan(0.9)
    expect(last.vn).toBeLessThan(1.7)
  })

  it('s’arrête sans élan, en laissant le GPS rattraper son retard', () => {
    // On marche 5 m vers le nord à 1 m/s puis on s'arrête ; le GPS a 0,8 s de retard.
    const gps = [0, 0.2, 1.2, 2.2, 3.2, 4.2, 5, 5, 5, 5, 5]
    const motion: MotionState[] = ['moving', 'moving', 'moving', 'moving', 'moving', 'moving', 'settling', 'settling', 'still', 'still', 'still']
    let track: Track | null = null
    for (const [i, n] of gps.entries()) {
      track = updateTrack(track, fixAt(0, n, i), motion[i])
      const p = where(track, trackPosition(track, track.t + 500, motion[i]))
      if (i >= 6) {
        // Plus d'élan : on ne dépasse pas le point d'arrêt.
        expect(track.vn).toBe(0)
        expect(p.n).toBeLessThan(5.1)
      }
      if (i >= 7) expect(Math.abs(p.n - 5)).toBeLessThan(0.2)
    }
  })

  it('rattrape en quelques secondes un déplacement que l’accéléromètre n’a pas vu', () => {
    // Téléphone tenu très stable : la marche n'est pas détectée, mais le GPS montre 5 m.
    const settled = run(
      Array.from({ length: 10 }, (_, i) => fixAt(0, 0, i)),
      'still',
    )[9]
    const after = run(
      Array.from({ length: 8 }, (_, i) => fixAt(0, -5, 10 + i)),
      'still',
      settled,
    )
    expect(where(after[7]).n).toBeLessThan(-4)
  })

  it('prolonge la marche entre deux relevés, pas à l’arrêt', () => {
    const fixes = Array.from({ length: 11 }, (_, i) => fixAt(0, 1.3 * i, i))
    const track = run(fixes, 'moving')[10]
    const now = track.t + 500
    const ahead = where(track, trackPosition(track, now, 'moving'))
    expect(ahead.n).toBeCloseTo(13.65, 0)
    expect(where(track, trackPosition(track, now, 'still')).n).toBeCloseTo(where(track).n, 6)
    expect(where(track, trackPosition(track, now, 'settling')).n).toBeCloseTo(where(track).n, 6)
    // Relevé trop ancien : on ne prolonge plus.
    expect(where(track, trackPosition(track, track.t + 10_000, 'moving')).n).toBeCloseTo(where(track).n, 6)
  })

  it('ignore un saut isolé à l’arrêt, suit un saut confirmé', () => {
    const settled = run(
      Array.from({ length: 10 }, (_, i) => fixAt(0, 0, i)),
      'still',
    )[9]
    const [glitch] = run([fixAt(30, 0, 10)], 'still', settled)
    expect(Math.abs(where(glitch).e)).toBeLessThan(0.5)
    const [, confirmed] = run([fixAt(30, 0, 10), fixAt(30, 0, 11)], 'still', settled)
    expect(where(confirmed).e).toBeCloseTo(30, 3)
    const [, back] = run([fixAt(30, 0, 10), fixAt(0, 0, 11)], 'still', settled)
    expect(Math.abs(where(back).e)).toBeLessThan(0.5)
  })

  it('adopte aussitôt un relevé bien plus précis que le premier', () => {
    const [, track] = run([fixAt(40, 0, 0, 65), fixAt(0, 0, 1, 5)], 'still')
    expect(Math.abs(where(track).e)).toBeLessThan(1)
  })

  it('en véhicule, la vitesse GPS suffit à suivre le déplacement', () => {
    const fixes = Array.from({ length: 11 }, (_, i) => fixAt(10 * i, 0, i, 5, 10))
    const track = run(fixes, 'still')[10]
    expect(where(track).e).toBeGreaterThan(97)
  })

  it('repart du relevé suivant après une longue interruption', () => {
    const [, track] = run([fixAt(0, 0, 0), fixAt(50, 0, 60)], 'still')
    expect(where(track).e).toBeCloseTo(50, 3)
  })

  it('recentre son repère au-delà d’un kilomètre', () => {
    const fixes = Array.from({ length: 51 }, (_, i) => fixAt(30 * i, 0, i, 5, 30))
    const track = run(fixes, 'moving')[50]
    expect(where(track).e).toBeCloseTo(1500, -1)
    expect(Math.hypot(track.e, track.n)).toBeLessThan(1000)
  })
})
