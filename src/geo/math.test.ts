import { describe, expect, it } from 'vitest'
import { angleDiffDeg, approach, normalizeDeg } from './math'

describe('angles', () => {
  it('ramène les angles dans [0, 360) et donne l’écart le plus court', () => {
    expect(normalizeDeg(-90)).toBe(270)
    expect(normalizeDeg(725)).toBe(5)
    expect(angleDiffDeg(350, 10)).toBe(20)
    expect(angleDiffDeg(10, 350)).toBe(-20)
  })
})

describe('approach', () => {
  it('comble l’écart progressivement, sans le dépasser', () => {
    const a = approach([0, 0, 0], [10, -4, 0], 100, 100)
    expect(a[0]).toBeCloseTo(10 * (1 - Math.exp(-1)))
    expect(a[1]).toBeCloseTo(-4 * (1 - Math.exp(-1)))
    expect(approach([0, 0, 0], [10, 0, 0], 10_000, 100)[0]).toBeCloseTo(10)
    expect(approach([1, 2, 3], [10, 0, 0], 0, 100)).toEqual([1, 2, 3])
  })
})
