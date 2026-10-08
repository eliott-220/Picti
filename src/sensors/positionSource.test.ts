import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { NativeLocation } from '../native'

// Coque simulée : plateforme et faux plugin `Position` (écouteurs, démarrage qui peut échouer).
const native = vi.hoisted(() => {
  const listeners = new Map<string, Set<(data: unknown) => void>>()
  return {
    platform: 'ios',
    listeners,
    startFails: false,
    removed: 0,
    stop: vi.fn(() => Promise.resolve()),
    emit(event: string, data: unknown) {
      listeners.get(event)?.forEach((l) => l(data))
    },
  }
})
vi.mock('@capacitor/core', () => ({
  Capacitor: {
    getPlatform: () => native.platform,
    isNativePlatform: () => native.platform !== 'web',
  },
  registerPlugin: (name: string) =>
    name !== 'Position'
      ? {}
      : {
          addListener(event: string, fn: (data: unknown) => void) {
            const set = native.listeners.get(event) ?? new Set()
            set.add(fn)
            native.listeners.set(event, set)
            return Promise.resolve({
              remove: () => {
                set.delete(fn)
                native.removed++
                return Promise.resolve()
              },
            })
          },
          start: () =>
            native.startFails
              ? Promise.reject(new Error('"Position" plugin is not implemented on ios'))
              : Promise.resolve({ authorization: 'whenInUse', precise: true }),
          stop: native.stop,
        },
  SystemBars: { setStyle: () => Promise.resolve() },
  SystemBarsStyle: {},
  SystemBarType: {},
}))

const { nativeFix, nextPrecise, watchPositionSource, webFix } = await import('./positionSource')

const location = (over: Partial<NativeLocation> = {}): NativeLocation => ({
  lat: 46.15,
  lon: -1.15,
  accuracy: 4.2,
  altitude: 12,
  altitudeAccuracy: 3,
  speed: 1.3,
  speedAccuracy: 0.2,
  course: 87,
  courseAccuracy: 9,
  timestamp: 1_000_000,
  simulated: false,
  ...over,
})

const flush = () => new Promise((r) => setTimeout(r, 0))

/** Faux `navigator.geolocation` : ce que la page demanderait au navigateur. */
const web = { watchPosition: vi.fn(() => 7), clearWatch: vi.fn() }

beforeEach(() => {
  vi.stubGlobal('navigator', { geolocation: web })
})

afterEach(() => {
  native.platform = 'ios'
  native.startFails = false
  native.removed = 0
  native.listeners.clear()
  native.stop.mockClear()
  web.watchPosition.mockClear()
  web.clearWatch.mockClear()
  vi.unstubAllGlobals()
})

describe('relevé d’iOS', () => {
  it('garde la mesure, son instant et la vitesse / le cap du GPS', () => {
    expect(nativeFix(location(), 2_000_000)).toEqual({
      lat: 46.15,
      lon: -1.15,
      alt: 12,
      accuracy: 4.2,
      timestamp: 1_000_000,
      speed: 1.3,
      speedAccuracy: 0.2,
      course: 87,
      courseAccuracy: 9,
    })
  })

  it('valeurs inconnues → null, précision d’au moins 1 m, jamais dans le futur', () => {
    const fix = nativeFix(location({ altitude: null, speed: null, course: null, courseAccuracy: null, accuracy: 0.4, timestamp: 5000 }), 3000)
    expect(fix).toMatchObject({ alt: null, speed: null, course: null, courseAccuracy: null, accuracy: 1, timestamp: 3000 })
  })

  it('relevé inutilisable : écarté', () => {
    expect(nativeFix(location({ accuracy: -1 }))).toBeNull()
    expect(nativeFix(location({ lat: Number.NaN }))).toBeNull()
    expect(nativeFix(location({ lat: 120 }))).toBeNull()
  })
})

describe('relevé du navigateur', () => {
  it('heure de réception, cap NaN (à l’arrêt) → null', () => {
    const pos = {
      coords: { latitude: 1, longitude: 2, altitude: null, accuracy: 6, speed: 0, heading: Number.NaN },
      timestamp: 1,
    } as unknown as GeolocationPosition
    expect(webFix(pos, 42)).toMatchObject({ lat: 1, lon: 2, accuracy: 6, timestamp: 42, speed: 0, course: null, courseAccuracy: null })
  })
})

describe('source des relevés', () => {
  it('dans le navigateur : `watchPosition` haute précision, sans cache', () => {
    const stop = watchPositionSource({ fix: vi.fn(), error: vi.fn() }, false)
    expect(web.watchPosition).toHaveBeenCalledWith(expect.any(Function), expect.any(Function), {
      enableHighAccuracy: true,
      maximumAge: 0,
      timeout: 30_000,
    })
    stop()
    expect(web.clearWatch).toHaveBeenCalledWith(7)
  })

  it('dans l’app iOS : relevés, état et erreurs viennent d’iOS ; la page ne demande rien', async () => {
    const h = { fix: vi.fn(), error: vi.fn(), status: vi.fn() }
    const stop = watchPositionSource(h, true)
    await flush()
    expect(web.watchPosition).not.toHaveBeenCalled()
    expect(h.status).toHaveBeenCalledWith({ authorization: 'whenInUse', precise: true })
    native.emit('location', location({ timestamp: Date.now() - 100 }))
    expect(h.fix).toHaveBeenCalledTimes(1)
    native.emit('location', location({ accuracy: -1 }))
    expect(h.fix).toHaveBeenCalledTimes(1)
    native.emit('error', { code: 'denied', message: 'Accès à la position refusé' })
    expect(h.error).toHaveBeenCalledWith('Accès à la position refusé', 'denied')
    stop()
    await flush()
    expect(native.stop).toHaveBeenCalled()
    expect(native.removed).toBe(3)
    native.emit('location', location())
    expect(h.fix).toHaveBeenCalledTimes(1)
  })

  it('plugin absent (page plus récente que l’app) : la page reprend la main', async () => {
    native.startFails = true
    const h = { fix: vi.fn(), error: vi.fn(), status: vi.fn() }
    const stop = watchPositionSource(h, true)
    await flush()
    expect(web.watchPosition).toHaveBeenCalledTimes(1)
    expect(native.removed).toBe(3)
    stop()
    expect(web.clearWatch).toHaveBeenCalledWith(7)
    expect(native.stop).not.toHaveBeenCalled()
  })
})

describe('« Position exacte » (app iOS)', () => {
  it('proposée par iOS une fois, puis désactivée tant que l’utilisateur ne l’active pas', () => {
    expect(nextPrecise(null, true, false)).toBe('full')
    expect(nextPrecise(null, false, false)).toBe('asking')
    expect(nextPrecise('asking', false, true)).toBe('asking')
    expect(nextPrecise(null, false, true)).toBe('reduced')
    expect(nextPrecise('full', false, true)).toBe('reduced')
    expect(nextPrecise('reduced', true, true)).toBe('full')
  })
})
