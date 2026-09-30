import { describe, expect, it } from 'vitest'
import { TOLERANCE_SCORE } from '../geo/alignment'
import { HUNT_COLOR, huntSaturation, photoInColor } from './photoColor'

const ctx = { userId: 'moi', capturedIds: new Set(['capturee']) }

describe('couleur des photos', () => {
  it('mes photos sont en couleur', () => {
    expect(photoInColor({ id: 'a', owner: 'moi' }, ctx)).toBe(true)
  })

  it('les photos que j’ai capturées sont en couleur', () => {
    expect(photoInColor({ id: 'capturee', owner: 'camille' }, ctx)).toBe(true)
  })

  it('les photos des autres pas encore chassées sont en noir et blanc', () => {
    expect(photoInColor({ id: 'b', owner: 'camille' }, ctx)).toBe(false)
  })

  it('auteur inconnu : noir et blanc, sauf capture', () => {
    expect(photoInColor({ id: 'b' }, ctx)).toBe(false)
    expect(photoInColor({ id: 'capturee', owner: null }, ctx)).toBe(true)
  })
})

describe('couleur progressive pendant la chasse', () => {
  it('loin ou mal aligné : noir et blanc', () => {
    expect(huntSaturation(0)).toBe(0)
    expect(huntSaturation(HUNT_COLOR.start)).toBe(0)
  })

  it('presque aligné (limite des tolérances de capture) : 40 % de couleur', () => {
    expect(TOLERANCE_SCORE).toBeGreaterThan(0.4)
    expect(TOLERANCE_SCORE).toBeLessThan(0.55)
    expect(huntSaturation(TOLERANCE_SCORE)).toBeCloseTo(0.4, 6)
    expect(huntSaturation(1)).toBeCloseTo(0.4, 6)
  })

  it('monte en douceur, sans jamais redescendre en s’alignant mieux', () => {
    const mid = (HUNT_COLOR.start + TOLERANCE_SCORE) / 2
    expect(huntSaturation(mid)).toBeCloseTo(0.2, 6)
    let prev = 0
    for (let s = 0; s <= 1; s += 0.01) {
      const v = huntSaturation(s)
      expect(v).toBeGreaterThanOrEqual(prev)
      prev = v
    }
    // Courbe douce : départ et arrivée à pente nulle.
    expect(huntSaturation(HUNT_COLOR.start + 0.01)).toBeLessThan(0.01)
  })
})
