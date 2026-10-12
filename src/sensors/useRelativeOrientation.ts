import { useCallback, useEffect, useState } from 'react'
import { basisFromDeviceOrientation, rotateForScreen, smoothBasis, type CameraBasis } from '../geo/orientation'
import { localCameraBasis, onArPose } from './arTracking'
import { orientationNeedsPermission, requestCompass, type OrientationStatus } from './useOrientation'

export interface RelativeOrientation {
  /** Base de la caméra dans un repère au cap arbitraire (seules les rotations comptent). */
  basis: CameraBasis | null
  /** `ar` : poses d'ARKit ; `gyro` : `deviceorientation` (gyroscope) ; null en attendant. */
  source: 'ar' | 'gyro' | null
  status: OrientationStatus
  /** iOS (navigateur) : l'accès aux capteurs se demande sur un geste. */
  requestPermission(): Promise<boolean>
}

/** Lissage (ms), comme `useOrientation`. */
const SMOOTHING_MS = 40

function screenAngle(): number {
  return screen.orientation?.angle ?? (window as { orientation?: number }).orientation ?? 0
}

/**
 * Orientation **relative** de la caméra arrière, pour le tutoriel : ARKit quand le suivi visuel
 * tourne (`ar`), sinon le gyroscope — l'événement `deviceorientation`, relatif sur Android et
 * iPhone, **jamais** `deviceorientationabsolute` ni `webkitCompassHeading` : chez soi, la boussole
 * est souvent faussée et le tutoriel doit marcher quand même.
 */
export function useRelativeOrientation(ar: boolean): RelativeOrientation {
  const [status, setStatus] = useState<OrientationStatus>(() =>
    typeof window === 'undefined' || !('DeviceOrientationEvent' in window)
      ? 'unsupported'
      : orientationNeedsPermission()
        ? 'needs-permission'
        : 'waiting',
  )
  const [state, setState] = useState<{ basis: CameraBasis; source: 'ar' | 'gyro' } | null>(null)

  // ARKit : la pose de chaque image, dans le repère de la session.
  useEffect(() => {
    if (!ar) return
    let frame = 0
    const tick = () => {
      if (frame) return
      frame = requestAnimationFrame(() => {
        frame = 0
        const basis = localCameraBasis()
        if (basis) setState({ basis, source: 'ar' })
      })
    }
    tick()
    const stop = onArPose(tick)
    return () => {
      stop()
      cancelAnimationFrame(frame)
    }
  }, [ar])

  // Gyroscope : seulement sans ARKit.
  const listening = !ar && (status === 'waiting' || status === 'active')
  useEffect(() => {
    if (!listening) return
    let basis: CameraBasis | null = null
    let last = 0
    let frame = 0
    const onEvent = (e: DeviceOrientationEvent) => {
      if (e.alpha == null || e.beta == null || e.gamma == null) return
      if (![e.alpha, e.beta, e.gamma].every(Number.isFinite)) return
      const now = e.timeStamp > 0 ? e.timeStamp : performance.now()
      const raw = rotateForScreen(basisFromDeviceOrientation(e.alpha, e.beta, e.gamma), screenAngle())
      basis = smoothBasis(basis, raw, last ? 1 - Math.exp(-Math.max(0, now - last) / SMOOTHING_MS) : 1)
      last = now
      if (!frame) {
        frame = requestAnimationFrame(() => {
          frame = 0
          setState({ basis: basis!, source: 'gyro' })
          setStatus((s) => (s === 'waiting' ? 'active' : s))
        })
      }
    }
    window.addEventListener('deviceorientation', onEvent)
    // Ordinateur sans capteurs : aucun événement exploitable.
    const timeout = setTimeout(() => {
      if (!basis) setStatus('unsupported')
    }, 3000)
    return () => {
      window.removeEventListener('deviceorientation', onEvent)
      cancelAnimationFrame(frame)
      clearTimeout(timeout)
    }
  }, [listening])

  const requestPermission = useCallback(async () => {
    const granted = await requestCompass()
    setStatus(granted ? 'waiting' : 'denied')
    return granted
  }, [])

  const current = state && (ar ? state.source === 'ar' : state.source === 'gyro') ? state : null
  return {
    basis: current?.basis ?? null,
    source: current?.source ?? null,
    status: ar ? (current ? 'active' : 'waiting') : status,
    requestPermission,
  }
}
