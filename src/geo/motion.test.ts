import { describe, expect, it } from 'vitest'
import { add, type Vec3 } from './math'
import { feedMotion, motionState, type MotionDetector } from './motion'

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
