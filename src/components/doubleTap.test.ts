import { describe, expect, it } from 'vitest'
import { DOUBLE_TAP_MS, DOUBLE_TAP_PX, doubleTapAllowed, isDoubleTap, isTap, NO_DOUBLE_TAP, TAP_MAX_MS, TAP_SLOP_PX } from './doubleTap'

describe('viseur : double appui = caméra arrière ↔ avant', () => {
  it('un appui est court et presque immobile', () => {
    expect(isTap({ x: 100, y: 100, t: 0 }, { x: 103, y: 98, t: 80 })).toBe(true)
    expect(isTap({ x: 100, y: 100, t: 0 }, { x: 100, y: 100, t: TAP_MAX_MS + 1 })).toBe(false)
    // Le doigt a glissé : c'est un geste (carte, profil, pile), pas un appui.
    expect(isTap({ x: 100, y: 100, t: 0 }, { x: 100 + TAP_SLOP_PX + 1, y: 100, t: 60 })).toBe(false)
  })

  it('deux appuis à moins de 300 ms et 30 px font un double appui', () => {
    const first = { x: 200, y: 300, t: 1000 }
    expect(isDoubleTap(first, { x: 210, y: 305, t: 1000 + 180 })).toBe(true)
    expect(isDoubleTap(first, { x: 200, y: 300, t: 1000 + DOUBLE_TAP_MS })).toBe(true)
    expect(isDoubleTap(first, { x: 200, y: 300, t: 1000 + DOUBLE_TAP_MS + 1 })).toBe(false)
    expect(isDoubleTap(first, { x: 200 + DOUBLE_TAP_PX + 1, y: 300, t: 1100 })).toBe(false)
    expect(isDoubleTap(null, first)).toBe(false)
  })

  it('jamais depuis le bouton rouge, le rail, les pastilles, la frise, une photo du décor ni une feuille', () => {
    const selectors = NO_DOUBLE_TAP.split(',').map((s) => s.trim())
    for (const s of ['button', '.shutter-group', '.bottom-nav', '.rail', '.sensor-status', '.home-timeline', '.overlay-photo.clickable', '[role="dialog"]']) {
      expect(selectors).toContain(s)
    }
    const inside = (match: boolean) => ({ closest: () => (match ? {} : null) }) as unknown as EventTarget
    expect(doubleTapAllowed(inside(true))).toBe(false)
    expect(doubleTapAllowed(inside(false))).toBe(true)
    expect(doubleTapAllowed(null)).toBe(true)
  })
})
