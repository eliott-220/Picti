import { afterEach, describe, expect, it, vi } from 'vitest'
import { parseHash } from '../router'
import { inviteLink, normalizeFriendCode, rememberInvite, takePendingInvite } from './invite'

describe('lien d’invitation', () => {
  it('pointe vers l’application en ligne avec le code ami', () => {
    expect(inviteLink('A1B2C3')).toBe('https://picti.vercel.app/#/ami/A1B2C3')
  })

  it('normalise le code (espaces, minuscules)', () => {
    expect(normalizeFriendCode('  a1b2c3 ')).toBe('A1B2C3')
    expect(inviteLink(' a1b2c3')).toBe('https://picti.vercel.app/#/ami/A1B2C3')
  })

  it('accepte une autre adresse de base, avec ou sans barre finale', () => {
    expect(inviteLink('A1B2C3', 'http://localhost:5173/')).toBe('http://localhost:5173/#/ami/A1B2C3')
  })

  it('est relu par le routeur', () => {
    const link = inviteLink('A1B2C3')
    expect(parseHash(link.slice(link.indexOf('#')))).toEqual({ name: 'ami', code: 'A1B2C3' })
  })
})

describe('invitation en attente de connexion', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('garde le code jusqu’à sa première lecture', () => {
    const store = new Map<string, string>()
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    })
    rememberInvite('a1b2c3')
    expect(takePendingInvite()).toBe('A1B2C3')
    expect(takePendingInvite()).toBeNull()
  })

  it('stockage indisponible : rien ne casse', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('bloqué')
      },
      setItem: () => {
        throw new Error('bloqué')
      },
      removeItem: () => undefined,
    })
    expect(() => rememberInvite('A1B2C3')).not.toThrow()
    expect(takePendingInvite()).toBeNull()
  })
})
