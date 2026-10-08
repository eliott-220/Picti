// Source des relevés de position : la page (`navigator.geolocation`) dans le navigateur et sur
// Android, iOS lui-même (CoreLocation, plugin `Position`) dans l'app iPhone. Les relevés suivent
// ensuite le même chemin (`useGeolocation` → filtre de `geo/tracking.ts`).

import type { GpsFix } from '../geo/tracking'
import {
  hasNativePosition,
  NativePosition,
  type NativeLocation,
  type NativePositionStatus,
  type PluginListenerHandle,
} from '../native'

export type PositionErrorCode = 'denied' | 'unavailable' | 'timeout'

/**
 * « Position exacte » de l'app iOS : `full`, `reduced` (désactivée, après la demande d'iOS),
 * `asking` (iOS la propose en ce moment) ; null : inconnue (navigateur, Android).
 */
export type PreciseLocation = 'full' | 'reduced' | 'asking' | null

export interface PositionHandlers {
  fix(fix: GpsFix): void
  error(message: string, code: PositionErrorCode): void
  /** App iOS : autorisation et « Position exacte » (jamais appelé dans le navigateur). */
  status?(status: NativePositionStatus): void
}

/** Réglages de `watchPosition` dans le navigateur (vérifiés en 0.15.2). */
export const WEB_OPTIONS: PositionOptions = { enableHighAccuracy: true, maximumAge: 0, timeout: 30_000 }

const known = (v: number | null | undefined): number | null => (v != null && Number.isFinite(v) && v >= 0 ? v : null)

/** Relevé d'iOS → relevé du suivi ; null s'il est inutilisable. */
export function nativeFix(l: NativeLocation, now = Date.now()): GpsFix | null {
  if (![l.lat, l.lon, l.accuracy, l.timestamp].every(Number.isFinite) || l.accuracy < 0) return null
  if (Math.abs(l.lat) > 90 || Math.abs(l.lon) > 180) return null
  return {
    lat: l.lat,
    lon: l.lon,
    alt: l.altitude != null && Number.isFinite(l.altitude) ? l.altitude : null,
    accuracy: Math.max(1, l.accuracy),
    // Instant de la mesure, plus juste que celui de la réception (même horloge que `Date.now()`),
    // jamais dans le futur.
    timestamp: Math.min(l.timestamp, now),
    speed: known(l.speed),
    speedAccuracy: known(l.speedAccuracy),
    course: known(l.course),
    courseAccuracy: known(l.courseAccuracy),
  }
}

/** Relevé du navigateur → relevé du suivi. */
export function webFix(pos: GeolocationPosition, now = Date.now()): GpsFix {
  const c = pos.coords
  return {
    lat: c.latitude,
    lon: c.longitude,
    alt: c.altitude,
    accuracy: Math.max(1, c.accuracy),
    // Heure de réception : même horloge que l'affichage, quel que soit le navigateur.
    timestamp: now,
    speed: c.speed,
    speedAccuracy: null,
    // `heading` vaut NaN à l'arrêt, null si l'appareil ne le donne pas.
    course: known(c.heading),
    courseAccuracy: null,
  }
}

function describeWebError(err: GeolocationPositionError): { message: string; code: PositionErrorCode } {
  switch (err.code) {
    case err.PERMISSION_DENIED:
      return { message: 'Accès à la position refusé', code: 'denied' }
    case err.POSITION_UNAVAILABLE:
      return { message: 'Position indisponible', code: 'unavailable' }
    default:
      return { message: 'Position introuvable pour le moment', code: 'timeout' }
  }
}

function watchWeb(h: PositionHandlers): () => void {
  const id = navigator.geolocation.watchPosition(
    (pos) => h.fix(webFix(pos)),
    (err) => {
      const { message, code } = describeWebError(err)
      h.error(message, code)
    },
    WEB_OPTIONS,
  )
  return () => navigator.geolocation.clearWatch(id)
}

/**
 * Suit la position ; renvoie la fonction qui arrête le suivi. Dans l'app iOS, les relevés viennent
 * d'iOS ; si le plugin manque (page plus récente que l'app, essais avec `server.url`), la page
 * reprend la main.
 */
export function watchPositionSource(h: PositionHandlers, native = hasNativePosition()): () => void {
  if (!native) return watchWeb(h)
  let stopped = false
  let fallback: (() => void) | null = null
  const handles: Promise<PluginListenerHandle | null>[] = []
  const listen = (p: Promise<PluginListenerHandle>) => handles.push(p.catch(() => null))
  const removeAll = () => handles.forEach((p) => void p.then((handle) => handle?.remove()).catch(() => undefined))

  listen(
    NativePosition.addListener('location', (l) => {
      const fix = stopped ? null : nativeFix(l)
      if (fix) h.fix(fix)
    }),
  )
  listen(
    NativePosition.addListener('error', (e) => {
      if (!stopped) h.error(e.message, e.code === 'unavailable' ? 'unavailable' : 'denied')
    }),
  )
  listen(
    NativePosition.addListener('status', (s) => {
      if (!stopped) h.status?.(s)
    }),
  )
  NativePosition.start()
    .then((s) => {
      if (!stopped) h.status?.(s)
    })
    .catch(() => {
      if (stopped) return
      removeAll()
      fallback = watchWeb(h)
    })

  return () => {
    stopped = true
    removeAll()
    if (fallback) fallback()
    else void NativePosition.stop().catch(() => undefined)
  }
}

/** App iOS : demande à iOS la position exacte le temps de l'usage (sans effet ailleurs). */
export function requestFullAccuracy(): Promise<NativePositionStatus | null> {
  if (!hasNativePosition()) return Promise.resolve(null)
  return NativePosition.requestFullAccuracy().catch(() => null)
}

/** App iOS : ouvre les réglages de l'app (Position, Position exacte). */
export function openAppSettings(): void {
  if (hasNativePosition()) void NativePosition.openSettings().catch(() => undefined)
}

/**
 * « Position exacte » après un nouvel état d'iOS : sans elle, iOS la propose une fois par lancement
 * (`asking`), puis elle est `reduced` ; une demande en cours le reste jusqu'à sa réponse.
 */
export function nextPrecise(current: PreciseLocation, precise: boolean, asked: boolean): PreciseLocation {
  if (precise) return 'full'
  if (!asked) return 'asking'
  return current === 'asking' ? 'asking' : 'reduced'
}
