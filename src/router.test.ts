import { describe, expect, it } from 'vitest'
import { parseHash } from './router'

describe('parseHash', () => {
  it('ouvre l’accueil par défaut', () => {
    expect(parseHash('')).toEqual({ name: 'accueil' })
    expect(parseHash('#/')).toEqual({ name: 'accueil' })
    expect(parseHash('#/inconnu')).toEqual({ name: 'accueil' })
  })

  it('reconnaît les écrans', () => {
    expect(parseHash('#/profil')).toEqual({ name: 'profil' })
    expect(parseHash('#/chasses')).toEqual({ name: 'chasses' })
    expect(parseHash('#/proximite')).toEqual({ name: 'proximite' })
    expect(parseHash('#/carte')).toEqual({ name: 'carte' })
  })

  it('lit les identifiants de photo', () => {
    expect(parseHash('#/photo/abc-123')).toEqual({ name: 'photo', id: 'abc-123' })
    expect(parseHash('#/chasse/abc')).toEqual({ name: 'chasse', id: 'abc' })
    expect(parseHash('#/recaler/abc')).toEqual({ name: 'recaler', id: 'abc' })
    expect(parseHash('#/photo')).toEqual({ name: 'accueil' })
  })

  it('lit les paramètres de recherche', () => {
    expect(parseHash('#/recherche')).toEqual({ name: 'recherche', filters: false })
    expect(parseHash('#/recherche?filtres')).toEqual({ name: 'recherche', filters: true })
  })
})
