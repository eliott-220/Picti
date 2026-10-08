import { afterEach, describe, expect, it, vi } from 'vitest'

// Plateforme simulée : « web » (navigateur), « ios » ou « android » (coque Capacitor).
const capacitor = vi.hoisted(() => ({ platform: 'web' }))
vi.mock('@capacitor/core', () => ({
  Capacitor: {
    getPlatform: () => capacitor.platform,
    isNativePlatform: () => capacitor.platform !== 'web',
  },
}))

const { appLinkHash, authRedirectUrl, isNative, platform, platformLabel } = await import('./native')
const { formatVersion } = await import('./data/appUpdate')

afterEach(() => {
  capacitor.platform = 'web'
})

describe('plateforme', () => {
  it('dans le navigateur : rien de natif', () => {
    expect(isNative()).toBe(false)
    expect(platform()).toBe('web')
    expect(platformLabel()).toBeNull()
  })

  it('dans la coque iOS ou Android', () => {
    capacitor.platform = 'ios'
    expect(isNative()).toBe(true)
    expect(platform()).toBe('ios')
    expect(platformLabel()).toBe('app iOS')
    capacitor.platform = 'android'
    expect(platform()).toBe('android')
    expect(platformLabel()).toBe('app Android')
  })
})

describe('ligne de version du menu', () => {
  it('ajoute « app iOS » / « app Android » dans la coque, sans « (locale) »', () => {
    expect(formatVersion('app iOS')).toMatch(/^Version \d\.\d{3}\.\d( · .+)? · app iOS$/)
    expect(formatVersion('app Android')).not.toContain('(locale)')
  })

  it('ne change pas dans le navigateur', () => {
    expect(formatVersion(null)).not.toContain('app ')
    expect(formatVersion()).toBe(formatVersion(null))
  })
})

describe('liens des e-mails (inscription, mot de passe oublié)', () => {
  it('reviennent sur le site ouvert dans le navigateur', () => {
    expect(authRedirectUrl(false, 'https://picti-abc.vercel.app')).toBe('https://picti-abc.vercel.app')
  })

  it('pointent vers l’application en ligne depuis la coque', () => {
    expect(authRedirectUrl(true, 'capacitor://localhost')).toBe('https://picti.vercel.app')
    expect(authRedirectUrl(true, 'https://localhost')).toBe('https://picti.vercel.app')
  })
})

describe('liens PICTI ouverts dans l’app', () => {
  it('gardent la route de l’app', () => {
    expect(appLinkHash('https://picti.vercel.app/#/ami/A1B2C3')).toBe('#/ami/A1B2C3')
    expect(appLinkHash('https://picti.vercel.app/#/photo/42/fil')).toBe('#/photo/42/fil')
  })

  it('ignorent les autres sites, les liens sans route et les adresses invalides', () => {
    expect(appLinkHash('https://exemple.fr/#/ami/A1B2C3')).toBeNull()
    expect(appLinkHash('https://picti.vercel.app/')).toBeNull()
    expect(appLinkHash('https://picti.vercel.app/#access_token=x&type=recovery')).toBeNull()
    expect(appLinkHash('pas une adresse')).toBeNull()
  })
})
