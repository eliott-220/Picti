import { useCallback, useEffect, useMemo, useState } from 'react'
import { updateNorth, type NorthState } from '../geo/heading'
import {
  anglesFromBasis,
  basisFromDeviceOrientation,
  rotateAboutUp,
  rotateForScreen,
  smoothBasis,
  type CameraAngles,
  type CameraBasis,
} from '../geo/orientation'
import { isRemembered, remember } from './permissions'

export type OrientationStatus = 'unsupported' | 'needs-permission' | 'denied' | 'waiting' | 'active'

export interface OrientationState {
  basis: CameraBasis | null
  /** Dernière mesure corrigée du nord, avant lissage ; aide de précision uniquement. */
  measuredBasis: CameraBasis | null
  measuredAt: number
  angles: CameraAngles | null
  /** Le cap est absolu (référencé au nord) et non relatif. */
  absolute: boolean
  status: OrientationStatus
  /** iOS : l'accès aux capteurs doit être demandé suite à un geste. */
  requestPermission(): Promise<boolean>
}

interface CompassEvent extends DeviceOrientationEvent {
  webkitCompassHeading?: number
  webkitCompassAccuracy?: number
}

/** Lissage de l'orientation (ms) : gomme le tremblement sans retarder les mouvements. */
const SMOOTHING_MS = 40

interface PermissionApi {
  requestPermission?: () => Promise<'granted' | 'denied'>
}

const permissionApi = (): PermissionApi | null =>
  typeof DeviceOrientationEvent === 'undefined' ? null : (DeviceOrientationEvent as unknown as PermissionApi)

const needsPermission = () => typeof permissionApi()?.requestPermission === 'function'

/**
 * L'accéléromètre (détection de la marche, `motion.ts`) relève de la même
 * autorisation « mouvement et orientation » : on la demande en même temps,
 * sans attendre ni afficher d'erreur (sans elle, la position suit le GPS).
 */
function requestMotion() {
  const api = typeof DeviceMotionEvent === 'undefined' ? null : (DeviceMotionEvent as unknown as PermissionApi)
  void api?.requestPermission?.().catch(() => undefined)
}

// Accordée une fois par session (iOS), valable pour tous les écrans.
let permissionGranted = false
let pendingRequest: Promise<boolean> | null = null
const grantListeners = new Set<() => void>()

/** Demande (unique à la fois) l'accès à la boussole ; mémorise la réponse. */
function requestCompass(): Promise<boolean> {
  const api = permissionApi()
  if (!api?.requestPermission) return Promise.resolve(true)
  if (pendingRequest) return pendingRequest
  pendingRequest = api
    .requestPermission()
    .then((answer) => {
      permissionGranted = answer === 'granted'
      remember('boussole', permissionGranted)
      if (permissionGranted) grantListeners.forEach((l) => l())
      return permissionGranted
    })
    .catch(() => false)
    .finally(() => {
      pendingRequest = null
    })
  requestMotion()
  return pendingRequest
}

/**
 * iOS redemande l'accès à la boussole à chaque ouverture. Si l'utilisateur
 * l'a déjà accordé, on le réactive sans bouton : aussitôt si le système
 * l'accepte, sinon au premier appui n'importe où dans l'app.
 */
function restoreCompass() {
  if (!needsPermission() || permissionGranted || !isRemembered('boussole')) return
  const onGesture = () => {
    document.removeEventListener('touchend', onGesture, true)
    document.removeEventListener('click', onGesture, true)
    if (!permissionGranted) void requestCompass()
  }
  permissionApi()!
    .requestPermission!()
    .then((answer) => {
      if (answer !== 'granted') return
      permissionGranted = true
      requestMotion()
      grantListeners.forEach((l) => l())
    })
    .catch(() => {
      // Un geste est nécessaire : le premier appui suffira.
      document.addEventListener('touchend', onGesture, true)
      document.addEventListener('click', onGesture, true)
    })
}
if (typeof window !== 'undefined') restoreCompass()

// Nord de la boussole (iPhone), partagé par tous les écrans : passer de l'accueil à la chasse
// garde le même recalage du gyroscope au lieu de repartir de la boussole brute (bruitée) —
// une photo reste au même endroit d'un écran à l'autre. Après une interruption (app en
// arrière-plan), `updateNorth` recale d'abord vite, le repère du gyroscope ayant pu changer.
let sharedNorth: NorthState | null = null

function screenAngle(): number {
  return screen.orientation?.angle ?? (window as { orientation?: number }).orientation ?? 0
}

function initialStatus(): OrientationStatus {
  if (typeof window === 'undefined' || !('DeviceOrientationEvent' in window)) return 'unsupported'
  return needsPermission() && !permissionGranted ? 'needs-permission' : 'waiting'
}

/** Orientation de la caméra arrière, lissée et référencée au nord si possible. */
export function useOrientation(enabled = true): OrientationState {
  const [status, setStatus] = useState<OrientationStatus>(initialStatus)
  const [snapshot, setSnapshot] = useState<{ basis: CameraBasis; absolute: boolean } | null>(null)
  const [measurement, setMeasurement] = useState<{ basis: CameraBasis; at: number } | null>(null)

  const listening = enabled && (status === 'waiting' || status === 'active')

  // Accès accordé ailleurs (autre écran, ou réactivation automatique).
  useEffect(() => {
    const onGrant = () => setStatus((s) => (s === 'needs-permission' || s === 'denied' ? 'waiting' : s))
    grantListeners.add(onGrant)
    return () => {
      grantListeners.delete(onGrant)
    }
  }, [])

  useEffect(() => {
    if (!listening) return
    let basis: CameraBasis | null = null
    let absolute = false
    let measured: CameraBasis | null = null
    let measuredAt = 0
    let last = 0
    let frame = 0

    const absoluteEvent = 'ondeviceorientationabsolute' in window
    const type = absoluteEvent ? 'deviceorientationabsolute' : 'deviceorientation'

    const onEvent = (e: Event) => {
      const ev = e as CompassEvent
      if ([ev.alpha, ev.beta, ev.gamma].some((v) => v == null || !Number.isFinite(v))) {
        measured = null
        setMeasurement(null)
        return
      }
      if (ev.alpha == null || ev.beta == null || ev.gamma == null) return
      // Horodatage de l'événement : le même pour tous les écrans qui l'écoutent (le nord
      // partagé n'est intégré qu'une fois par mesure).
      const now = ev.timeStamp > 0 ? ev.timeStamp : performance.now()
      let raw = rotateForScreen(basisFromDeviceOrientation(ev.alpha, ev.beta, ev.gamma), screenAngle())
      if (typeof ev.webkitCompassHeading === 'number' && Number.isFinite(ev.webkitCompassHeading) && ev.webkitCompassHeading >= 0) {
        // iOS : alpha vient du gyroscope, relatif à un repère arbitraire ; son écart avec
        // le nord de la boussole est recalé lentement (voir `geo/heading.ts`).
        const { heading, pitch } = anglesFromBasis(raw)
        sharedNorth = updateNorth(sharedNorth, {
          gyroHeading: heading,
          compass: ev.webkitCompassHeading,
          accuracy: typeof ev.webkitCompassAccuracy === 'number' ? ev.webkitCompassAccuracy : null,
          pitch,
          t: now,
        })
        raw = rotateAboutUp(raw, sharedNorth.offset)
        absolute = true
      } else if (sharedNorth) {
        // Boussole momentanément muette : on garde le dernier recalage.
        raw = rotateAboutUp(raw, sharedNorth.offset)
        absolute = true
      } else {
        absolute = absoluteEvent || ev.absolute
      }
      measured = raw
      measuredAt = performance.now()
      basis = smoothBasis(basis, raw, last ? 1 - Math.exp(-Math.max(0, now - last) / SMOOTHING_MS) : 1)
      last = now
      if (!frame) {
        frame = requestAnimationFrame(() => {
          frame = 0
          setSnapshot({ basis: basis!, absolute })
          setMeasurement(measured ? { basis: measured, at: measuredAt } : null)
          setStatus((s) => (s === 'waiting' ? 'active' : s))
        })
      }
    }

    window.addEventListener(type, onEvent)
    // Ordinateur sans capteurs : aucun événement exploitable n'arrive.
    const timeout = setTimeout(() => {
      if (!basis) setStatus('unsupported')
    }, 4000)
    return () => {
      window.removeEventListener(type, onEvent)
      cancelAnimationFrame(frame)
      clearTimeout(timeout)
    }
  }, [listening])

  const requestPermission = useCallback(async () => {
    const granted = await requestCompass()
    setStatus(granted ? 'waiting' : 'denied')
    return granted
  }, [])

  const angles = useMemo(() => (snapshot ? anglesFromBasis(snapshot.basis) : null), [snapshot])

  return {
    basis: snapshot?.basis ?? null,
    measuredBasis: measurement?.basis ?? null,
    measuredAt: measurement?.at ?? -Infinity,
    angles,
    absolute: snapshot?.absolute ?? false,
    status,
    requestPermission,
  }
}
