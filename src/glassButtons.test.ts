import { describe, expect, it, vi } from 'vitest'

vi.mock('@capacitor/core', () => ({
  Capacitor: { getPlatform: () => 'web', isNativePlatform: () => false },
  registerPlugin: () => ({}),
  SystemBars: {},
  SystemBarsStyle: {},
  SystemBarType: {},
}))

const { badgeText, glassSymbol, toSpec } = await import('./glassButtons')

const rect = { x: 309.26, y: 79.74, width: 48, height: 48 }

describe('boutons Liquid Glass', () => {
  it('ont un symbole SF pour chaque bouton du viseur', () => {
    for (const icon of [
      'bell', 'pin', 'filter', 'search', 'flipCamera', 'plus', 'grid', 'close', 'back', 'pencil', 'compass', 'arrow', 'qr',
    ] as const) {
      expect(glassSymbol(icon)).toBeTruthy()
    }
    expect(glassSymbol('heart')).toBeNull()
  })

  it('reprennent la pastille des boutons web', () => {
    expect(badgeText()).toBeNull()
    expect(badgeText(0)).toBeNull()
    expect(badgeText(3)).toBe('3')
    expect(badgeText(120)).toBe('99+')
  })

  it('décrivent le bouton au demi-point près', () => {
    expect(toSpec('glass-1', rect, { icon: 'bell', label: 'Notifications', badge: 2 }, true)).toEqual({
      id: 'glass-1',
      symbol: 'bell',
      label: 'Notifications',
      x: 309.5,
      y: 79.5,
      width: 48,
      height: 48,
      badge: '2',
      dim: false,
      active: false,
      disabled: false,
      rotation: 0,
      color: null,
      visible: true,
    })
  })

  it('sont masqués quand le bouton web est recouvert ou sans taille', () => {
    expect(toSpec('a', rect, { icon: 'grid', label: 'Menu' }, false)?.visible).toBe(false)
    expect(toSpec('a', { ...rect, width: 0 }, { icon: 'grid', label: 'Menu' }, true)?.visible).toBe(false)
  })

  it('gardent l’état enfoncé et estompé', () => {
    const spec = toSpec('a', rect, { icon: 'flipCamera', label: 'Selfie', active: true, dim: true }, true)
    expect(spec).toMatchObject({ active: true, dim: true })
  })

  it('tournent l’icône de la boussole et gardent sa couleur', () => {
    const spec = toSpec('n', rect, { icon: 'arrow', label: 'Nord', rotation: -37.26, color: '#eb0c0c' }, true)
    expect(spec).toMatchObject({ symbol: 'location.north.fill', rotation: -37.5, color: '#eb0c0c' })
  })

  it('ignorent une icône sans symbole', () => {
    expect(toSpec('a', rect, { icon: 'heart', label: 'Aimer' }, true)).toBeNull()
  })
})
