import { describe, expect, it } from 'vitest'
import { bearingDeg, compassPoint, distanceMeters, formatDistance, fromENU, toENU } from './geodesy'

const LA_ROCHELLE = { lat: 46.1591, lon: -1.1520 }

describe('distanceMeters', () => {
  it('mesure Paris – Lyon à ~392 km', () => {
    const d = distanceMeters({ lat: 48.8566, lon: 2.3522 }, { lat: 45.764, lon: 4.8357 })
    expect(d / 1000).toBeCloseTo(392, -1)
  })

  it('vaut 0 pour un même point', () => {
    expect(distanceMeters(LA_ROCHELLE, LA_ROCHELLE)).toBe(0)
  })
})

describe('bearingDeg', () => {
  it('donne 0° plein nord et 90° plein est', () => {
    expect(bearingDeg({ lat: 0, lon: 0 }, { lat: 1, lon: 0 })).toBeCloseTo(0)
    expect(bearingDeg({ lat: 0, lon: 0 }, { lat: 0, lon: 1 })).toBeCloseTo(90)
    expect(bearingDeg({ lat: 0, lon: 0 }, { lat: -1, lon: 0 })).toBeCloseTo(180)
    expect(bearingDeg({ lat: 0, lon: 0 }, { lat: 0, lon: -1 })).toBeCloseTo(270)
  })
})

describe('repère ENU', () => {
  it('place un point 0,001° plus au nord à ~111 m', () => {
    const [e, n] = toENU(LA_ROCHELLE, { lat: LA_ROCHELLE.lat + 0.001, lon: LA_ROCHELLE.lon })
    expect(e).toBeCloseTo(0)
    expect(n).toBeCloseTo(111.2, 0)
  })

  it('est cohérent avec la distance orthodromique', () => {
    const p = { lat: 46.16, lon: -1.15 }
    const [e, n] = toENU(LA_ROCHELLE, p)
    expect(Math.hypot(e, n)).toBeCloseTo(distanceMeters(LA_ROCHELLE, p), 0)
  })

  it('fromENU inverse toENU', () => {
    const p = fromENU(LA_ROCHELLE, [42, -17, 0])
    const [e, n] = toENU(LA_ROCHELLE, p)
    expect(e).toBeCloseTo(42, 6)
    expect(n).toBeCloseTo(-17, 6)
  })
})

describe('formatage', () => {
  it('nomme les points cardinaux', () => {
    expect(compassPoint(0)).toBe('N')
    expect(compassPoint(44)).toBe('NE')
    expect(compassPoint(180)).toBe('S')
    expect(compassPoint(260)).toBe('O')
    expect(compassPoint(350)).toBe('N')
  })

  it('formate les distances', () => {
    expect(formatDistance(7.6)).toBe('8 m')
    expect(formatDistance(350)).toBe('350 m')
    expect(formatDistance(1234)).toBe('1,2 km')
  })
})
