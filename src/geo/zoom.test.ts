import { describe, expect, it } from 'vitest'
import {
  cropRect,
  focalAtZoom,
  hardwareRange,
  presetFor,
  reproduceZoom,
  crossedPreset,
  pinchedZoom,
  rampZoom,
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

  it('au relâcher, le zoom des doigts est gardé tel quel (borné à la caméra)', () => {
    expect(pinchedZoom(1.03, { min: 0.5, max: 5 })).toBe(1.03)
    expect(pinchedZoom(1.4567, { min: 0.5, max: 5 })).toBe(1.46)
    expect(pinchedZoom(9, { min: 0.5, max: 5 })).toBe(5)
    expect(pinchedZoom(0.2, { min: 0.5, max: 5 })).toBe(0.5)
  })

  it('repère franchi en pinçant (une vibration), dans les deux sens', () => {
    const presets = [0.5, 1, 2, 5]
    expect(crossedPreset(1.4, 2.1, presets)).toBe(2)
    expect(crossedPreset(1, 1.3, presets)).toBeNull()
    expect(crossedPreset(1.3, 1, presets)).toBe(1)
    // On marque l'arrivée sur un repère (ou son passage), pas le départ : il a déjà vibré en y arrivant.
    expect(crossedPreset(1, 0.9, presets)).toBeNull()
    expect(crossedPreset(1.1, 0.9, presets)).toBe(1)
    expect(crossedPreset(0.6, 0.5, presets)).toBe(0.5)
    expect(crossedPreset(1.5, 5, presets)).toBe(5)
    expect(crossedPreset(4, 1.2, presets)).toBe(2)
  })

  it('appui sur un bouton : glissement géométrique qui ralentit en arrivant', () => {
    expect(rampZoom(1, 5, 0)).toBe(1)
    expect(rampZoom(1, 5, 1)).toBeCloseTo(5, 9)
    expect(rampZoom(1, 5, 2)).toBeCloseTo(5, 9)
    const steps = [0.1, 0.3, 0.5, 0.7, 0.9].map((t) => rampZoom(1, 5, t))
    for (let i = 1; i < steps.length; i++) expect(steps[i]).toBeGreaterThan(steps[i - 1])
    // Plus de chemin au début qu'à la fin (il ralentit).
    expect(steps[1] / steps[0]).toBeGreaterThan(steps[4] / steps[3])
    expect(rampZoom(2, 1, 0.5)).toBeLessThan(2)
    expect(rampZoom(2, 1, 0.5)).toBeGreaterThan(1)
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
