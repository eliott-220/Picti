import { describe, expect, it } from 'vitest'
import { nextVisibility, VISIBILITIES, visibilityHelp, VISIBLE_BY, type Visibility } from './types'

describe('pastille de visibilité', () => {
  it('fait défiler les trois valeurs, dans l’ordre, en boucle', () => {
    expect(nextVisibility('public')).toBe('amis')
    expect(nextVisibility('amis')).toBe('prive')
    expect(nextVisibility('prive')).toBe('public')
  })

  it('revient à son départ après trois appuis, quel qu’il soit', () => {
    for (const start of VISIBILITIES) {
      let v: Visibility = start
      const seen = new Set<Visibility>()
      for (let i = 0; i < 3; i++) {
        v = nextVisibility(v)
        seen.add(v)
      }
      expect(v).toBe(start)
      expect(seen.size).toBe(3)
    }
  })

  it('dit où la photo est publiée', () => {
    expect(`visible par ${VISIBLE_BY.amis}`).toBe('visible par vos amis')
    expect(visibilityHelp('amis')).toBe('Seuls vos amis peuvent la découvrir sur place.')
    expect(visibilityHelp('public', { plural: true })).toContain('peuvent les découvrir')
    expect(visibilityHelp('prive', { plural: true })).toBe('Vous seul pouvez les voir.')
  })
})
