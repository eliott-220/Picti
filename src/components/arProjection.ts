// Projection d'une photo géocadrée dans la vue caméra de l'écran.

import { ALIGN_TOLERANCE, parallaxEye } from '../geo/alignment'
import { distanceMeters, toENU, type GeoFix } from '../geo/geodesy'
import type { Vec3 } from '../geo/math'
import { coverViewport, DEFAULT_PHONE_FOCAL35, focalPx, type ViewportCamera } from '../geo/optics'
import { basisFromAngles, type CameraBasis } from '../geo/orientation'
import { photoPlaneCorners, projectPhoto, quadTransform, type PhotoProjection, type Quad } from '../geo/projection'
import type { Geoframe, GeoPhoto } from '../data/types'

/** Largeur de rendu de la photo superposée (px CSS, avant transformation). */
export const OVERLAY_W = 1000

export type GeoframedPhoto = GeoPhoto & { geoframe: Geoframe }

/** Date de référence d'une photo : prise de vue, à défaut ajout. */
export const photoTime = (p: GeoPhoto) => p.takenAt ?? p.addedAt

/** Caméra de l'écran : le flux vidéo couvre la scène (object-fit: cover). */
export function viewportCamera(
  stage: { width: number; height: number },
  cameraSize: { width: number; height: number } | null,
): ViewportCamera | null {
  if (!stage.width) return null
  return cameraSize
    ? coverViewport(cameraSize.width, cameraSize.height, stage.width, stage.height, DEFAULT_PHONE_FOCAL35)
    : { width: stage.width, height: stage.height, focal: focalPx(DEFAULT_PHONE_FOCAL35, stage.width, stage.height) }
}

export interface ArProjection {
  /** Coins du plan-photo (repère ENU centré sur le point de vue). */
  corners: Quad<Vec3>
  /** Position de l'œil utilisée (repère ENU centré sur le point de vue). */
  eye: Vec3
  projection: PhotoProjection
  /** Transformation CSS de la photo, null si elle est derrière la caméra. */
  transform: string | null
  /** Distance du centre de la photo projetée au centre de l'écran (px). */
  centerOffset: number
  distance: number | null
}

export function projectGeoPhoto(
  photo: GeoframedPhoto,
  fix: GeoFix | null,
  basis: CameraBasis,
  cam: ViewportCamera,
): ArProjection {
  const g = photo.geoframe
  const radius = Math.max(ALIGN_TOLERANCE.radius, fix?.accuracy ?? 0)
  const distance = fix ? distanceMeters(fix, g.position) : null
  const eyeRaw: Vec3 = fix ? toENU(g.position, fix) : [0, 0, 0]
  const eye = distance != null ? parallaxEye(eyeRaw, distance, radius) : eyeRaw
  const corners = photoPlaneCorners(basisFromAngles(g), photo)
  const projection = projectPhoto(corners, eye, basis, cam)
  const transform = projection.inFront ? quadTransform(OVERLAY_W, overlayHeight(photo), projection.corners) : null
  const cx = projection.corners.reduce((s, c) => s + c.x, 0) / 4
  const cy = projection.corners.reduce((s, c) => s + c.y, 0) / 4
  const centerOffset = projection.inFront ? Math.hypot(cx - cam.width / 2, cy - cam.height / 2) : Infinity
  return { corners, eye, projection, transform, centerOffset, distance }
}

export const overlayHeight = (photo: GeoPhoto) => (OVERLAY_W * photo.height) / photo.width

