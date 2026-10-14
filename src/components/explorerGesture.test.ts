import { describe, expect, it } from 'vitest'
import { explorerCommits, explorerIntent, explorerProgress } from './explorerGesture'
import { swipeIntent } from './swipeOpen'

describe('Explorer : haut pour ouvrir, bas pour fermer', () => {
  it('attend le seuil puis choisit un seul axe, identique à celui des onglets', () => {
    expect(explorerIntent(3, -4, false)).toBeNull()
    for (const [x, y] of [[8, -7], [30, -20], [-30, 20], [4, -40], [0, 40]]) {
      const vertical = explorerIntent(x, y, y > 0)
      expect(vertical === 'vertical').toBe(swipeIntent(x, y, ['left', 'right']) === 'other')
    }
  })
  it('ne commande pas Explorer dans le mauvais sens', () => {
    expect(explorerIntent(0, 50, false)).toBe('other')
    expect(explorerIntent(0, -50, true)).toBe('other')
  })
  it('suit le doigt dans les deux sens et borne le déplacement', () => {
    expect(explorerProgress(-100, 400, false)).toBe(0.25)
    expect(explorerProgress(100, 400, true)).toBe(0.75)
    expect(explorerProgress(-800, 400, false)).toBe(1)
    expect(explorerProgress(800, 400, true)).toBe(0)
    expect(explorerProgress(-10, 0, false)).toBe(1)
  })
  it('un geste lent assez long ouvre / ferme, un geste court revient', () => {
    expect(explorerCommits(-160, -0.1, 400, false)).toBe(true)
    expect(explorerCommits(160, 0.1, 400, true)).toBe(true)
    expect(explorerCommits(-70, -0.1, 400, false)).toBe(false)
    expect(explorerCommits(70, 0.1, 400, true)).toBe(false)
  })
  it('un coup de doigt suffit dans les deux sens', () => {
    expect(explorerCommits(-40, -0.8, 400, false)).toBe(true)
    expect(explorerCommits(40, 0.8, 400, true)).toBe(true)
    expect(explorerCommits(-20, -0.8, 400, false)).toBe(false)
  })
  it('une inversion au relâcher annule le geste', () => {
    expect(explorerCommits(-180, 0.8, 400, false)).toBe(false)
    expect(explorerCommits(180, -0.8, 400, true)).toBe(false)
  })
})
