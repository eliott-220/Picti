import { describe, expect, it } from 'vitest'
import {
  FLICK_MIN,
  freeToSwipe,
  OPEN_RATIO,
  OPEN_SPEED,
  OWN_GESTURES,
  opensOnRelease,
  releaseSpeed,
  SLOP,
  swipeIntent,
  swipeOffset,
} from './swipeOpen'

describe('viseur : glisser de droite à gauche ouvre le profil', () => {
  it('attend que le doigt ait un peu bougé avant de choisir', () => {
    expect(swipeIntent(0, 0)).toBeNull()
    expect(swipeIntent(-(SLOP - 1), 0)).toBeNull()
    expect(swipeIntent(-SLOP, 0)).toBe('open')
  })

  it('vers la gauche et plutôt à l’horizontale : on ouvre ; sinon le geste est laissé au viseur', () => {
    expect(swipeIntent(-30, 10)).toBe('open')
    expect(swipeIntent(-30, -25)).toBe('open')
    expect(swipeIntent(30, 0)).toBe('other')
    expect(swipeIntent(-10, 30)).toBe('other')
    expect(swipeIntent(0, -30)).toBe('other')
  })

  it('le profil suit le doigt sans dépasser l’écran', () => {
    expect(swipeOffset(-120, 390)).toBe(120)
    expect(swipeOffset(40, 390)).toBe(0)
    expect(swipeOffset(-600, 390)).toBe(390)
  })

  it('lâché assez loin, le profil s’ouvre ; trop tôt, il repart', () => {
    const width = 400
    expect(opensOnRelease(-width * OPEN_RATIO, 0.1, width)).toBe(true)
    expect(opensOnRelease(-width * OPEN_RATIO + 1, 0.1, width)).toBe(false)
    // Vers la droite : jamais.
    expect(opensOnRelease(width, 2, width)).toBe(false)
  })

  it('un geste vif suffit, même court', () => {
    expect(opensOnRelease(-FLICK_MIN, OPEN_SPEED + 0.1, 400)).toBe(true)
    // Trop court, même vif.
    expect(opensOnRelease(-(FLICK_MIN - 1), 3, 400)).toBe(false)
    // Assez long mais lent.
    expect(opensOnRelease(-FLICK_MIN, OPEN_SPEED, 400)).toBe(false)
  })

  it('la vitesse au lâcher est celle de la fin du geste', () => {
    expect(releaseSpeed([])).toBe(0)
    expect(releaseSpeed([{ x: 300, t: 0 }])).toBe(0)
    // Départ lent (40 px en 400 ms), puis 60 px en 60 ms : vif.
    const slowThenFast = [
      { x: 300, t: 0 },
      { x: 280, t: 200 },
      { x: 260, t: 400 },
      { x: 230, t: 430 },
      { x: 200, t: 460 },
    ]
    expect(releaseSpeed(slowThenFast)).toBeCloseTo(1)
    // Le doigt revient vers la droite à la fin : vitesse négative.
    expect(releaseSpeed([{ x: 200, t: 0 }, { x: 240, t: 50 }])).toBeLessThan(0)
  })

  it('le déclencheur, les réglettes, les feuilles et la frise gardent leurs gestes', () => {
    const selectors = OWN_GESTURES.split(',').map((x) => x.trim())
    for (const s of ['.shutter-group', 'input', '[role="dialog"]', '.home-timeline']) expect(selectors).toContain(s)
    // Les boutons du rail (bord droit) ne servent qu'à l'appui : le geste peut partir d'eux.
    expect(selectors).not.toContain('button')
    // Élément dont un ancêtre correspond (`closest`) : le geste n'y part pas.
    const inside = (match: boolean) => ({ closest: () => (match ? {} : null) }) as unknown as EventTarget
    expect(freeToSwipe(inside(true))).toBe(false)
    expect(freeToSwipe(inside(false))).toBe(true)
    expect(freeToSwipe(null)).toBe(true)
  })
})
