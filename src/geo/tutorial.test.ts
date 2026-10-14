import { describe, expect, it } from 'vitest'
import { coverViewport } from './optics'
import { basisFromAngles, rotateAboutUp } from './orientation'
import {
  alignmentLevel,
  canCaptureRelative,
  halfField,
  plateLook,
  plateInView,
  plateOffset,
  plateOffView,
  alignmentPulse,
  pulseInterval,
  relativeError,
  TUTORIAL,
} from './tutorial'

// Repère relatif (cap arbitraire) : seule la rotation depuis la prise compte.
const shot = basisFromAngles({ heading: 37, pitch: 4, roll: 2 })
const turned = (dHeading: number, dPitch = 0) => basisFromAngles({ heading: 37 + dHeading, pitch: 4 + dPitch, roll: 2 })
/** Écran de téléphone en portrait, image 3:4 de la caméra 26 mm affichée en « cover ». */
const cam = coverViewport(1440, 1920, 390, 844, 26)

describe('plaque hors champ (étape 2 → 3)', () => {
  const half = halfField(cam)

  it('demi-champs d’un écran en portrait : plus haut que large', () => {
    expect(half.y).toBeGreaterThan(half.x)
    expect(half.x).toBeGreaterThan(10)
  })

  it('juste après la prise, la plaque est au centre', () => {
    const o = plateOffset(shot, shot)
    expect(o.x).toBeCloseTo(0, 6)
    expect(o.y).toBeCloseTo(0, 6)
    expect(plateOffView(o, half)).toBe(false)
  })

  it('en tournant à droite, elle part à gauche', () => {
    expect(plateOffset(shot, turned(15)).x).toBeCloseTo(-15, 0)
    expect(plateOffset(shot, turned(-15)).x).toBeCloseTo(15, 0)
  })

  it('sortie seulement au-delà du demi-champ + 10°, d’un côté comme de l’autre', () => {
    for (const side of [1, -1]) {
      expect(plateOffView(plateOffset(shot, turned(side * (half.x + 8))), half)).toBe(false)
      expect(plateOffView(plateOffset(shot, turned(side * (half.x + 12))), half)).toBe(true)
    }
  })

  it('aussi en levant ou en baissant beaucoup le téléphone', () => {
    expect(plateOffView(plateOffset(shot, turned(0, half.y + 5)), half)).toBe(false)
    expect(plateOffView(plateOffset(shot, turned(0, -(half.y + 12))), half)).toBe(true)
  })

  it('capture : seulement le centre de la plaque à l’écran (demi-champ plus étroit que 20°)', () => {
    expect(half.x).toBeLessThan(TUTORIAL.heading)
    expect(plateInView(plateOffset(shot, turned(half.x - 2)), half)).toBe(true)
    expect(plateInView(plateOffset(shot, turned(-(half.x + 2))), half)).toBe(false)
    expect(canCaptureRelative(relativeError(shot, turned(half.x + 2)))).toBe(true)
  })

  it('dos à la plaque : hors champ', () => {
    expect(plateOffView(plateOffset(shot, turned(180)), half)).toBe(true)
  })

  it('ne dépend pas du cap absolu (boussole fausse) : seule la rotation compte', () => {
    for (const offset of [0, 90, 213]) {
      const a = rotateAboutUp(shot, offset)
      const b = rotateAboutUp(turned(40), offset)
      expect(plateOffset(a, b).x).toBeCloseTo(plateOffset(shot, turned(40)).x, 6)
      expect(relativeError(a, b).heading).toBeCloseTo(relativeError(shot, turned(40)).heading, 6)
    }
  })
})

describe('niveau d’alignement (netteté, opacité, vibrations)', () => {
  it('1 sur la plaque, ½ à la limite des tolérances, presque nul loin', () => {
    expect(alignmentLevel({ heading: 0, pitch: 0 })).toBe(1)
    expect(alignmentLevel({ heading: TUTORIAL.heading, pitch: 0 })).toBeCloseTo(0.5, 6)
    expect(alignmentLevel({ heading: 0, pitch: -TUTORIAL.pitch })).toBeCloseTo(0.5, 6)
    expect(alignmentLevel({ heading: 60, pitch: 0 })).toBeLessThan(0.01)
  })

  it('croît quand on se rapproche', () => {
    const levels = [80, 50, 30, 15, 5, 0].map((h) => alignmentLevel({ heading: h, pitch: 0 }))
    for (let i = 1; i < levels.length; i++) expect(levels[i]).toBeGreaterThan(levels[i - 1])
  })

  it('plaque floue et pâle loin, nette et presque opaque dessus', () => {
    expect(plateLook(0)).toEqual({ opacity: TUTORIAL.minOpacity, blur: TUTORIAL.maxBlur })
    expect(plateLook(1)).toEqual({ opacity: TUTORIAL.maxOpacity, blur: 0 })
    expect(plateLook(0.5).blur).toBeCloseTo(TUTORIAL.maxBlur / 2, 6)
    expect(plateLook(2)).toEqual(plateLook(1))
  })

  it('vibrations : aucune loin, de plus en plus rapprochées, rapides dessus', () => {
    expect(pulseInterval(0)).toBeNull()
    expect(pulseInterval(0.05)).toBeNull()
    expect(pulseInterval(Number.NaN)).toBeNull()
    expect(pulseInterval(1)).toBe(TUTORIAL.pulseFast)
    const intervals = [0.1, 0.3, 0.5, 0.7, 0.9].map((l) => pulseInterval(l)!)
    for (let i = 1; i < intervals.length; i++) expect(intervals[i]).toBeLessThan(intervals[i - 1])
    expect(intervals[0]).toBeLessThanOrEqual(TUTORIAL.pulseSlow)
  })

  it('impulsions plafonnées : jamais moins de 120 ms entre deux ; tick loin, strong au-delà de la moitié', () => {
    expect(alignmentPulse(0)).toBeNull()
    for (let l = 0.08; l <= 2; l += 0.01) expect(alignmentPulse(l)!.gap).toBeGreaterThanOrEqual(120)
    expect(alignmentPulse(0.3)!.kind).toBe('tick')
    expect(alignmentPulse(0.5)!.kind).toBe('strong')
    expect(alignmentPulse(1)).toEqual({ gap: 120, kind: 'strong' })
  })
})

describe('capture en orientation relative', () => {
  it('cap à ±20° et inclinaison à ±15° de la prise', () => {
    expect(canCaptureRelative(relativeError(shot, shot))).toBe(true)
    expect(canCaptureRelative(relativeError(shot, turned(19)))).toBe(true)
    expect(canCaptureRelative(relativeError(shot, turned(-19, 14)))).toBe(true)
    expect(canCaptureRelative(relativeError(shot, turned(21)))).toBe(false)
    expect(canCaptureRelative(relativeError(shot, turned(0, -16)))).toBe(false)
  })

  it('écarts signés : > 0 → tourner à droite / lever', () => {
    const e = relativeError(shot, turned(-10, -5))
    expect(e.heading).toBeCloseTo(10, 6)
    expect(e.pitch).toBeCloseTo(5, 6)
  })

  it('passe le nord sans sauter (cap 355° → 5°)', () => {
    const a = basisFromAngles({ heading: 355, pitch: 0, roll: 0 })
    const b = basisFromAngles({ heading: 5, pitch: 0, roll: 0 })
    expect(relativeError(a, b).heading).toBeCloseTo(-10, 6)
    expect(canCaptureRelative(relativeError(a, b))).toBe(true)
  })
})
