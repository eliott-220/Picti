import { describe, expect, it } from 'vitest'
import {
  cropRect,
  focalAtZoom,
  hardwareRange,
  presetFor,
  reproduceZoom,
  settleZoom,
  ZOOM,
  zoomLabel,
  zoomPlan,
  zoomPresets,
} from './zoom'

const IPHONE = { min: 0.5, max: 10 }

describe('zoom du viseur et grand angle', () => {
  it('lit la plage du zoom matériel de la caméra web', () => {
    expect(hardwareRange({ min: 0.5, max: 61.875 })).toEqual({ min: 0.5, max: ZOOM.hardwareMax })
    expect(hardwareRange(undefined)).toBeNull()
    expect(hardwareRange({ min: 1, max: 1 })).toBeNull()
    expect(hardwareRange({ min: 2, max: 8 })).toBeNull()
  })

  it('propose les repères de l’iPhone', () => {
    expect(zoomPresets(IPHONE)).toEqual([0.5, 1, 2, 5])
    expect(zoomPresets(IPHONE, 3)).toEqual([0.5, 1, 2, 3])
    expect(zoomPresets({ min: 1, max: 5 })).toEqual([1, 2, 5])
    expect(zoomPresets({ min: 1, max: 1 })).toEqual([1])
  })

  it('le bouton du repère porte le zoom actuel', () => {
    const p = [0.5, 1, 2, 5]
    expect(presetFor(1.4, p)).toBe(1)
    expect(presetFor(0.7, p)).toBe(0.5)
    expect(presetFor(1.97, p)).toBe(2)
    expect(zoomLabel(1, 1.4, true)).toBe('1,4×')
    expect(zoomLabel(0.5, 1, false)).toBe('0,5')
    expect(zoomLabel(2, 2, true)).toBe('2×')
  })

  it('range le zoom sur un repère proche au relâcher', () => {
    expect(settleZoom(1.03, [0.5, 1, 2])).toBe(1)
    expect(settleZoom(1.5, [0.5, 1, 2])).toBe(1.5)
  })

  it('recadre au centre en gardant les proportions', () => {
    expect(cropRect(3024, 4032, 2)).toEqual({ x: 756, y: 1008, width: 1512, height: 2016 })
    expect(cropRect(3024, 4032, 1)).toEqual({ x: 0, y: 0, width: 3024, height: 4032 })
  })

  it('suit la focale d’un objectif à l’autre', () => {
    expect(focalAtZoom(1, { wide: 24 })).toBe(24)
    expect(focalAtZoom(2, { wide: 24 })).toBe(48)
    expect(focalAtZoom(0.5, { wide: 24 })).toBe(12)
    expect(focalAtZoom(0.5, { wide: 24, ultraWide: 13 })).toBe(13)
    expect(focalAtZoom(0.75, { wide: 24, ultraWide: 13 })).toBeCloseTo(19.5)
  })

  it('Reproduire part du cadrage de l’originale', () => {
    expect(reproduceZoom(25, 24, IPHONE)).toBe(1)
    expect(reproduceZoom(13, 24, IPHONE)).toBe(0.54)
    expect(reproduceZoom(120, 24, { min: 1, max: 5 })).toBe(5)
  })

  it('site : zoom matériel, puis numérique faute de mieux', () => {
    const hw = zoomPlan({ requested: 0.5, ar: null, hardware: IPHONE })
    expect(hw).toMatchObject({ route: 'web', zoom: 0.5, hardware: 0.5, digital: 1 })
    const digital = zoomPlan({ requested: 3, ar: null, hardware: null })
    expect(digital).toMatchObject({ route: 'web', zoom: 3, hardware: 1, digital: 3 })
    expect(zoomPlan({ requested: 0.5, ar: null, hardware: null }).zoom).toBe(1)
  })

  it('app iOS : ARKit à partir de 1, caméra web pour le grand angle', () => {
    const lenses = { zoom: true, ultraWide: true, telephoto: 5 }
    expect(zoomPlan({ requested: 2, ar: { lenses }, hardware: undefined })).toMatchObject({ route: 'ar', zoom: 2, digital: 2 })
    expect(zoomPlan({ requested: 0.5, ar: { lenses }, hardware: undefined })).toMatchObject({ route: 'web', zoom: 0.5, hardware: 0.5 })
    // Pendant un pincement, la caméra ne change pas.
    expect(zoomPlan({ requested: 0.6, ar: { lenses }, hardware: undefined, lock: 'ar' })).toMatchObject({ route: 'ar', zoom: 1 })
    // Caméra web sans grand angle (vue une fois ouverte) : plus de 0,5.
    expect(zoomPlan({ requested: 0.5, ar: { lenses }, hardware: null })).toMatchObject({ route: 'ar', zoom: 1 })
    // Plugin trop ancien : ni zoom ni grand angle connus.
    expect(zoomPlan({ requested: 2, ar: { lenses: null }, hardware: undefined })).toMatchObject({ route: 'ar', zoom: 1, presets: [1] })
  })
})
