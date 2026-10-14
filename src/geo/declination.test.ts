import { describe, expect, it } from 'vitest'
import { declinationAt, toAppNorth } from './declination'

describe('nord vrai / nord magnétique (0.24.0)', () => {
  it('un cap vrai (T) est ramené au nord magnétique ; un cap magnétique (M) ne bouge pas', () => {
    expect(toAppNorth(250, 'T', 1.2)).toBeCloseTo(248.8, 6)
    expect(toAppNorth(250, 'M', 1.2)).toBe(250)
    expect(toAppNorth(0.5, 'T', 1.2)).toBeCloseTo(359.3, 6)
    expect(toAppNorth(359, 'T', -12.5)).toBeCloseTo(11.5, 6)
    // Référence absente : laissé tel quel.
    expect(toAppNorth(90, null, 5)).toBe(90)
  })

  it('déclinaison du lieu (WMM 2025), le 13/10/2026', async () => {
    const day = new Date('2026-10-13T12:00:00Z')
    const cases: [string, number, number, number][] = [
      ['La Rochelle', 46.159, -1.152, 1.2],
      ['Paris', 48.857, 2.352, 2.1],
      ['New York', 40.71, -74.0, -12.5],
      ['Sydney', -33.87, 151.21, 12.8],
      ['Reykjavik', 64.15, -21.94, -11.0],
    ]
    for (const [, lat, lon, expected] of cases) expect(await declinationAt(lat, lon, day)).toBeCloseTo(expected, 0)
  })
})
