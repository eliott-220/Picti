import { describe, expect, it, vi } from 'vitest'

vi.mock('@capacitor/core', () => ({
  Capacitor: { getPlatform: () => 'web', isNativePlatform: () => false },
  registerPlugin: () => ({}),
  SystemBars: {},
  SystemBarsStyle: {},
  SystemBarType: {},
}))

const { badgeText, barItemSpecs, bubbleSpec, glassable, glassSymbol, toSpec } = await import('./glassButtons')

const rect = { x: 309.26, y: 79.74, width: 48, height: 48 }
/** Élément de la pilule sans effet (tous sauf l'appareil photo). */
const plain = { alpha: 1, scale: 1, angle: 0 }

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
      kind: 'button',
      items: null,
      bubble: null,
      warn: false,
      disc: null,
      look: null,
      symbol: 'bell',
      title: null,
      segments: null,
      selected: -1,
      label: 'Notifications',
      x: 309.5,
      y: 79.5,
      width: 48,
      height: 48,
      scroller: null,
      cx: 309.5,
      cy: 79.5,
      badge: '2',
      dim: false,
      active: false,
      disabled: false,
      rotation: 0,
      color: null,
      visible: true,
      opacity: 1,
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

  it('font aussi les pastilles à texte', () => {
    const spec = toSpec('c', rect, { title: 'Mes amis', label: 'Mes amis', active: true }, true)
    expect(spec).toMatchObject({ kind: 'button', symbol: null, title: 'Mes amis', active: true })
  })

  it('font les sélecteurs segmentés (« Monde / Amis »)', () => {
    const spec = toSpec('s', rect, { segments: ['Monde', 'Amis'], selected: 1, label: 'Photos affichées' }, true)
    expect(spec).toMatchObject({ kind: 'segmented', segments: ['Monde', 'Amis'], selected: 1, symbol: null, title: null })
    expect(glassable({ segments: [], label: 'Vide' })).toBe(false)
  })

  it('dans une zone qui défile, sont placés dans son contenu (fixe pendant le défilement)', () => {
    // Rangée de pastilles défilée de 120 px vers la gauche, page défilée de 300 px vers le bas.
    const scroller = { key: 4, port: { x: 0, y: 410.2, width: 402, height: 44 }, left: 120, top: 0 }
    const chip = { x: 236.3, y: 412.2, width: 90, height: 40 }
    const spec = toSpec('c', chip, { title: 'Selfies', label: 'Selfies' }, true, scroller)
    expect(spec).toMatchObject({
      scroller: { key: 4, x: 0, y: 410, width: 402, height: 44 },
      cx: 356.5,
      cy: 2,
      x: 236.5,
      y: 412,
    })
  })

  it('ignorent une icône sans symbole', () => {
    expect(toSpec('a', rect, { icon: 'heart', label: 'Aimer' }, true)).toBeNull()
  })

  it('dessinent la pilule de la barre du bas, avec Menu et l’avatar dedans (0.23.0)', () => {
    const bar = { x: 16.2, y: 760, width: 358, height: 64 }
    const ref = { current: null }
    const spec = toSpec('b', bar, { label: 'Navigation', bar: { items: [{ ref, icon: 'grid', badge: 2 }, { ref, initial: 'E', active: true }] } }, true, null, [
      { icon: 'grid', badge: 2, rect: { x: 50.3, y: 770, width: 44, height: 44 } },
      { initial: 'E', active: true, rect: { x: 296, y: 772, width: 40, height: 40 } },
    ])
    expect(spec).toMatchObject({ kind: 'bar', symbol: null, title: null, x: 16, width: 358, warn: false })
    expect(spec?.items).toEqual([
      { x: 34, y: 10, width: 44, height: 44, symbol: 'square.grid.2x2', initial: null, badge: '2', active: false, ...plain, tint: 0 },
      { x: 280, y: 12, width: 40, height: 40, symbol: null, initial: 'E', badge: null, active: true, ...plain, tint: 1 },
    ])
    // Un élément pas encore affiché (sans cadre) n'est pas envoyé.
    expect(barItemSpecs(bar, [{ initial: 'E', rect: null }, { icon: 'grid', rect: { x: 0, y: 0, width: 0, height: 0 } }])).toEqual([])
    expect(glassable({ label: 'Navigation', bar: { items: [] } })).toBe(true)
  })

  it('dessinent le bouton rouge avec le symbole du mode et la pastille ⚠', () => {
    expect(toSpec('s', rect, { icon: 'friends', label: 'Prendre une photo', shutter: { warn: true } }, true)).toMatchObject({
      kind: 'shutter',
      symbol: 'person.2.fill',
      warn: true,
      items: null,
    })
    for (const icon of ['globe', 'friends', 'lock'] as const) expect(glassSymbol(icon)).toBeTruthy()
    // Hors du viseur (0.23.2) : appareil photo.
    expect(toSpec('s', rect, { icon: 'camera', label: 'Revenir au viseur', shutter: {} }, true)).toMatchObject({ kind: 'shutter', symbol: 'camera.fill' })
  })

  it('barre à cinq boutons (0.23.1) : symboles donnés directement, l’écran affiché en plein', () => {
    const bar = { x: 16, y: 760, width: 358, height: 64 }
    expect(
      barItemSpecs(bar, [
        { symbol: 'map', rect: { x: 30, y: 770, width: 48, height: 48 } },
        { symbol: 'person.fill', active: true, rect: { x: 300, y: 770, width: 48, height: 48 } },
      ]),
    ).toEqual([
      { x: 14, y: 10, width: 48, height: 48, symbol: 'map', initial: null, badge: null, active: false, ...plain, tint: 0 },
      { x: 284, y: 10, width: 48, height: 48, symbol: 'person.fill', initial: null, badge: null, active: true, ...plain, tint: 1 },
    ])
  })

  it('bulle de l’onglet actif (0.24.0) : cadre relatif à la pilule, invisible au bouton rouge', () => {
    const bar = { x: 16, y: 760, width: 358, height: 64 }
    const bubble = { x: 30.2, y: 768, width: 60, height: 48 }
    expect(bubbleSpec(bar, bubble, { away: 1, reduce: false, tab: 0 })).toEqual({ x: 14, y: 8, width: 60, height: 48, alpha: 1 })
    // Sur le viseur (au bouton rouge), ou rien à mesurer : pas de bulle.
    expect(bubbleSpec(bar, bubble, { away: 0, reduce: false, tab: 2 })).toBeNull()
    expect(bubbleSpec(bar, bubble, { away: 1, reduce: false, tab: 2 })).toBeNull()
    expect(bubbleSpec(bar, null, { away: 1, reduce: false, tab: 0 })).toBeNull()
    // En quittant le viseur, elle naît de l'appareil photo.
    expect(bubbleSpec(bar, bubble, { away: 0.5, reduce: false, tab: 1.5 })?.alpha).toBe(0.5)
    const spec = toSpec('b', bar, { label: 'Navigation', bar: { items: [] } }, true, null, [], { away: 1, reduce: false, tab: 4 }, bubble)
    expect(spec?.bubble).toMatchObject({ alpha: 1 })
  })

  it('la couleur de l’icône suit la bulle d’un onglet à l’autre (0.24.0)', () => {
    const bar = { x: 16, y: 760, width: 358, height: 64 }
    const items = [
      { symbol: 'map', slot: 0, rect: { x: 30, y: 770, width: 48, height: 48 } },
      { symbol: 'person.2', slot: 1, rect: { x: 100, y: 770, width: 48, height: 48 } },
    ]
    const [map, friends] = barItemSpecs(bar, items, { away: 1, reduce: false, tab: 0.25 })
    expect(map.tint).toBe(0.75)
    expect(friends.tint).toBe(0.25)
  })

  it('suivent le fondu d’une rangée (boutons du zoom, 0.24.0)', () => {
    expect(toSpec('z', rect, { title: '1×', label: 'Zoom 1' }, true, null, [], undefined, null, 0.4)).toMatchObject({ opacity: 0.4, visible: true })
    expect(toSpec('z', rect, { title: '1×', label: 'Zoom 1' }, true, null, [], undefined, null, 0)).toMatchObject({ visible: false })
  })

  it('hors du viseur, plus de rond rouge : l’appareil photo est dessiné dans la pilule (0.23.3)', () => {
    const bar = { x: 16, y: 760, width: 358, height: 64 }
    const items = [
      { symbol: 'map', rect: { x: 30, y: 770, width: 48, height: 48 } },
      { symbol: 'camera', away: true, rect: { x: 167, y: 760, width: 56, height: 64 } },
    ]
    // Sur le viseur : l'appareil photo est invisible, le rond rouge et le mode pleins.
    const home = barItemSpecs(bar, items, { away: 0, reduce: false })
    expect(home[0]).toMatchObject(plain)
    expect(home[1]).toMatchObject({ symbol: 'camera', x: 151, y: 0, alpha: 0, scale: 0.6, angle: 45 })
    const shutter = (away: number, reduce = false) =>
      toSpec('s', rect, { icon: 'globe', label: 'Prendre une photo', shutter: {}, away: () => away }, true, null, [], { away, reduce })
    expect(shutter(0)).toMatchObject({ kind: 'shutter', symbol: 'globe', disc: { alpha: 1, scale: 1, angle: 0 }, look: plain })
    // Ailleurs : l'appareil photo comme les autres pictogrammes, le rond et le mode effacés.
    expect(barItemSpecs(bar, items, { away: 1, reduce: false })[1]).toMatchObject(plain)
    expect(shutter(1)).toMatchObject({ disc: { alpha: 0, scale: 0.55 }, look: { alpha: 0, scale: 0.6, angle: -45 } })
    // À mi-chemin (animation ou doigt) : les deux à moitié.
    expect(barItemSpecs(bar, items, { away: 0.5, reduce: false })[1]).toMatchObject({ alpha: 0.5, scale: 0.8, angle: 22.5 })
    expect(shutter(0.5)).toMatchObject({ disc: { alpha: 0.5, scale: 0.78 }, look: { alpha: 0.5, scale: 0.8, angle: -22.5 } })
    // « Réduire les animations » : simple fondu.
    expect(shutter(0.3, true)).toMatchObject({ disc: { alpha: 0.7, scale: 1, angle: 0 }, look: { alpha: 0.7, scale: 1, angle: 0 } })
    expect(barItemSpecs(bar, items, { away: 0.3, reduce: true })[1]).toMatchObject({ alpha: 0.3, scale: 1, angle: 0 })
    // Bouton rouge hors de la barre (Reproduire) : toujours plein.
    expect(toSpec('r', rect, { icon: 'globe', label: 'Prendre une photo', shutter: {} }, true, null, [], { away: 1, reduce: false })).toMatchObject({
      disc: null,
      look: null,
    })
  })
})
