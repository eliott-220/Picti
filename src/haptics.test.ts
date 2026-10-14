import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'

// Vibrations (0.24.0) : un seul chemin, `haptic()` de `src/native.ts` — `navigator.vibrate` ne fait rien sur
// iPhone, seul Capacitor Haptics y fait vibrer le téléphone.

const capacitor = vi.hoisted(() => ({ platform: 'web' }))
vi.mock('@capacitor/core', () => ({
  Capacitor: { getPlatform: () => capacitor.platform, isNativePlatform: () => capacitor.platform !== 'web' },
  registerPlugin: () => ({}),
}))
const engine = vi.hoisted(() => ({
  impact: vi.fn<(options: { style: string }) => Promise<void>>(() => Promise.resolve()),
  notification: vi.fn<(options: { type: string }) => Promise<void>>(() => Promise.resolve()),
}))
vi.mock('@capacitor/haptics', () => ({
  Haptics: engine,
  ImpactStyle: { Light: 'LIGHT', Medium: 'MEDIUM', Heavy: 'HEAVY' },
  NotificationType: { Success: 'SUCCESS' },
}))

const { haptic, WEB_VIBRATION } = await import('./native')
const { setDeviceSetting, deviceSetting } = await import('./data/deviceSettings')

const vibrate = vi.fn()
vi.stubGlobal('navigator', { vibrate })
// Le moteur est chargé à la demande : on laisse passer l'import et la promesse.
const settle = () => new Promise((r) => setTimeout(r, 0))

afterEach(() => {
  capacitor.platform = 'web'
  setDeviceSetting('vibrations', true)
  vibrate.mockClear()
  engine.impact.mockClear()
  engine.notification.mockClear()
})

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return sources(path)
    return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) && !name.endsWith('.d.ts') ? [path] : []
  })
}

describe('vibrations : tout passe par haptic()', () => {
  it('aucun appel direct à navigator.vibrate ni au moteur ailleurs que dans native.ts', () => {
    const root = join(import.meta.dirname, '..')
    const direct = sources(join(root, 'src'))
      .filter((f) => !f.endsWith(join('src', 'native.ts')))
      .filter((f) => /navigator\s*\.\s*vibrate|vibrate\?\.\(|Haptics\s*\.\s*(impact|notification|vibrate|selection)/.test(readFileSync(f, 'utf8')))
      .map((f) => relative(root, f))
    expect(direct).toEqual([])
  })

  it('navigateur (Android) : navigator.vibrate, un motif par retour', () => {
    for (const kind of ['tick', 'strong', 'clac', 'success'] as const) {
      haptic(kind)
      expect(vibrate).toHaveBeenLastCalledWith(WEB_VIBRATION[kind])
    }
    expect(vibrate).toHaveBeenCalledTimes(4)
  })

  it('app iPhone : le moteur du téléphone (Capacitor Haptics), jamais navigator.vibrate', async () => {
    capacitor.platform = 'ios'
    haptic('tick')
    haptic('strong')
    haptic('clac', { shutter: true })
    haptic('success')
    await settle()
    await settle()
    expect(engine.impact.mock.calls.map(([o]) => o.style)).toEqual(['LIGHT', 'MEDIUM', 'HEAVY'])
    expect(engine.notification).toHaveBeenCalledWith({ type: 'SUCCESS' })
    expect(vibrate).not.toHaveBeenCalled()
  })

  it('« Vibrations » coupées : plus rien, sauf le retour du déclencheur', async () => {
    expect(deviceSetting('vibrations')).toBe(true)
    setDeviceSetting('vibrations', false)
    haptic('tick')
    haptic('success')
    expect(vibrate).not.toHaveBeenCalled()
    haptic('clac', { shutter: true })
    expect(vibrate).toHaveBeenCalledWith(WEB_VIBRATION.clac)
    capacitor.platform = 'ios'
    haptic('strong')
    haptic('tick', { shutter: true })
    await settle()
    await settle()
    expect(engine.impact.mock.calls.map(([o]) => o.style)).toEqual(['LIGHT'])
    setDeviceSetting('vibrations', true)
    haptic('strong', { native: false })
    expect(vibrate).toHaveBeenLastCalledWith(WEB_VIBRATION.strong)
  })
})
