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
    const api = permissionApi()
    if (!api?.requestPermission) return true
    try {
      permissionGranted = (await api.requestPermission()) === 'granted'
    } catch {
      permissionGranted = false
    }
    setStatus(permissionGranted ? 'waiting' : 'denied')
    return permissionGranted
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
