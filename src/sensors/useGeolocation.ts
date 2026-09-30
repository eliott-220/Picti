import { useEffect, useState, useSyncExternalStore } from 'react'
import type { GeoFix } from '../geo/geodesy'
import { trackFix, updateTrack, walkTrack, type Track } from '../geo/tracking'
import { currentMotion, watchMotion } from './motion'

export interface GeolocationState {
  /** Position estimée au dernier relevé GPS. */
  fix: GeoFix | null
  /** Suivi de la position, pour la faire avancer entre deux relevés (`useLivePosition`). */
  track: Track | null
  error: string | null
}

function describe(err: GeolocationPositionError): string {
  switch (err.code) {
    case err.PERMISSION_DENIED:
      return 'Accès à la position refusé'
    case err.POSITION_UNAVAILABLE:
      return 'Position indisponible'
    default:
      return 'Position introuvable pour le moment'
  }
}

const IDLE: GeolocationState = { fix: null, track: null, error: null }
const UNSUPPORTED: GeolocationState = { fix: null, track: null, error: 'Géolocalisation non prise en charge' }

// Un seul suivi GPS pour toute l'app : passer de l'accueil à la chasse garde
// la position acquise (la photo ne saute pas d'un écran à l'autre).
/** Durée (ms) pendant laquelle le GPS reste suivi après avoir quitté le dernier écran qui s'en sert. */
const KEEP_ALIVE_MS = 10_000

let state = IDLE
let track: Track | null = null
/** Jusqu'à cet instant (ms), un écran fait avancer la position pas à pas (`walkPosition`). */
let steppingUntil = 0
const listeners = new Set<() => void>()
let watch: { id: number; stopMotion: () => void } | null = null
let users = 0
let stopTimer: ReturnType<typeof setTimeout> | undefined

function publish(next: GeolocationState) {
  state = next
  listeners.forEach((l) => l())
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

function startWatching() {
  clearTimeout(stopTimer)
  if (watch) return
  const stopMotion = watchMotion()
  track = null
  const id = navigator.geolocation.watchPosition(
    (pos) => {
      track = updateTrack(
        track,
        {
          lat: pos.coords.latitude,
          lon: pos.coords.longitude,
          alt: pos.coords.altitude,
          accuracy: Math.max(1, pos.coords.accuracy),
          // Heure de réception : même horloge que l'affichage, quel que soit le navigateur.
          timestamp: Date.now(),
          speed: pos.coords.speed,
        },
        currentMotion(),
        Date.now() < steppingUntil,
      )
      publish({ fix: trackFix(track), track, error: null })
    },
    (err) => publish({ ...state, error: describe(err) }),
    { enableHighAccuracy: true, maximumAge: 0, timeout: 30_000 },
  )
  watch = { id, stopMotion }
}

function stopWatching() {
  if (!watch) return
  navigator.geolocation.clearWatch(watch.id)
  watch.stopMotion()
  watch = null
  track = null
  publish(IDLE)
}

/** Un écran fait avancer la position pas à pas : le GPS ne la tire plus pendant la marche. */
export function keepStepping() {
  steppingUntil = Date.now() + 2000
}

/** Fait avancer la position de `de`, `dn` m (Est, Nord), selon les pas comptés ; false sans position. */
export function walkPosition(de: number, dn: number): boolean {
  if (!track) return false
  track = walkTrack(track, de, dn)
  publish({ ...state, fix: trackFix(track), track })
  return true
}

/**
 * Suit la position GPS en continu. Les relevés sont lissés et, tant que
 * l'accéléromètre indique qu'on ne marche pas, la dérive du GPS est ignorée.
 */
export function useGeolocation(enabled = true): GeolocationState {
  const [supported] = useState(() => 'geolocation' in navigator)
  const current = useSyncExternalStore(subscribe, () => state)

  useEffect(() => {
    if (!enabled || !supported) return
    users++
    startWatching()
    return () => {
      if (--users === 0) stopTimer = setTimeout(stopWatching, KEEP_ALIVE_MS)
    }
  }, [enabled, supported])

  if (!supported) return UNSUPPORTED
  return enabled ? current : IDLE
}
