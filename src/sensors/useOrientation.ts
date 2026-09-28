import { useCallback, useEffect, useMemo, useState } from 'react'
import { angleDiffDeg } from '../geo/math'
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
  angles: CameraAngles | null
  /** Le cap est absolu (référencé au nord) et non relatif. */
  absolute: boolean
  status: OrientationStatus
  /** iOS : l'accès aux capteurs doit être demandé suite à un geste. */
  requestPermission(): Promise<boolean>
}

interface CompassEvent extends DeviceOrientationEvent {
  webkitCompassHeading?: number
}

interface PermissionApi {
  requestPermission?: () => Promise<'granted' | 'denied'>
}

const permissionApi = (): PermissionApi | null =>
  typeof DeviceOrientationEvent === 'undefined' ? null : (DeviceOrientationEvent as unknown as PermissionApi)

const needsPermission = () => typeof permissionApi()?.requestPermission === 'function'

// Accordée une fois par session (iOS), valable pour tous les écrans.
let permissionGranted = false
let pendingRequest: Promise<boolean> | null = null
const grantListeners = new Set<() => void>()

/** Demande (unique à la fois) l'accès à la boussole ; mémorise la réponse. */
function requestCompass(): Promise<boolean> {
  const api = permissionApi()
  if (!api?.requestPermission) return Promise.resolve(true)
  pendingRequest ??= api
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
      grantListeners.forEach((l) => l())
    })
    .catch(() => {
      // Un geste est nécessaire : le premier appui suffira.
      document.addEventListener('touchend', onGesture, true)
      document.addEventListener('click', onGesture, true)
    })
}
if (typeof window !== 'undefined') restoreCompass()

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
    let northOffset: number | null = null
    let absolute = false
    let frame = 0

    const absoluteEvent = 'ondeviceorientationabsolute' in window
    const type = absoluteEvent ? 'deviceorientationabsolute' : 'deviceorientation'

    const onEvent = (e: Event) => {
      const ev = e as CompassEvent
      if (ev.alpha == null || ev.beta == null || ev.gamma == null) return
      let raw = rotateForScreen(basisFromDeviceOrientation(ev.alpha, ev.beta, ev.gamma), screenAngle())
      if (typeof ev.webkitCompassHeading === 'number' && ev.webkitCompassHeading >= 0) {
        // iOS : alpha est relatif à un repère arbitraire ; on estime en continu
        // l'écart avec le cap magnétique fourni par la boussole.
        const measured = angleDiffDeg(anglesFromBasis(raw).heading, ev.webkitCompassHeading)
        northOffset = northOffset == null ? measured : northOffset + angleDiffDeg(northOffset, measured) * 0.1
        raw = rotateAboutUp(raw, northOffset)
        absolute = true
      } else {
        absolute = absoluteEvent || ev.absolute
      }
      basis = smoothBasis(basis, raw, 0.3)
      if (!frame) {
        frame = requestAnimationFrame(() => {
          frame = 0
          setSnapshot({ basis: basis!, absolute })
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
    angles,
    absolute: snapshot?.absolute ?? false,
    status,
    requestPermission,
  }
}
