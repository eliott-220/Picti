import { describe, expect, it, vi } from 'vitest'
import { localToGeo } from '../geo/arAlign'
import { distanceMeters } from '../geo/geodesy'

vi.mock('@capacitor/core', () => ({
  Capacitor: { getPlatform: () => 'web', isNativePlatform: () => false, convertFileSrc: (p: string) => p },
  registerPlugin: () => ({}),
  SystemBars: { setStyle: () => Promise.resolve() },
  SystemBarsStyle: {},
  SystemBarType: {},
}))

const { AR_REFINE, refinement } = await import('./arTracking')

const REF = { lat: 46.1558, lon: -1.152 }

describe('photo prise pendant une session : replacée quand le calage s’affine', () => {
  const t0 = { ref: REF, theta: 100, e0: 0, n0: 0 }
  const shot = {
    id: 'p',
    q: [4, 2] as const,
    theta: 100,
    heading: 250,
    position: localToGeo(t0, [4, 2]),
    accuracy: 5,
    written: 0,
  }

  it('nouvelle position et nouveau cap d’après le nouveau calage', () => {
    const t1 = { ref: REF, theta: 104, e0: 1.5, n0: -0.5 }
    const r = refinement(shot, t1, 3.2, AR_REFINE.every)!
    expect(distanceMeters(r.position, localToGeo(t1, [4, 2]))).toBeLessThan(1e-6)
    expect(r.heading).toBeCloseTo(254, 9)
    expect(r.accuracy).toBe(3.2)
  })

  it('pas trop souvent, seulement plus précise, seulement si elle bouge vraiment', () => {
    const t1 = { ref: REF, theta: 104, e0: 1.5, n0: -0.5 }
    expect(refinement(shot, t1, 3.2, AR_REFINE.every - 1)).toBeNull()
    expect(refinement(shot, t1, 4.9, AR_REFINE.every)).toBeNull()
    expect(refinement(shot, { ...t0, e0: 0.2, theta: 100.5 }, 3, AR_REFINE.every)).toBeNull()
    // Le cap seul suffit : 2° de plus.
    expect(refinement(shot, { ...t0, theta: 102 }, 3, AR_REFINE.every)?.heading).toBeCloseTo(252, 9)
  })
})
