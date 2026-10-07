import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/** Faux `localStorage` (ou un stockage qui refuse tout, comme en navigation privée). */
function fakeStorage(initial: Record<string, string> = {}, broken = false) {
  const data = new Map(Object.entries(initial))
  const fail = () => {
    throw new Error('stockage indisponible')
  }
  return {
    data,
    getItem: (k: string) => (broken ? fail() : (data.get(k) ?? null)),
    setItem: (k: string, v: string) => (broken ? fail() : void data.set(k, v)),
    removeItem: (k: string) => void data.delete(k),
  }
}

/** Le module lit le stockage à son chargement : on le recharge à chaque cas. */
async function load(storage: ReturnType<typeof fakeStorage>) {
  vi.stubGlobal('localStorage', storage)
  vi.resetModules()
  return import('./shotVisibility')
}

describe('mode des prochaines photos', () => {
  beforeEach(() => vi.unstubAllGlobals())
  afterEach(() => vi.unstubAllGlobals())

  it('est Public à la première ouverture', async () => {
    const m = await load(fakeStorage())
    expect(m.getShotVisibility()).toBe('public')
  })

  it('garde le mode choisi pour les ouvertures suivantes', async () => {
    const storage = fakeStorage()
    const first = await load(storage)
    first.setShotVisibility('amis')
    expect(first.getShotVisibility()).toBe('amis')
    expect(storage.data.get('picti.visibilite')).toBe('amis')
    const next = await load(storage)
    expect(next.getShotVisibility()).toBe('amis')
  })

  it('ignore une valeur enregistrée inconnue', async () => {
    const m = await load(fakeStorage({ 'picti.visibilite': 'tout-le-monde' }))
    expect(m.getShotVisibility()).toBe('public')
  })

  it('marche sans stockage (navigation privée) : le choix tient jusqu’à la fermeture', async () => {
    const m = await load(fakeStorage({}, true))
    expect(m.getShotVisibility()).toBe('public')
    m.setShotVisibility('prive')
    expect(m.getShotVisibility()).toBe('prive')
    expect(m.takeVisibilityHint()).toBe(false)
  })

  it('rappelle le geste trois fois, et plus du tout après un changement de mode', async () => {
    const storage = fakeStorage()
    const m = await load(storage)
    expect([m.takeVisibilityHint(), m.takeVisibilityHint(), m.takeVisibilityHint(), m.takeVisibilityHint()])
      .toEqual([true, true, true, false])
    const fresh = await load(fakeStorage())
    expect(fresh.takeVisibilityHint()).toBe(true)
    fresh.setShotVisibility('public')
    expect(fresh.takeVisibilityHint()).toBe(false)
  })
})
