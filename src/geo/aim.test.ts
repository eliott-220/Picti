import { describe, expect, it } from 'vitest'
import { aimsAt, pointInQuad } from './aim'
import type { PhotoProjection, Quad, ScreenPoint } from './projection'

const at = (x: number, y: number): ScreenPoint => ({ x, y, z: 5 })
// Carte de face : coins haut-gauche, haut-droit, bas-droit, bas-gauche.
const card: Quad<ScreenPoint> = [at(100, 200), at(300, 200), at(300, 500), at(100, 500)]
// Carte en perspective (trapèze), vue de biais.
const slanted: Quad<ScreenPoint> = [at(120, 300), at(260, 340), at(260, 460), at(120, 520)]
const screen = { width: 400, height: 800 }
const projection = (corners: Quad<ScreenPoint>, onScreen = true): PhotoProjection => ({ corners, inFront: true, onScreen })

describe('croix de visée', () => {
  it('dans la carte, sur son bord, en dehors', () => {
    expect(pointInQuad({ x: 200, y: 350 }, card)).toBe(true)
    expect(pointInQuad({ x: 100, y: 350 }, card)).toBe(true)
    expect(pointInQuad({ x: 300, y: 500 }, card)).toBe(true)
    expect(pointInQuad({ x: 99, y: 350 }, card)).toBe(false)
    expect(pointInQuad({ x: 200, y: 501 }, card)).toBe(false)
  })

  it('photo de dos (coins en miroir) : même réponse', () => {
    const mirrored = [card[1], card[0], card[3], card[2]] as Quad<ScreenPoint>
    expect(pointInQuad({ x: 200, y: 350 }, mirrored)).toBe(true)
    expect(pointInQuad({ x: 350, y: 350 }, mirrored)).toBe(false)
  })

  it('en perspective : suit les bords obliques', () => {
    expect(pointInQuad({ x: 200, y: 400 }, slanted)).toBe(true)
    // Au-dessus du bord haut oblique, pourtant dans la boîte englobante.
    expect(pointInQuad({ x: 250, y: 320 }, slanted)).toBe(false)
  })

  it('photo vue par la tranche (aplatie) : jamais visée', () => {
    const flat: Quad<ScreenPoint> = [at(200, 200), at(200, 300), at(200, 400), at(200, 500)]
    expect(pointInQuad({ x: 200, y: 350 }, flat)).toBe(false)
  })

  it('centre de l’écran sur la carte affichée', () => {
    expect(aimsAt(projection(card), screen)).toBe(true)
    expect(aimsAt(projection(card), { width: 400, height: 1200 })).toBe(false)
    expect(aimsAt(projection(slanted), screen)).toBe(true)
  })

  it('photo hors de l’écran ou pas visible d’ici : pas visée', () => {
    expect(aimsAt(projection(card, false), screen)).toBe(false)
  })
})
