import { describe, expect, it } from 'vitest'
import { fromENU, toENU } from './geodesy'
import type { MotionState } from './motion'
import { trackFix, trackPosition, updateTrack, walkTrack, type GpsFix, type Track } from './tracking'

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

  it('immobile, une dérive lente du GPS ne déplace pas la position (la photo reste en place)', () => {
    const settled = run(
      Array.from({ length: 10 }, (_, i) => fixAt(0, 0, i)),
      'still',
    )[9]
    // Le GPS glisse de 3 m vers l'est en 20 s puis revient, avec ±1 m de bruit.
    const rand = noise(11)
    const fixes = Array.from({ length: 40 }, (_, i) => fixAt(3 * Math.sin((Math.PI * i) / 40) + rand(), rand(), 10 + i))
    for (const t of run(fixes, 'still', settled)) expect(Math.hypot(where(t).e, where(t).n)).toBeLessThan(0.3)
  })

  it('sans accéléromètre, la vitesse GPS dit si l’on bouge', () => {
    const settled = run(
      Array.from({ length: 10 }, (_, i) => fixAt(0, 0, i, 5, 0)),
      'unknown',
    )[9]
    // Vitesse nulle : les écarts du GPS sont ignorés comme à l'arrêt…
    const jitter = run([fixAt(2, -2, 10, 5, 0), fixAt(-2, 2, 11, 5, 0)], 'unknown', settled)
    expect(Math.hypot(where(jitter[1]).e, where(jitter[1]).n)).toBeLessThan(0.3)
    // …en marche (1,3 m/s), le GPS est suivi.
    const walk = run(
      Array.from({ length: 6 }, (_, i) => fixAt(0, 1.3 * (i + 1), 10 + i, 5, 1.3)),
      'unknown',
      settled,
    )
    expect(where(walk[5]).n).toBeGreaterThan(6)
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

describe('position avancée pas à pas', () => {
  /** Immobile 10 s au point d'origine (GPS ±5 m qui dérive un peu). */
  const settled = () => {
    const rand = noise(7)
    return run(Array.from({ length: 10 }, (_, i) => fixAt(rand(), rand(), i)), 'still').at(-1)!
  }

  it('reculer de 4 m : la position suit les pas, le GPS en retard ne la ramène pas', () => {
    let track = settled()
    // 6 pas de 0,65 m vers le sud en 3 s ; le GPS, lui, n'a pas encore bougé.
    for (let i = 0; i < 6; i++) {
      track = walkTrack(track, 0, -0.65)
      if (i % 2 === 1) track = updateTrack(track, fixAt(0, 0, 10 + (i + 1) / 2), 'moving', true)
    }
    expect(where(track).n).toBeCloseTo(-3.9, 0)
    // Arrêté : le GPS rattrape son retard (−4 m) en quelques secondes.
    for (let t = 14; t < 20; t++) track = updateTrack(track, fixAt(0, t < 16 ? -2 : -4, t), t < 18 ? 'settling' : 'still', true)
    expect(where(track).n).toBeCloseTo(-3.9, 0)
  })

  it('un GPS immobile ne défait pas quelques mètres de marche', () => {
    let track = settled()
    for (let i = 0; i < 5; i++) track = walkTrack(track, 0.65, 0)
    // Le GPS ne voit rien (déplacement noyé dans sa précision).
    for (let t = 11; t < 40; t++) {
      const motion: MotionState = t < 15 ? 'settling' : 'still'
      track = updateTrack(track, fixAt(0, 0, t), motion, true)
    }
    expect(where(track).e).toBeGreaterThan(2.5)
  })

  it('pas comptés dans le mauvais sens : le GPS finit par corriger', () => {
    let track = settled()
    // Les pas disent 5 m au nord, on est en fait allé 5 m au sud.
    for (let i = 0; i < 8; i++) track = walkTrack(track, 0, 0.65)
    for (let t = 11; t < 30; t++) track = updateTrack(track, fixAt(0, -5, t), t < 15 ? 'settling' : 'still', true)
    expect(where(track).n).toBeLessThan(-2)
  })

  it('immobile, les pas comptés : une dérive du GPS de 6 m ne fait pas glisser la photo', () => {
    let track = settled()
    const rand = noise(3)
    for (let t = 11; t < 60; t++) track = updateTrack(track, fixAt(6 + rand(), rand(), t), 'still', true)
    expect(Math.hypot(where(track).e, where(track).n)).toBeLessThan(1.5)
  })

  it('immobile, les pas comptés : un écart de 12 m qui persiste est tout de même rattrapé', () => {
    let track = settled()
    for (let t = 11; t < 40; t++) track = updateTrack(track, fixAt(12, 0, t), 'still', true)
    expect(where(track).e).toBeGreaterThan(9)
  })

  it('sans pas comptés (pas d’orientation), le suivi reste celui du GPS', () => {
    const track = updateTrack(settled(), fixAt(0, 3, 11), 'moving', false)
    expect(track.mode).toBe('moving')
  })
})

describe('moyenne à l’arrêt', () => {
  /** Relevés immobiles à ±4 m autour de l'origine, de précisions variées, un par seconde. */
  const scattered: [number, number, number][] = [
    [3, -2, 8],
    [-4, 1, 4],
    [2, 3, 6],
    [-1, -3, 4],
    [4, 2, 10],
    [-3, 0, 5],
    [1, 4, 4],
    [0, -4, 6],
    [-2, 2, 4],
    [3, 1, 5],
  ]
  const weighted = (list: [number, number, number][]) => {
    const w = list.reduce((s, [, , a]) => s + 1 / a ** 2, 0)
    return {
      e: list.reduce((s, [e, , a]) => s + e / a ** 2, 0) / w,
      n: list.reduce((s, [, n, a]) => s + n / a ** 2, 0) / w,
    }
  }

  it('immobile depuis 2 s : la position est la moyenne pondérée (1 / précision²) des relevés depuis l’arrêt', () => {
    const history = run(
      scattered.map(([e, n, a], i) => fixAt(e, n, i, a)),
      'still',
    )
    for (let i = 2; i < scattered.length; i++) {
      const expected = weighted(scattered.slice(0, i + 1))
      const p = where(history[i])
      expect(p.e).toBeCloseTo(expected.e, 6)
      expect(p.n).toBeCloseTo(expected.n, 6)
    }
    // Les relevés précis pèsent davantage : la moyenne simple serait ailleurs.
    const last = where(history[scattered.length - 1])
    expect(Math.hypot(last.e - 0.3, last.n - 0.4)).toBeGreaterThan(0.05)
  })

  it('au-delà de 10 s, la moyenne est tenue : une dérive du GPS ne déplace plus la position', () => {
    const fixes = [
      ...scattered.map(([e, n, a], i) => fixAt(e, n, i, a)),
      // Le GPS glisse ensuite de 3 m vers l'est (sous le seuil d'un écart persistant).
      ...Array.from({ length: 20 }, (_, i) => fixAt(3, 0, 10 + i, 5)),
    ]
    const history = run(fixes, 'still')
    const held = weighted(scattered)
    for (const t of history.slice(10)) {
      expect(where(t).e).toBeCloseTo(held.e, 1)
      expect(where(t).n).toBeCloseTo(held.n, 1)
    }
  })

  it('un saut isolé n’entre pas dans la moyenne', () => {
    const fixes = [...scattered.slice(0, 5).map(([e, n, a], i) => fixAt(e, n, i, a)), fixAt(40, 0, 5, 5)]
    const history = run(fixes, 'still')
    const expected = weighted(scattered.slice(0, 5))
    expect(where(history[5]).e).toBeCloseTo(expected.e, 6)
  })

  it('reprend aussitôt le GPS quand la marche est détectée', () => {
    const settled = run(
      scattered.map(([e, n, a], i) => fixAt(e, n, i, a)),
      'still',
    ).at(-1)!
    // On repart vers le nord à 1,3 m/s.
    const walk = run(
      Array.from({ length: 6 }, (_, i) => fixAt(0, 1.3 * (i + 1), 10 + i, 4)),
      'moving',
      settled,
    )
    expect(walk[0].mode).toBe('moving')
    expect(walk[0].stillSince).toBeNull()
    expect(where(walk[5]).n).toBeGreaterThan(5)
    // À l'arrêt suivant, une nouvelle moyenne repart de zéro, au nouvel endroit.
    const stop = run(
      Array.from({ length: 4 }, (_, i) => fixAt(0, 8, 16 + i, 4)),
      'still',
      walk[5],
    )
    expect(stop[3].stillSince).toBe(16_000)
    expect(where(stop[3]).n).toBeCloseTo(8, 6)
  })

  it('un écart persistant après la moyenne est toujours rattrapé', () => {
    const settled = run(
      scattered.map(([e, n, a], i) => fixAt(e, n, i, a)),
      'still',
    ).at(-1)!
    // Déplacement de 6 m vers le sud que l'accéléromètre n'a pas vu.
    const after = run(
      Array.from({ length: 20 }, (_, i) => fixAt(0, -6, 10 + i, 4)),
      'still',
      settled,
    )
    expect(where(after[19]).n).toBeLessThan(-5)
  })

  it('après une marche comptée pas à pas, la position reste celle des pas', () => {
    let track = run(
      scattered.map(([e, n, a], i) => fixAt(e, n, i, a)),
      'still',
    ).at(-1)!
    const start = where(track)
    for (let i = 0; i < 4; i++) track = walkTrack(track, 0.65, 0)
    expect(track.stepped).toBe(true)
    // Immobile ensuite, le GPS n'a pas vu les 2,6 m : pas de moyenne qui les déferait.
    for (let t = 11; t < 25; t++) track = updateTrack(track, fixAt(0, 0, t, 4), t < 15 ? 'settling' : 'still', true)
    expect(where(track).e - start.e).toBeCloseTo(2.6, 1)
    expect(track.average).toBeNull()
  })
})
