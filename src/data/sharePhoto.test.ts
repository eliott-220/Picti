import { describe, expect, it, vi } from 'vitest'

vi.mock('@capacitor/core', () => ({
  Capacitor: { getPlatform: () => 'web', isNativePlatform: () => false },
  registerPlugin: () => ({}),
  SystemBars: {},
  SystemBarsStyle: {},
  SystemBarType: {},
}))
vi.mock('./supabase', () => ({ PHOTO_BUCKET: 'photos', supabase: {} }))

const { isShareCancel, SHARE_TEXT, shareFileName, shareRoute } = await import('./sharePhoto')

describe('fiche : partager la photo (0.23.0)', () => {
  it('feuille du système dans l’app, partage du navigateur s’il sait envoyer des fichiers, sinon téléchargement', () => {
    expect(shareRoute(true, false)).toBe('native')
    expect(shareRoute(true, true)).toBe('native')
    expect(shareRoute(false, true)).toBe('web-share')
    expect(shareRoute(false, false)).toBe('download')
  })

  it('refermer la feuille n’est pas une erreur', () => {
    expect(isShareCancel(new DOMException('annulé', 'AbortError'))).toBe(true)
    // Plugin Capacitor Share (iOS et Android) : « Share canceled ».
    expect(isShareCancel(new Error('Share canceled'))).toBe(true)
    expect(isShareCancel(new Error('Error sharing item'))).toBe(false)
    expect(isShareCancel(new DOMException('refusé', 'NotAllowedError'))).toBe(false)
  })

  it('texte court avec le lien du site, jamais la position', () => {
    expect(SHARE_TEXT).toBe('Trouvée sur PICTI https://picti.vercel.app')
    expect(SHARE_TEXT).not.toMatch(/#|lat|lon/)
  })

  it('nomme le fichier d’après le titre', () => {
    expect(shareFileName('Coucher de soleil à La Rochelle', 'u1/abc.jpg')).toBe('picti-coucher-de-soleil-a-la-rochelle.jpg')
    expect(shareFileName('', 'u1/abc.webp')).toBe('picti-photo.webp')
  })
})
