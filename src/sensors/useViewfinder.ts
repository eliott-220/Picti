import { useMemo, type RefObject } from 'react'
import type { EncodedImage } from '../data/images'
import { focal35Of } from '../geo/arPose'
import type { GeoFix } from '../geo/geodesy'
import type { NativeArPose } from '../native'
import { captureArPhoto, useArCamera, useArTracking, type ArState } from './arTracking'
import { useCameraFocal } from './cameraFocal'
import { useCamera, type CameraFacing, type CameraStatus } from './useCamera'
import { useFocalCalibration } from './useFocalCalibration'
import { useGeolocation, type GeolocationState } from './useGeolocation'
import { useLivePosition } from './useLivePosition'
import { useOrientation, type OrientationState } from './useOrientation'

/**
 * Image prise par le viseur ; avec le suivi visuel, sa focale et la pose de la caméra (la photo est
 * replacée quand le calage s'affine, `trackArShot`).
 */
export type ViewfinderFrame = EncodedImage & { focal35?: number; pose?: NativeArPose }

export interface ViewfinderCamera {
  videoRef: RefObject<HTMLVideoElement | null>
  status: CameraStatus
  error: string | null
  /** Dimensions de l'image de la caméra (px). */
  size: { width: number; height: number } | null
  capture(): Promise<ViewfinderFrame>
}

export interface Viewfinder {
  camera: ViewfinderCamera
  geo: GeolocationState
  /** Orientation de la caméra : celle du suivi visuel quand son cap est calé, sinon celle des capteurs. */
  orientation: OrientationState
  /** Position du spectateur : celle du suivi visuel calé, sinon le GPS suivi image par image. */
  position: GeoFix | null
  /** Focale équivalente de l'image affichée. */
  focal35: number
  /** Suivi visuel (app iOS) : caméra d'iOS et poses ARKit ; `active` : c'est lui qui sert. */
  ar: { active: boolean; state: ArState }
}

/**
 * Capteurs d'un écran caméra (accueil, chasse, recalage). Dans l'app iOS, caméra arrière : le suivi
 * visuel d'ARKit (caméra affichée derrière `stage`, position et orientation calées sur la Terre) ;
 * ailleurs, ou s'il manque, la caméra web, le GPS filtré et la boussole, comme avant.
 * `calibrateFocal` : mesurer la focale de la caméra web en tournant (accueil, chasse).
 */
export function useViewfinder({
  stage,
  facing = 'environment',
  calibrateFocal = false,
}: {
  stage: RefObject<HTMLElement | null>
  facing?: CameraFacing
  calibrateFocal?: boolean
}): Viewfinder {
  const wanted = facing === 'environment'
  const { state: arState, view } = useArTracking(wanted)
  const arActive = wanted && arState.status === 'running'
  // En route : la caméra web attend (les deux ne peuvent pas tenir l'objectif en même temps).
  const arPending = wanted && (arState.status === 'checking' || arState.status === 'starting')
  const web = useCamera(!arActive && !arPending, facing)
  const geo = useGeolocation()
  const sensors = useOrientation()
  const webPosition = useLivePosition(geo.track, sensors.absolute ? sensors.basis : null)
  const { focal35: webFocal35 } = useCameraFocal()
  useFocalCalibration(
    web.videoRef,
    sensors.angles,
    calibrateFocal && wanted && !arActive && web.status === 'ready' && sensors.absolute,
  )
  const arCamera = arActive ? arState.camera : null
  useArCamera(stage, arCamera != null)

  const orientation = useMemo<OrientationState>(
    () =>
      arActive && view.basis
        ? {
            ...sensors,
            basis: view.basis,
            measuredBasis: view.basis,
            measuredAt: view.at,
            angles: view.angles,
            absolute: true,
            status: 'active',
          }
        : sensors,
    [arActive, view, sensors],
  )

  const camera = useMemo<ViewfinderCamera>(() => {
    if (!arActive && !arPending) return web
    return {
      videoRef: web.videoRef,
      status: arCamera ? 'ready' : 'starting',
      error: null,
      size: arCamera && { width: arCamera.width, height: arCamera.height },
      capture: captureArPhoto,
    }
  }, [arActive, arPending, arCamera, web])

  return {
    camera,
    geo,
    orientation,
    position: arActive && view.fix ? view.fix : webPosition,
    focal35: arCamera ? focal35Of(arCamera.focal, arCamera.width, arCamera.height) : webFocal35,
    ar: { active: arActive, state: arState },
  }
}
