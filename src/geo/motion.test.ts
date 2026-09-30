import { describe, expect, it } from 'vitest'
import { add, type Vec3 } from './math'
import { accelerometerSign, feedMotion, motionState, stepDirection, type MotionDetector } from './motion'
import { basisFromAngles } from './orientation'

/** Pesanteur, téléphone tenu droit devant soi. */
const G: Vec3 = [0, 9.81, 0]
const STEP = 1000 / 60

/** Tremblement de la main (quelques centièmes de m/s²), pseudo-aléatoire mais reproductible. */
const tremor = (t: number): Vec3 => [0.08 * Math.sin(t * 37), 0.08 * Math.sin(t * 53 + 1), 0.08 * Math.sin(t * 71 + 2)]
/** Marche : rebond vertical d'environ 2 m/s² à deux pas par seconde. */
const walking = (t: number): Vec3 => {
  const w = 2 * Math.PI * 2 * t
  return [0.3 * Math.sin(w), 2 * Math.sin(w), 0.8 * Math.cos(w)]
}

/** Simule l'accéléromètre à 60 Hz de `from` à `to` (s). */
function feed(
  d: MotionDetector | null,
  from: number,
  to: number,
  accel: (t: number) => Vec3,
  gravityOnly = false,
): MotionDetector | null {
  for (let ms = from * 1000; ms < to * 1000; ms += STEP) {
    const a = accel(ms / 1000)
    d = feedMotion(d, { acceleration: gravityOnly ? null : a, withGravity: add(a, G), t: ms })
  }
  return d
}

describe('détection de la marche', () => {
  it('téléphone tenu immobile : à l’arrêt', () => {
    const d = feed(null, 0, 4, tremor)
    expect(motionState(d, 4000)).toBe('still')
  })

  it('en marchant : en mouvement après quelques pas', () => {
    const start = feed(null, 0, 3, tremor)
    // Un seul pas ne suffit pas (ce peut être un geste isolé).
    expect(motionState(feed(start, 3, 3.3, walking), 3300)).toBe('still')
    const d = feed(start, 3, 4.5, walking)
    expect(motionState(d, 4500)).toBe('moving')
    expect(d!.total).toBeGreaterThanOrEqual(3)
  })

  it('reconnaît une marche douce, téléphone tenu devant soi', () => {
    // Rebond de 0,8 m/s² seulement, 1,6 pas par seconde.
    const gentle = (t: number): Vec3 => [0.1 * Math.sin(10 * t), 0.8 * Math.sin(2 * Math.PI * 1.6 * t), 0.3 * Math.cos(10 * t)]
    expect(motionState(feed(feed(null, 0, 2, tremor), 2, 5, gentle), 5000)).toBe('moving')
  })

  it('à l’arrêt des pas : d’abord « vient de s’arrêter », puis immobile', () => {
    const walked = feed(feed(null, 0, 1, tremor), 1, 5, walking)
    expect(motionState(walked, 5000)).toBe('moving')
    expect(motionState(feed(walked, 5, 6.5, tremor), 6500)).toBe('settling')
    expect(motionState(feed(walked, 5, 13, tremor), 13000)).toBe('still')
  })

  it('lever ou baisser le téléphone n’est pas marcher', () => {
    // Un geste franc (1,5 m/s² vers le haut puis vers le bas), une seule fois.
    const lift = (t: number): Vec3 => [0, t >= 3 && t < 4 ? 1.5 * Math.sin(2 * Math.PI * (t - 3)) : 0, 0]
    const d = feed(null, 0, 6, (t) => add(tremor(t), lift(t)))
    expect(motionState(d, 4000)).toBe('still')
    expect(motionState(d, 6000)).toBe('still')
  })

  it('bouger lentement le téléphone en visant n’est pas marcher', () => {
    // Va-et-vient vertical lent (0,6 par seconde) : trop espacé pour des pas.
    const aiming = (t: number): Vec3 => [0.4 * Math.sin(3 * t), 1.2 * Math.sin(2 * Math.PI * 0.6 * t), 0.4 * Math.cos(2 * t)]
    expect(motionState(feed(null, 0, 8, aiming), 8000)).toBe('still')
  })

  it('tourner sur soi-même pour regarder autour de soi n’est pas marcher', () => {
    // Balayage rapide : le téléphone accélère à l'horizontale (≈ 1,5 m/s²), pas à la verticale.
    const panning = (t: number): Vec3 => [1.5 * Math.sin(2 * Math.PI * 0.7 * t), 0.05 * Math.sin(t * 53), 1.5 * Math.cos(2 * Math.PI * 0.7 * t)]
    const d = feed(feed(null, 0, 3, tremor), 3, 6, panning)
    expect(motionState(d, 6000)).toBe('still')
    expect(motionState(feed(null, 0, 3, panning, true), 3000)).toBe('still')
  })

  it('retire lui-même la pesanteur quand le capteur ne le fait pas', () => {
    const still = feed(null, 0, 4, tremor, true)
    expect(motionState(still, 4000)).toBe('still')
    expect(motionState(feed(still, 4, 6, walking, true), 6000)).toBe('moving')
  })

  it('sans mesure, l’état est inconnu', () => {
    expect(motionState(null, 0)).toBe('unknown')
    const d = feed(null, 0, 2, tremor)
    expect(motionState(d, 5000)).toBe('unknown')
    expect(feedMotion(d, { acceleration: null, withGravity: null, t: 2100 })).toBe(d)
  })
})

/** Marche qui démarre à `t0` s : l'élan des premiers pas (0,8 s) pousse le téléphone selon `push`. */
const setOff = (t0: number, push: Vec3) => (t: number): Vec3 =>
  t < t0 ? tremor(t) : add(walking(t - t0), t - t0 < 0.8 ? push : [0, 0, 0])

describe('pas et sens de la marche', () => {
  it('compte les pas d’une marche reconnue, les premiers compris', () => {
    const d = feed(null, 0, 6, setOff(1, [0, 0, -1.2]))
    // 5 s de marche à deux pas par seconde.
    expect(d!.walked).toBeGreaterThanOrEqual(9)
    expect(d!.walked).toBeLessThanOrEqual(11)
    expect(d!.walked).toBe(d!.total)
  })

  it('un geste isolé ne fait pas avancer', () => {
    const lift = (t: number): Vec3 => [0, t >= 3 && t < 4 ? 1.5 * Math.sin(2 * Math.PI * (t - 3)) : 0, 0]
    const d = feed(null, 0, 6, (t) => add(tremor(t), lift(t)))
    expect(d!.walked).toBe(0)
  })

  it('en avançant vers ce que vise la caméra : droit devant', () => {
    // La caméra vise −z : l'élan vers l'avant est une accélération selon −z.
    const [f, r] = feed(null, 0, 4, setOff(1, [0, 0, -1.2]))!.direction!
    expect(f).toBeGreaterThan(0.9)
    expect(Math.abs(r)).toBeLessThan(0.4)
  })

  it('en reculant (face à la photo) : vers l’arrière', () => {
    const [f, r] = feed(null, 0, 4, setOff(1, [0, 0, 1.2]))!.direction!
    expect(f).toBeLessThan(-0.9)
    expect(Math.abs(r)).toBeLessThan(0.4)
  })

  it('en marchant de côté : vers la droite', () => {
    const [f, r] = feed(null, 0, 4, setOff(1, [1.2, 0, 0]))!.direction!
    expect(r).toBeGreaterThan(0.9)
    expect(Math.abs(f)).toBeLessThan(0.4)
  })

  it('sans élan net (balancement sur place) : sens inconnu, les pas ne déplacent rien', () => {
    expect(feed(null, 0, 4, setOff(1, [0, 0, 0]))!.direction).toBeNull()
  })

  it('avant toute marche : sens inconnu', () => {
    expect(feed(null, 0, 2, tremor)!.direction).toBeNull()
  })
})

describe('sens de la marche sur le terrain', () => {
  const east = basisFromAngles({ heading: 90, pitch: 0, roll: 0 })
  const close = (v: [number, number] | null, e: number, n: number) => {
    expect(v![0]).toBeCloseTo(e, 5)
    expect(v![1]).toBeCloseTo(n, 5)
  }

  it('caméra vers l’est : avancer va à l’est, reculer à l’ouest, à droite au sud', () => {
    close(stepDirection(east, [1, 0]), 1, 0)
    close(stepDirection(east, [-1, 0]), -1, 0)
    close(stepDirection(east, [0, 1]), 0, -1)
  })

  it('caméra levée vers le ciel : l’avant reste celui où l’on regarde', () => {
    close(stepDirection(basisFromAngles({ heading: 0, pitch: 40, roll: 0 }), [1, 0]), 0, 1)
  })

  it('téléphone à plat : l’avant est le haut de l’écran', () => {
    close(stepDirection(basisFromAngles({ heading: 180, pitch: -89, roll: 0 }), [1, 0]), 0, -1)
  })
})

describe('convention de signe de l’accéléromètre', () => {
  const upright = basisFromAngles({ heading: 90, pitch: 0, roll: 0 })

  it('norme : pesanteur comprise vers le haut de l’écran, téléphone tenu droit', () => {
    expect(accelerometerSign(upright, [0, 9.81, 0])).toBe(1)
  })

  it('capteur inversé : le sens de la marche doit l’être aussi', () => {
    expect(accelerometerSign(upright, [0, -9.81, 0])).toBe(-1)
  })

  it('téléphone à plat : la pesanteur sort de l’écran', () => {
    expect(accelerometerSign(basisFromAngles({ heading: 0, pitch: -90, roll: 0 }), [0, 0, 9.81])).toBe(1)
  })

  it('sans pesanteur connue, ou orientation qui ne colle pas : on ne tranche pas', () => {
    expect(accelerometerSign(upright, null)).toBeNull()
    expect(accelerometerSign(upright, [9.81, 0, 0])).toBeNull()
  })

  it('le détecteur mesure la pesanteur dans ce repère', () => {
    const d = feed(null, 0, 1, tremor)
    expect(accelerometerSign(upright, d!.gravity)).toBe(1)
  })
})
