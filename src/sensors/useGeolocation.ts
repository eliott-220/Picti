import { useEffect, useState, useSyncExternalStore } from 'react'
import type { GeoFix } from '../geo/geodesy'
import { trackFix, updateTrack, walkTrack, type GpsFix, type Track } from '../geo/tracking'
import type { NativePositionStatus } from '../native'
import { currentMotion, watchMotion } from './motion'
import { nextPrecise, requestFullAccuracy, watchPositionSource, type PreciseLocation } from './positionSource'

export interface GeolocationState {
  /** Position estimée au dernier relevé GPS. */
  fix: GeoFix | null
  /** Suivi de la position, pour la faire avancer entre deux relevés (`useLivePosition`). */
  track: Track | null
  error: string | null
  /** Accès refusé (le message peut alors proposer les réglages). */
  denied: boolean
  precise: PreciseLocation
}

const IDLE: GeolocationState = { fix: null, track: null, error: null, denied: false, precise: null }
const UNSUPPORTED: GeolocationState = { ...IDLE, error: 'Géolocalisation non prise en charge' }

// Un seul suivi GPS pour toute l'app : passer de l'accueil à la chasse garde
// la position acquise (la photo ne saute pas d'un écran à l'autre).
/** Durée (ms) pendant laquelle le GPS reste suivi après avoir quitté le dernier écran qui s'en sert. */
const KEEP_ALIVE_MS = 10_000

let state = IDLE
let track: Track | null = null
/** Jusqu'à cet instant (ms), un écran fait avancer la position pas à pas (`walkPosition`). */
let steppingUntil = 0
const listeners = new Set<() => void>()
/** Écouteurs des relevés bruts (avant le filtre) : calage du suivi visuel. */
const fixListeners = new Set<(fix: GpsFix) => void>()
let watch: { stop: () => void; stopMotion: () => void } | null = null
/** « Position exacte » déjà proposée par iOS pendant ce lancement de l'app. */
let fullAccuracyAsked = false
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
  const stop = watchPositionSource({
    fix(fix) {
      fixListeners.forEach((l) => l(fix))
      track = updateTrack(track, fix, currentMotion(), Date.now() < steppingUntil)
      publish({ ...state, fix: trackFix(track), track, error: null, denied: false })
    },
    error(message, code) {
      publish({ ...state, error: message, denied: code === 'denied' })
    },
    status: onStatus,
  })
  watch = { stop, stopMotion }
}

/** App iOS : autorisation et « Position exacte » ; celle-ci est proposée par iOS une fois. */
function onStatus(s: NativePositionStatus) {
  if (s.authorization === 'notDetermined') return
  if (s.authorization === 'denied' || s.authorization === 'restricted') {
    publish({ ...state, error: 'Accès à la position refusé', denied: true })
    return
  }
  // Autorisée (éventuellement après un passage par les réglages) : plus d'erreur d'accès.
  const base = state.denied ? { ...state, error: null, denied: false } : state
  const precise = nextPrecise(state.precise, s.precise, fullAccuracyAsked)
  if (precise === 'asking') {
    fullAccuracyAsked = true
    void requestFullAccuracy().then((answer) => {
      if (watch) publish({ ...state, precise: answer?.precise ? 'full' : 'reduced' })
    })
  }
  if (base !== state || precise !== state.precise) publish({ ...base, precise })
}

function stopWatching() {
  if (!watch) return
  watch.stop()
  watch.stopMotion()
  watch = null
  track = null
  publish(IDLE)
}

/** Reçoit chaque relevé brut (tant que la position est suivie) ; renvoie de quoi se désabonner. */
export function onFix(listener: (fix: GpsFix) => void): () => void {
  fixListeners.add(listener)
  return () => {
    fixListeners.delete(listener)
  }
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
