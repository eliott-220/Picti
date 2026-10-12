import { describe, expect, it } from 'vitest'
import {
  columnLift,
  columnOrder,
  columnPosition,
  labelOpacity,
  liftFor,
  MODE_STEP,
  modeLook,
  neighborVisibility,
  visibilityAtLift,
} from './shutterModes'

describe('déclencheur : choix du mode en colonne, au-dessus du bouton (0.23.0)', () => {
  it('le mode actuel est dans le cercle, les deux autres au-dessus (Public · Amis · Privé), rien en dessous', () => {
    expect(columnOrder('public')).toEqual(['public', 'amis', 'prive'])
    expect(columnOrder('amis')).toEqual(['amis', 'public', 'prive'])
    expect(columnOrder('prive')).toEqual(['prive', 'public', 'amis'])
    for (const from of ['public', 'amis', 'prive'] as const) {
      for (const v of columnOrder(from)) expect(columnPosition(v, from, 0)).toBeLessThanOrEqual(0)
    }
  })

  it('reste sur le mode de départ tant que le doigt bouge peu', () => {
    expect(visibilityAtLift('public', columnLift(0))).toBe('public')
    expect(visibilityAtLift('public', columnLift(-MODE_STEP * 0.49))).toBe('public')
    expect(visibilityAtLift('amis', columnLift(10))).toBe('amis')
  })

  it('glisser vers le haut monte d’un mode, redescendre revient', () => {
    expect(visibilityAtLift('public', columnLift(-MODE_STEP))).toBe('amis')
    expect(visibilityAtLift('public', columnLift(-MODE_STEP * 2))).toBe('prive')
    expect(visibilityAtLift('amis', columnLift(-MODE_STEP))).toBe('public')
    expect(visibilityAtLift('prive', columnLift(-MODE_STEP * 2))).toBe('amis')
    // Monté de deux, redescendu d'un : le mode du milieu.
    expect(visibilityAtLift('public', columnLift(-MODE_STEP * 2 + MODE_STEP))).toBe('amis')
  })

  it('le symbole choisi vient dans le cercle', () => {
    expect(columnPosition('amis', 'public', 0)).toBe(-MODE_STEP)
    expect(columnPosition('amis', 'public', MODE_STEP)).toBe(0)
    expect(columnPosition('prive', 'public', liftFor('prive', 'public'))).toBe(0)
    expect(liftFor('public', 'public')).toBe(0)
    // Le mode de départ passe sous le cercle quand on monte.
    expect(columnPosition('public', 'public', MODE_STEP)).toBe(MODE_STEP)
  })

  it('résiste sous le premier mode et au-delà du dernier', () => {
    expect(columnLift(10)).toBeCloseTo(-2.5)
    expect(columnLift(1000)).toBe(-20)
    expect(columnLift(-MODE_STEP * 2)).toBe(MODE_STEP * 2)
    expect(columnLift(-1000)).toBe(MODE_STEP * 2 + 20)
    expect(visibilityAtLift('public', columnLift(-1000))).toBe('prive')
    expect(visibilityAtLift('prive', columnLift(1000))).toBe('prive')
  })

  it('net et grand dans le cercle, flou et pâle au-dessus, effacé plus loin', () => {
    expect(modeLook(0)).toEqual({ opacity: 1, blur: 0, scale: 1 })
    const above = modeLook(-1)
    expect(above.blur).toBeGreaterThan(0)
    expect(above.opacity).toBeLessThan(1)
    expect(above.scale).toBeLessThan(1)
    expect(modeLook(-2).opacity).toBe(0)
    expect(modeLook(-1.5).opacity).toBeGreaterThan(0)
  })

  it('un symbole qui passe sous le cercle s’efface vite (rien sur la barre)', () => {
    expect(modeLook(0.25).opacity).toBe(0.5)
    expect(modeLook(0.5).opacity).toBe(0)
    expect(modeLook(1).opacity).toBe(0)
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
