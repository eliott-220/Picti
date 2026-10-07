import { describe, expect, it } from 'vitest'
import { MODE_STEP, modesLeft, visibilityAtOffset } from './shutterModes'

describe('déclencheur : choix du mode en glissant', () => {
  it('reste sur le mode de départ tant que le doigt bouge peu', () => {
    expect(visibilityAtOffset('public', 0)).toBe('public')
    expect(visibilityAtOffset('public', MODE_STEP * 0.49)).toBe('public')
    expect(visibilityAtOffset('amis', -MODE_STEP * 0.49)).toBe('amis')
  })

  it('passe au mode voisin à chaque pas, de gauche à droite : Public · Amis · Privé', () => {
    expect(visibilityAtOffset('public', MODE_STEP)).toBe('amis')
    expect(visibilityAtOffset('public', MODE_STEP * 2)).toBe('prive')
    expect(visibilityAtOffset('prive', -MODE_STEP)).toBe('amis')
    expect(visibilityAtOffset('amis', -MODE_STEP * 0.6)).toBe('public')
  })

  it('s’arrête aux extrémités au lieu de boucler', () => {
    expect(visibilityAtOffset('public', -MODE_STEP * 3)).toBe('public')
    expect(visibilityAtOffset('prive', MODE_STEP * 5)).toBe('prive')
    expect(visibilityAtOffset('amis', 1000)).toBe('prive')
  })

  it('place le mode de départ au-dessus du déclencheur', () => {
    // Écran de 390 px, déclencheur au milieu.
    expect(modesLeft('public', 195, 390)).toBe(195 - MODE_STEP / 2)
    expect(modesLeft('amis', 195, 390)).toBe(195 - MODE_STEP / 2 - MODE_STEP)
    expect(modesLeft('prive', 195, 390)).toBe(195 - MODE_STEP / 2 - 2 * MODE_STEP)
  })

  it('garde la réglette dans l’écran (déclencheur au bord, Reproduire en paysage)', () => {
    const width = 3 * MODE_STEP
    const left = modesLeft('public', 800, 856)
    expect(left + width).toBeLessThanOrEqual(856 - 8)
    expect(modesLeft('prive', 40, 390)).toBe(8)
  })
})
