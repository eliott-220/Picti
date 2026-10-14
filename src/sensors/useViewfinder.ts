import { useMemo, type RefObject } from 'react'
import { useScreenActive } from '../screenStack'
import type { EncodedImage } from '../data/images'
import { focal35Of } from '../geo/arPose'
import type { GeoFix } from '../geo/geodesy'
import { focalAtZoom, zoomPlan, type ZoomRange, type ZoomRoute } from '../geo/zoom'
import type { NativeArPose } from '../native'
import { arLeavesCamera, captureArPhoto, useArCamera, useArState, useArTracking, type ArState } from './arTracking'
import { useCameraFocal } from './cameraFocal'
import { useCamera, useCameraZoomRange, type CameraFacing, type CameraStatus } from './useCamera'
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
  /** Image affichée (recadrée comme à l'écran quand le zoom est numérique). */
  capture(): Promise<ViewfinderFrame>
}

/** Zoom du viseur (0.22.1) : voir `geo/zoom.ts`. */
export interface ViewfinderZoom {
  /** Zoom de l'image affichée, et de la photo prise. */
  value: number
  range: ZoomRange
  /** Repères des boutons (0,5 · 1 · 2 · 5) ; un seul : la caméra ne zoome pas. */
  presets: number[]
  /** Caméra qui sert : ARKit (zoom numérique) ou caméra web. */
  route: ZoomRoute
  /** Agrandissement à appliquer à la vidéo web (zoom numérique), 1 sinon. */
  videoScale: number
  /** Focale équivalente de cette caméra à 1 (Reproduire en part pour retrouver un cadrage). */
  baseFocal35: number
  /**
   * Zoom où l'on change de caméra (app iOS : 1, ARKit au-dessus, caméra web du grand angle en dessous) ;
   * null si une seule caméra sert. Le glissement d'un bouton à l'autre ne le traverse pas : il saute.
   */
  switchAt: number | null
}

export interface Viewfinder {
  camera: ViewfinderCamera
  geo: GeolocationState
  /** Orientation de la caméra : celle du suivi visuel quand son cap est calé, sinon celle des capteurs. */
  orientation: OrientationState
  /** Position du spectateur : celle du suivi visuel calé, sinon le GPS suivi image par image. */
  position: GeoFix | null
  /** Focale équivalente de l'image affichée (zoom compris). */
  focal35: number
  zoom: ViewfinderZoom
  /**
   * Suivi visuel (app iOS) : caméra d'iOS et poses ARKit ; `active` : c'est lui qui sert ;
   * `oriented` : l'orientation (et la position) viennent bien de lui (cap calé, pas en véhicule).
   */
  ar: { active: boolean; oriented: boolean; state: ArState }
}

/**
 * Capteurs d'un écran caméra (accueil, chasse, recalage). Dans l'app iOS, caméra arrière : le suivi
 * visuel d'ARKit (caméra affichée derrière `stage`, position et orientation calées sur la Terre) ;
 * ailleurs, ou s'il manque, la caméra web, le GPS filtré et la boussole, comme avant.
 * `calibrateFocal` : mesurer la focale de la caméra web en tournant (accueil, chasse) ; `locate` :
 * suivre la position (faux pour le tutoriel, qui ne la demande qu'à la fin) ; `active` faux : viseur
 * recouvert par la carte ou le profil (0.23.0) — caméra web rendue (gardée 15 s), caméra d'ARKit
 * cachée et session gardée 15 s : revenu avant, l'image et le calage reviennent aussitôt.
 * `zoom` : zoom demandé (accueil seulement) ; sous 1 (grand angle), la caméra web remplace ARKit, qui
 * ne filme qu'avec l'objectif principal. `lockZoom` : pendant un pincement, on ne change pas de caméra.
 */
export function useViewfinder({
  stage,
  facing = 'environment',
  calibrateFocal = false,
  locate = true,
  active = true,
  zoom = 1,
  lockZoom = null,
}: {
  stage: RefObject<HTMLElement | null>
  facing?: CameraFacing
  calibrateFocal?: boolean
  locate?: boolean
  active?: boolean
  zoom?: number
  lockZoom?: ZoomRoute | null
}): Viewfinder {
  // Écran caché sous un autre de la pile (0.23.1) : comme recouvert.
  const screenActive = useScreenActive()
  active = active && screenActive
  const back = facing === 'environment'
  // Le suivi visuel peut-il servir (app iOS, appareil avec ARKit, réglage activé) ? Alors le zoom passe
  // par lui à partir de 1, et par la caméra web en dessous.
  const arNow = useArState()
  const arUsable = back && !arLeavesCamera(arNow.status)
  const hardware = useCameraZoomRange(facing)
  const plan = zoomPlan({
    requested: back ? zoom : 1,
    ar: arUsable ? { lenses: arNow.lenses } : null,
    hardware,
    lock: back ? lockZoom : null,
  })
  const wanted = back && (!arUsable || plan.route === 'ar')
  const { state: arState, view } = useArTracking(wanted, active)
  const arActive = wanted && arState.status === 'running'
  // En route, ou sur le point de l'être (premier affichage) : la caméra web attend que le suivi ait
  // renoncé. Les deux ne peuvent pas tenir l'objectif en même temps : ouverte un instant, elle laissait
  // ARKit sans image (caméra arrière noire, selfie normal).
  const arPending = wanted && !arActive && !arLeavesCamera(arState.status)
  const web = useCamera(active && !arActive && !arPending, facing, plan.hardware)
  const geo = useGeolocation(locate)
  const sensors = useOrientation()
  const webPosition = useLivePosition(geo.track, sensors.absolute ? sensors.basis : null)
  const { focal35: webWide, ultraWide: webUltraWide } = useCameraFocal()
  // Focale mesurée en tournant : objectif principal (zoom 1) ou ultra grand-angle (0,5), jamais entre deux.
  const lens = Math.abs(web.zoom - 1) < 0.01 ? 'wide' : Math.abs(web.zoom - 0.5) < 0.01 ? 'ultraWide' : null
  useFocalCalibration(
    web.videoRef,
    sensors.angles,
    active && calibrateFocal && back && !arActive && web.status === 'ready' && sensors.absolute && lens != null,
    lens ?? 'wide',
  )
  const arCamera = arActive ? arState.camera : null
  const arZoom = arCamera && plan.route === 'ar' ? plan.digital : 1
  useArCamera(stage, active && arCamera != null, arZoom)
  // Caméra web : zoom matériel appliqué (`web.zoom`, qui rejoint la demande), complété à l'écran par un
  // agrandissement — le zoom affiché reste juste pendant que la caméra change d'objectif.
  const webScale = back && plan.route === 'web' ? Math.max(1, plan.zoom / web.zoom) : 1

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
    if (!arActive && !arPending) return { ...web, capture: () => web.capture(webScale) }
    return {
      videoRef: web.videoRef,
      status: arCamera ? 'ready' : 'starting',
      error: null,
      size: arCamera && { width: arCamera.width, height: arCamera.height },
      capture: () => captureArPhoto(arZoom),
    }
  }, [arActive, arPending, arCamera, web, webScale, arZoom])

  const arFocal = arCamera ? focal35Of(arCamera.focal, arCamera.width, arCamera.height) : null
  const webFocal = focalAtZoom(web.zoom, { wide: webWide, ultraWide: webUltraWide }) * webScale
  const zoomValue = arCamera ? arZoom : plan.route === 'web' ? web.zoom * webScale : plan.zoom

  return {
    camera,
    geo,
    orientation,
    // Pas encore de relevé GPS calé (précision infinie) : le GPS en attendant — sinon « Position imprécise
    // (±Infinity m) » à la première photo (vu au banc le 13/10, 0.24.0).
    position: arActive && view.fix && Number.isFinite(view.fix.accuracy) ? view.fix : webPosition,
    focal35: arFocal != null ? arFocal * arZoom : webFocal,
    zoom: {
      value: zoomValue,
      range: plan.range,
      presets: back ? plan.presets : [1],
      route: plan.route,
      videoScale: arCamera ? 1 : webScale,
      baseFocal35: arFocal ?? webWide,
      switchAt: arUsable && plan.range.min < 1 ? 1 : null,
    },
    ar: { active: arActive, oriented: arActive && view.basis != null, state: arState },
  }
}
