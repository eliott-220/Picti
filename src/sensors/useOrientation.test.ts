import { afterEach, describe, expect, it, vi } from 'vitest'

const KEY = 'picti.autorisation.boussole'
const flush = () => new Promise((r) => setTimeout(r, 0))

/**
 * iOS simulé, boussole déjà accordée à une ouverture précédente : `requestPermission` est rejetée sans
 * appui (comme WebKit au lancement et à la fin d'un glissé, vu au simulateur le 14/10) et répond sur un appui.
 */
function fakeIos(answerOnTap: 'granted' | 'denied' = 'granted') {
  const listeners = new Map<string, Set<() => void>>()
  const store = new Map([[KEY, 'accordee']])
  let tap = false
  const requestPermission = vi.fn(() =>
    tap
      ? Promise.resolve(answerOnTap)
      : Promise.reject(new DOMException('Requesting device orientation access requires a user gesture to prompt', 'NotAllowedError')),
  )
  vi.stubGlobal('window', {})
  vi.stubGlobal('DeviceOrientationEvent', { requestPermission })
  vi.stubGlobal('DeviceMotionEvent', { requestPermission: () => Promise.reject(new Error('sans appui')) })
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => store.set(k, v),
    removeItem: (k: string) => store.delete(k),
  })
  vi.stubGlobal('document', {
    addEventListener: (type: string, fn: () => void) => listeners.set(type, (listeners.get(type) ?? new Set()).add(fn)),
    removeEventListener: (type: string, fn: () => void) => listeners.get(type)?.delete(fn),
  })
  return {
    requestPermission,
    store,
    listening: (type: string) => listeners.get(type)?.size ?? 0,
    /** Fin d'un geste : un appui (`isTap`) ou un glissé, qu'iOS ne compte pas comme un appui. */
    async gesture(type: 'touchend' | 'click', isTap: boolean) {
      tap = isTap
      for (const l of [...(listeners.get(type) ?? [])]) l()
      await flush()
      tap = false
    },
  }
}

async function load() {
  vi.resetModules()
  const mod = await import('./useOrientation')
  await flush() // Demande du lancement, rejetée sans appui.
  return mod
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('réactivation de la boussole au lancement (iOS)', () => {
  it('attend un appui : un glissé, rejeté par iOS, ne retire pas les écouteurs (0.24.4)', async () => {
    const ios = fakeIos()
    const { orientationNeedsPermission } = await load()
    expect(ios.requestPermission).toHaveBeenCalledTimes(1)
    expect(ios.listening('touchend')).toBe(1)
    expect(ios.listening('click')).toBe(1)

    await ios.gesture('touchend', false)
    expect(ios.requestPermission).toHaveBeenCalledTimes(2)
    expect(orientationNeedsPermission()).toBe(true)
    expect(ios.listening('touchend')).toBe(1)
    expect(ios.store.get(KEY)).toBe('accordee')

    await ios.gesture('touchend', true)
    expect(ios.requestPermission).toHaveBeenCalledTimes(3)
    expect(orientationNeedsPermission()).toBe(false)
    expect(ios.listening('touchend')).toBe(0)
    expect(ios.listening('click')).toBe(0)
  })

  it('le clic d’un appui réessaie aussi', async () => {
    const ios = fakeIos()
    const { orientationNeedsPermission } = await load()
    await ios.gesture('click', true)
    expect(orientationNeedsPermission()).toBe(false)
    expect(ios.listening('touchend')).toBe(0)
  })

  it('refusée sur l’appui : on arrête et on oublie l’accès', async () => {
    const ios = fakeIos('denied')
    const { orientationNeedsPermission } = await load()
    await ios.gesture('touchend', true)
    expect(orientationNeedsPermission()).toBe(true)
    expect(ios.listening('touchend')).toBe(0)
    expect(ios.store.has(KEY)).toBe(false)
  })

  it('requestCompass : un rejet faute d’appui n’est pas un refus', async () => {
    const ios = fakeIos()
    const { requestCompass } = await load()
    await expect(requestCompass()).resolves.toBe(false)
    expect(ios.store.get(KEY)).toBe('accordee')
  })
})
