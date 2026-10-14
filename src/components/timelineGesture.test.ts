import { describe, expect, it } from 'vitest'
import { freeToPinch } from './usePinchZoom'
import { freeToSwipe } from './swipeOpen'
import {
  AXIS_LOCK_PX,
  canStepTo,
  COLLAPSE_AT,
  collapseFrame,
  collapseProgress,
  collapseTravel,
  lockAxis,
  MIN_TRAVEL,
  MINI_RADIUS,
  releaseCollapse,
  releaseStep,
  slideOffset,
  slideOpacity,
  speedOf,
  STEP_DISTANCE,
  stepOf,
  TIMELINE_RADIUS,
  type Box,
} from './timelineGesture'

const both = { canStep: true, canCollapse: true }

describe('frise : le sens du geste est décidé dès les premiers pixels', () => {
  it('attend un petit déplacement avant de choisir', () => {
    expect(lockAxis(0, 0, both)).toBeNull()
    expect(lockAxis(AXIS_LOCK_PX - 1, 0, both)).toBeNull()
    expect(lockAxis(AXIS_LOCK_PX, 0, both)).toBe('x')
  })

  it('horizontal : changer de photo ; vers le bas : réduire ; vers le haut : rien', () => {
    expect(lockAxis(-12, 5, both)).toBe('x')
    expect(lockAxis(12, -5, both)).toBe('x')
    expect(lockAxis(4, 12, both)).toBe('down')
    expect(lockAxis(-4, -12, both)).toBe('none')
  })

  it('pile d’une seule photo : pas de glissement horizontal, la réduction marche', () => {
    expect(lockAxis(-20, 2, { canStep: false, canCollapse: true })).toBe('none')
    expect(lockAxis(2, 20, { canStep: false, canCollapse: true })).toBe('down')
  })

  it('chasse (pas de réduction) : vers le bas ne fait rien', () => {
    expect(lockAxis(2, 20, { canStep: true, canCollapse: false })).toBe('none')
  })
})

describe('frise : glisser à gauche / à droite change de photo', () => {
  it('vers la gauche = suivante, vers la droite = précédente (comme les piles de « Mes photos »)', () => {
    expect(stepOf(-30)).toBe(1)
    expect(stepOf(30)).toBe(-1)
  })

  it('pas de boucle aux extrémités', () => {
    expect(canStepTo(0, 3, -1)).toBe(false)
    expect(canStepTo(0, 3, 1)).toBe(true)
    expect(canStepTo(2, 3, 1)).toBe(false)
    expect(canStepTo(2, 3, -1)).toBe(true)
  })

  it('le contenu suit le doigt, en plus léger', () => {
    expect(slideOffset(-100, 1, 3)).toBeCloseTo(-60)
    expect(slideOffset(100, 1, 3)).toBeCloseTo(60)
    expect(slideOffset(0, 0, 1)).toBe(0)
    // Il s'efface un peu en s'éloignant, sans disparaître.
    expect(slideOpacity(0)).toBe(1)
    expect(slideOpacity(60)).toBeLessThan(1)
    expect(slideOpacity(1000)).toBeCloseTo(0.3)
  })

  it('au bout de la pile : petite résistance élastique, bornée', () => {
    const first = slideOffset(100, 0, 3)
    expect(first).toBeGreaterThan(0)
    expect(first).toBeLessThan(slideOffset(100, 1, 3))
    expect(slideOffset(1000, 0, 3)).toBeLessThan(40)
    expect(slideOffset(-1000, 2, 3)).toBeGreaterThan(-40)
    // De plus en plus dur.
    expect(slideOffset(200, 0, 3) - slideOffset(100, 0, 3)).toBeLessThan(slideOffset(100, 0, 3))
  })

  it('lâché assez loin, ou d’un geste vif : la photo change ; sinon retour en place', () => {
    expect(releaseStep(-STEP_DISTANCE, 0, 0, 3)).toBe(1)
    expect(releaseStep(STEP_DISTANCE, 0, 1, 3)).toBe(-1)
    expect(releaseStep(-30, 0, 0, 3)).toBeNull()
    // Geste vif dans le même sens.
    expect(releaseStep(-30, -0.6, 0, 3)).toBe(1)
    // Vif, mais le doigt revenait en arrière : pas de changement.
    expect(releaseStep(-30, 0.6, 0, 3)).toBeNull()
    // Trop court, même vif.
    expect(releaseStep(-10, -2, 0, 3)).toBeNull()
  })

  it('aux extrémités : rien ne change', () => {
    expect(releaseStep(200, -1, 0, 3)).toBeNull()
    expect(releaseStep(-200, 1, 2, 3)).toBeNull()
    expect(releaseStep(-200, -1, 0, 1)).toBeNull()
  })

  it('vitesse sur les derniers relevés', () => {
    expect(speedOf([])).toBe(0)
    expect(speedOf([{ v: 0, t: 0 }])).toBe(0)
    expect(speedOf([{ v: 0, t: 0 }, { v: -50, t: 100 }])).toBeCloseTo(-0.5)
    // Lent puis vif : seule la fin compte.
    expect(speedOf([{ v: 0, t: 0 }, { v: 5, t: 400 }, { v: 35, t: 430 }, { v: 65, t: 460 }])).toBeCloseTo(1)
  })
})

describe('frise : glisser vers le bas la range en vignette en bas à droite', () => {
  // iPhone 15 Pro Max (430 × 932) : frise à 16 px des bords, vignette 48 × 48 à 24 px du bord droit, plus bas.
  const from: Box = { left: 16, top: 670, width: 398, height: 72 }
  const to: Box = { left: 358, top: 784, width: 48, height: 48 }

  it('trajet : du centre de la frise au centre de la vignette, jamais trop court', () => {
    expect(collapseTravel(from, to)).toBeCloseTo(808 - 706)
    expect(collapseTravel(from, { ...to, top: from.top })).toBe(MIN_TRAVEL)
  })

  it('l’avancement suit le doigt vers le bas, rien vers le haut', () => {
    expect(collapseProgress(51, 102)).toBeCloseTo(0.5)
    expect(collapseProgress(-40, 102)).toBe(0)
    expect(collapseProgress(400, 102)).toBe(1)
  })

  it('lâchée au-delà d’un tiers du trajet ou d’un geste vif : elle se range ; sinon elle remonte', () => {
    expect(releaseCollapse(COLLAPSE_AT, 0, 34)).toBe(true)
    expect(releaseCollapse(0.2, 0, 20)).toBe(false)
    expect(releaseCollapse(0.2, 0.8, 20)).toBe(true)
    expect(releaseCollapse(0.05, 0.8, 5)).toBe(false)
  })

  it('dépliée : rien ne bouge, rien n’est découpé', () => {
    const f = collapseFrame(0, from, to)
    expect(f.y).toBe(0)
    expect(f.inset).toEqual([0, 0, 0, 0])
    expect(f.radius).toBe(TIMELINE_RADIUS)
    expect(f.info).toBe(1)
    expect(f.image).toBe(0)
  })

  it('rangée : la partie visible est exactement la vignette, image seule', () => {
    const f = collapseFrame(1, from, to)
    const [top, right, bottom, left] = f.inset
    // Partie visible à l'écran = frise découpée puis décalée.
    const visible = {
      left: from.left + left,
      top: from.top + top + f.y,
      width: from.width - left - right,
      height: from.height - top - bottom,
    }
    expect(visible.left).toBeCloseTo(to.left)
    expect(visible.top).toBeCloseTo(to.top)
    expect(visible.width).toBeCloseTo(to.width)
    expect(visible.height).toBeCloseTo(to.height)
    expect(f.radius).toBe(MINI_RADIUS)
    expect(f.info).toBe(0)
    expect(f.image).toBe(1)
    expect(f.edge).toBe(1)
  })

  it('en route : elle descend, se resserre vers la droite, les infos s’effacent avant que l’image remplisse', () => {
    const a = collapseFrame(0.3, from, to)
    const b = collapseFrame(0.6, from, to)
    expect(b.y).toBeGreaterThan(a.y)
    expect(b.inset[3]).toBeGreaterThan(a.inset[3])
    expect(b.info).toBeLessThan(a.info)
    expect(b.image).toBeGreaterThan(a.image)
    // Le bas n'est jamais découpé : il descend avec le décalage.
    expect(a.inset[2]).toBe(0)
  })

  it('« Réduire les animations » : simple fondu, sans déplacement ni rétrécissement', () => {
    const f = collapseFrame(0.4, from, to, true)
    expect(f.y).toBe(0)
    expect(f.inset).toEqual([0, 0, 0, 0])
    expect(f.opacity).toBeCloseTo(0.6)
    expect(f.image).toBe(0)
  })
})

describe('frise : elle garde la main', () => {
  it('ni glissé d’écran ni pincement ne part d’elle', () => {
    const inTimeline = { closest: (sel: string) => (sel.includes('.home-timeline') ? {} : null) } as unknown as EventTarget
    expect(freeToSwipe(inTimeline)).toBe(false)
    expect(freeToPinch(inTimeline)).toBe(false)
  })
})
