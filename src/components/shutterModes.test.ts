import { describe, expect, it } from 'vitest'
import {
  labelOpacity,
  MODE_STEP,
  modeLook,
  modePosition,
  neighborVisibility,
  offsetFor,
  stripOffset,
  visibilityAtOffset,
} from './shutterModes'

describe('déclencheur : carrousel des modes', () => {
  it('reste sur le mode de départ tant que le doigt bouge peu', () => {
    expect(visibilityAtOffset('public', 0)).toBe('public')
    expect(visibilityAtOffset('public', -MODE_STEP * 0.49)).toBe('public')
    expect(visibilityAtOffset('amis', MODE_STEP * 0.49)).toBe('amis')
  })

  it('les symboles suivent le doigt : glisser à gauche fait entrer celui de droite', () => {
    // Public · Amis · Privé, de gauche à droite.
    expect(visibilityAtOffset('public', -MODE_STEP)).toBe('amis')
    expect(visibilityAtOffset('public', -MODE_STEP * 2)).toBe('prive')
    expect(visibilityAtOffset('prive', MODE_STEP)).toBe('amis')
    expect(visibilityAtOffset('amis', MODE_STEP * 0.6)).toBe('public')
  })

  it('place chaque symbole par rapport au cercle', () => {
    expect(modePosition('public', 'public', 0)).toBe(0)
    expect(modePosition('amis', 'public', 0)).toBe(MODE_STEP)
    expect(modePosition('public', 'amis', 0)).toBe(-MODE_STEP)
    expect(modePosition('amis', 'public', -30)).toBe(MODE_STEP - 30)
    expect(modePosition('prive', 'public', offsetFor('prive', 'public'))).toBe(0)
  })

  it('résiste au-delà de Public et de Privé, sans aller plus loin', () => {
    // Public au centre : rien à gauche, on ne peut presque pas tirer vers la droite.
    expect(stripOffset('public', 10)).toBeCloseTo(2.5)
    expect(stripOffset('public', 1000)).toBe(20)
    expect(stripOffset('public', -MODE_STEP * 2)).toBe(-MODE_STEP * 2)
    expect(stripOffset('public', -1000)).toBe(-MODE_STEP * 2 - 20)
    expect(stripOffset('amis', 50)).toBe(50)
    expect(visibilityAtOffset('public', stripOffset('public', -1000))).toBe('prive')
    expect(visibilityAtOffset('prive', stripOffset('prive', -1000))).toBe('prive')
  })

  it('net et grand dans le cercle, flou et pâle à côté, effacé plus loin', () => {
    expect(modeLook(0)).toEqual({ opacity: 1, blur: 0, scale: 1 })
    const side = modeLook(1)
    expect(side.blur).toBeGreaterThan(0)
    expect(side.opacity).toBeLessThan(1)
    expect(side.scale).toBeLessThan(1)
    expect(modeLook(-1)).toEqual(side)
    expect(modeLook(2).opacity).toBe(0)
    expect(modeLook(1.5).opacity).toBeGreaterThan(0)
  })

  it('montre le nom quand le symbole est dans le cercle, l’efface à mi-chemin', () => {
    expect(labelOpacity(0)).toBe(1)
    expect(labelOpacity(0.25)).toBe(0.5)
    expect(labelOpacity(-0.5)).toBe(0)
  })

  it('flèches du clavier : mode voisin, sans boucler', () => {
    expect(neighborVisibility('public', 1)).toBe('amis')
    expect(neighborVisibility('amis', 1)).toBe('prive')
    expect(neighborVisibility('prive', 1)).toBe('prive')
    expect(neighborVisibility('public', -1)).toBe('public')
  })
})
