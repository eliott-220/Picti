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

  it('ouvre « Mes amis » dans le profil', () => {
    expect(parseHash('#/profil/amis')).toEqual({ name: 'profil', section: 'amis' })
    expect(parseHash('#/profil/autre')).toEqual({ name: 'profil' })
  })

  it('lit le code d’un lien d’invitation', () => {
    expect(parseHash('#/ami/A1B2C3')).toEqual({ name: 'ami', code: 'A1B2C3' })
    expect(parseHash('#/ami/a1b2c3?x')).toEqual({ name: 'ami', code: 'a1b2c3' })
    expect(parseHash('#/ami/A1%20B2')).toEqual({ name: 'ami', code: 'A1 B2' })
    expect(parseHash('#/ami')).toEqual({ name: 'accueil' })
    expect(parseHash('#/ami/')).toEqual({ name: 'accueil' })
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
