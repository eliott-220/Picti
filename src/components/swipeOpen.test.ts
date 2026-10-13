import { describe, expect, it } from 'vitest'
import {
  EDGE_BAND,
  FLICK_MIN,
  flickDirection,
  freeToSwipe,
  inRightEdge,
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
    expect(swipeIntent(-SLOP, 0)).toBe('left')
  })

  it('vers la gauche et plutôt à l’horizontale : on ouvre ; sinon le geste est laissé au viseur', () => {
    expect(swipeIntent(-30, 10)).toBe('left')
    expect(swipeIntent(-30, -25)).toBe('left')
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

  it('0.24.0 : un petit coup de doigt rapide de 40 px change de page (direction et vitesse suffisent)', () => {
    expect(FLICK_MIN).toBeLessThanOrEqual(30)
    expect(OPEN_SPEED).toBeLessThanOrEqual(0.3)
    expect(opensOnRelease(-40, 0.4, 390)).toBe(true)
    expect(opensOnRelease(40, 0.4, 390, 'right')).toBe(true)
    // Doigt lent : seuil au tiers de l'écran, comme avant.
    expect(opensOnRelease(-100, 0.1, 390)).toBe(false)
    expect(opensOnRelease(-140, 0.1, 390)).toBe(true)
    // Loin, mais relancé en sens inverse au dernier moment : l'écran revient.
    expect(opensOnRelease(-200, -0.6, 390)).toBe(false)
  })

  it('pendant l’arrivée d’un écran, un coup de doigt prolonge vers le suivant', () => {
    expect(flickDirection(-50, 0.8, ['left', 'right'])).toBe('left')
    expect(flickDirection(50, 0.8, ['left'])).toBeNull()
    expect(flickDirection(-20, 0.8, ['left'])).toBeNull()
    expect(flickDirection(-80, 0.1, ['left'])).toBeNull()
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
    for (const s of ['.shutter-group', '.bottom-nav', 'input', '[role="dialog"]', '.home-timeline']) expect(selectors).toContain(s)
    // Les boutons du rail (bord droit) ne servent qu'à l'appui : le geste peut partir d'eux.
    expect(selectors).not.toContain('button')
    // Élément dont un ancêtre correspond (`closest`) : le geste n'y part pas.
    const inside = (match: boolean) => ({ closest: () => (match ? {} : null) }) as unknown as EventTarget
    expect(freeToSwipe(inside(true))).toBe(false)
    expect(freeToSwipe(inside(false))).toBe(true)
    expect(freeToSwipe(null)).toBe(true)
  })
})

describe('viseur : glisser de gauche à droite ouvre la carte (0.23.0)', () => {
  it('les deux sens sont reconnus quand ils sont permis, jamais un geste vertical', () => {
    const both = ['left', 'right'] as const
    expect(swipeIntent(30, 5, both)).toBe('right')
    expect(swipeIntent(-30, 5, both)).toBe('left')
    expect(swipeIntent(5, 30, both)).toBe('other')
    expect(swipeIntent(5, -30, both)).toBe('other')
    // Sens non permis (ex. sur la carte, seul le retour vers la gauche compte).
    expect(swipeIntent(30, 0, ['left'])).toBe('other')
    expect(swipeIntent(SLOP - 1, 0, both)).toBeNull()
  })

  it('la carte suit le doigt vers la droite, sans dépasser l’écran', () => {
    expect(swipeOffset(120, 390, 'right')).toBe(120)
    expect(swipeOffset(-40, 390, 'right')).toBe(0)
    expect(swipeOffset(600, 390, 'right')).toBe(390)
  })

  it('lâchée au-delà d’un tiers de l’écran, ou d’un geste vif, la carte s’ouvre ; sinon elle repart', () => {
    const width = 390
    expect(OPEN_RATIO).toBeGreaterThan(1 / 3)
    expect(opensOnRelease(width * OPEN_RATIO, 0.1, width, 'right')).toBe(true)
    expect(opensOnRelease(width * OPEN_RATIO - 1, 0.1, width, 'right')).toBe(false)
    expect(opensOnRelease(FLICK_MIN, OPEN_SPEED + 0.1, width, 'right')).toBe(true)
    expect(opensOnRelease(FLICK_MIN, OPEN_SPEED, width, 'right')).toBe(false)
    // Dans l'autre sens : jamais.
    expect(opensOnRelease(-width, 3, width, 'right')).toBe(false)
  })

  it('la vitesse se mesure dans le sens du geste', () => {
    const toRight = [
      { x: 100, t: 0 },
      { x: 160, t: 60 },
    ]
    expect(releaseSpeed(toRight, 'right')).toBeCloseTo(1)
    expect(releaseSpeed(toRight, 'left')).toBeCloseTo(-1)
  })
})

describe('carte : le retour au viseur part du bord droit seulement', () => {
  it('bande de 24 px collée à la paroi droite', () => {
    expect(EDGE_BAND).toBe(24)
    // Écran de 390 px qui commence à 10 px (cadre centré sur ordinateur).
    expect(inRightEdge(400, 10, 390)).toBe(true)
    expect(inRightEdge(400 - EDGE_BAND, 10, 390)).toBe(true)
    expect(inRightEdge(400 - EDGE_BAND - 1, 10, 390)).toBe(false)
    expect(inRightEdge(200, 10, 390)).toBe(false)
    // Hors de l'écran.
    expect(inRightEdge(401, 10, 390)).toBe(false)
  })
})
