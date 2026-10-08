// Coque native Capacitor (iOS, Android) : seul module qui importe `@capacitor/core`.
// Dans le navigateur, tout se comporte comme avant (`isNative()` faux).

import { Capacitor, registerPlugin, SystemBars, SystemBarsStyle, SystemBarType, type PluginListenerHandle } from '@capacitor/core'
import { useEffect } from 'react'
import { APP_URL } from './config'

export type Platform = 'ios' | 'android' | 'web'

export type { PluginListenerHandle }

/** L'app tourne dans la coque native (et non dans un navigateur). */
export function isNative(): boolean {
  return Capacitor.isNativePlatform()
}

export function platform(): Platform {
  const p = Capacitor.getPlatform()
  return p === 'ios' || p === 'android' ? p : 'web'
}

/** Mention ajoutée à la ligne de version du menu (« app iOS »), null dans le navigateur. */
export function platformLabel(p: Platform = platform()): string | null {
  if (p === 'ios') return 'app iOS'
  if (p === 'android') return 'app Android'
  return null
}

/** Bouton Liquid Glass tel qu'envoyé au plugin natif (cadre en points, ceux de la page). */
export interface GlassButtonSpec {
  id: string
  /** `button` : bouton rond ou pastille ; `segmented` : sélecteur segmenté (« Monde / Amis »). */
  kind: 'button' | 'segmented'
  /** Nom du symbole SF (ex. « bell »), null pour une pastille à texte. */
  symbol: string | null
  /** Texte d'une pastille (« Tout le monde »). */
  title: string | null
  /** Choix d'un sélecteur segmenté, null pour un bouton. */
  segments: string[] | null
  /** Choix sélectionné d'un sélecteur segmenté (−1 : aucun). */
  selected: number
  /** Libellé lu par VoiceOver. */
  label: string
  /** Cadre à l'écran. */
  x: number
  y: number
  width: number
  height: number
  /**
   * Zone qui défile autour du bouton (clé, partie visible à l'écran) : le natif pose son bouton dans
   * la vue de défilement d'iOS correspondante, en (cx, cy) dans son contenu. Null : bouton fixe.
   */
  scroller: { key: number; x: number; y: number; width: number; height: number } | null
  cx: number
  cy: number
  /** Pastille rouge (« 3 », « 99+ »), null sans pastille. */
  badge: string | null
  dim: boolean
  /** Bouton enfoncé (selfie, QR affiché) : verre teinté en rouge. */
  active: boolean
  disabled: boolean
  /** Rotation de l'icône en degrés (boussole de la carte). */
  rotation: number
  /** Couleur de l'icône (« #eb0c0c »), null : couleur du verre. */
  color: string | null
  /** Faux quand le bouton web est recouvert (feuille, fiche…) ou hors de l'écran (bouton fixe). */
  visible: boolean
}

interface GlassButtonsPlugin {
  /** Vrai sur iOS 26 et plus (Liquid Glass). */
  isAvailable(): Promise<{ available: boolean }>
  /** Liste complète des boutons à afficher : le natif crée, déplace et retire les siens. */
  set(options: { buttons: GlassButtonSpec[] }): Promise<void>
  clear(): Promise<void>
}

/** Plugin de l'app iOS (`ios/App/App/GlassButtonsPlugin.swift`), à n'appeler que sur iOS. */
export const GlassButtons = registerPlugin<GlassButtonsPlugin>('GlassButtons')

/** Relevé de position de l'app iOS (CoreLocation) ; `null` : valeur que l'appareil ne donne pas. */
export interface NativeLocation {
  lat: number
  lon: number
  /** Rayon de confiance horizontal (m). */
  accuracy: number
  altitude: number | null
  altitudeAccuracy: number | null
  /** Vitesse sol (m/s) et sa précision. */
  speed: number | null
  speedAccuracy: number | null
  /** Cap du déplacement (degrés depuis le nord) et sa précision. */
  course: number | null
  courseAccuracy: number | null
  /** Instant de la mesure (ms depuis 1970, même horloge que `Date.now()`). */
  timestamp: number
  /** Position simulée (Xcode, simulateur). */
  simulated: boolean
}

/** Autorisation de position de l'app et « Position exacte ». */
export interface NativePositionStatus {
  authorization: 'notDetermined' | 'denied' | 'restricted' | 'whenInUse' | 'always'
  precise: boolean
}

export interface NativePositionError {
  code: 'denied' | 'restricted' | 'unavailable'
  message: string
}

interface PositionPlugin {
  /** Démarre les relevés (et demande l'autorisation la première fois). */
  start(): Promise<NativePositionStatus>
  stop(): Promise<void>
  status(): Promise<NativePositionStatus>
  /** « Position exacte » désactivée : iOS la propose le temps de l'usage de l'app. */
  requestFullAccuracy(): Promise<NativePositionStatus>
  /** Ouvre les réglages de l'app. */
  openSettings(): Promise<void>
  addListener(event: 'location', listener: (location: NativeLocation) => void): Promise<PluginListenerHandle>
  addListener(event: 'error', listener: (error: NativePositionError) => void): Promise<PluginListenerHandle>
  addListener(event: 'status', listener: (status: NativePositionStatus) => void): Promise<PluginListenerHandle>
}

/** Plugin de l'app iOS (`ios/App/App/PositionPlugin.swift`), à n'appeler que sur iOS. */
export const NativePosition = registerPlugin<PositionPlugin>('Position')

/** La position vient d'iOS (CoreLocation) plutôt que de la page : app iOS seulement. */
export const hasNativePosition = (p: Platform = platform()): boolean => p === 'ios'

/**
 * Texte de la barre d'état dans la coque : blanc par défaut (caméra, en-têtes rouges, comme le
 * `black-translucent` du web), foncé sur les écrans clairs en haut. Sans effet dans le navigateur.
 */
export function setStatusBarText(color: 'light' | 'dark'): void {
  if (!isNative()) return
  const style = color === 'light' ? SystemBarsStyle.Dark : SystemBarsStyle.Light
  SystemBars.setStyle({ style, bar: SystemBarType.StatusBar }).catch(() => {})
}

/** Écran clair en haut (connexion, recherche, carte) : texte foncé tant qu'il est affiché. */
export function useDarkStatusBar(): void {
  useEffect(() => {
    setStatusBarText('dark')
    return () => setStatusBarText('light')
  }, [])
}

/**
 * Adresse où ramènent les liens des e-mails (confirmation d'inscription, mot de passe oublié).
 * Dans la coque, l'origine vaut `capacitor://localhost` (iOS) ou `https://localhost` (Android),
 * inutilisable depuis un e-mail : on renvoie vers l'application en ligne.
 */
export function authRedirectUrl(native = isNative(), origin = window.location.origin): string {
  return native ? APP_URL : origin
}

/**
 * Ancre de l'app (`#/ami/CODE`) d'un lien PICTI ouvert depuis l'extérieur (lien universel iOS,
 * App Link Android) ; null pour un lien d'un autre site ou sans route (`#access_token=…`).
 */
export function appLinkHash(url: string, app = APP_URL): string | null {
  try {
    const u = new URL(url)
    if (u.host !== new URL(app).host) return null
    return u.hash.startsWith('#/') ? u.hash : null
  } catch {
    return null
  }
}

/**
 * Liens d'invitation ouverts dans l'app (préparé, pas encore actif : il manque les fichiers
 * `public/.well-known/` remplis et les réglages natifs, voir README.md › « Liens d'invitation
 * dans l'app »). `@capacitor/app` n'est chargé que dans la coque.
 */
export async function listenForAppLinks(): Promise<void> {
  if (!isNative()) return
  const { App } = await import('@capacitor/app')
  await App.addListener('appUrlOpen', ({ url }) => {
    const hash = appLinkHash(url)
    if (hash && hash !== location.hash) location.hash = hash
  })
}
