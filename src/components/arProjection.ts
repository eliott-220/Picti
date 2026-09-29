// Projection d'une photo géocadrée dans la vue caméra de l'écran.

import { viewerEye } from '../geo/alignment'
import { distanceMeters, type GeoFix } from '../geo/geodesy'
import type { Vec3 } from '../geo/math'
import { coverViewport, DEFAULT_PHONE_FOCAL35, focalPx, type ViewportCamera } from '../geo/optics'
import { basisFromAngles, type CameraBasis } from '../geo/orientation'
import {
  facesViewer,
  photoPlaneCorners,
  projectPhoto,
  quadTransform,
  type PhotoProjection,
  type Quad,
} from '../geo/projection'
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
  /** On voit la photo de face (on ne l'a pas dépassée). */
  facing: boolean
  projection: PhotoProjection
  /** Transformation CSS de la photo, null si elle n'est pas visible d'ici. */
  transform: string | null
  /** Distance du centre de la photo projetée au centre de l'écran (px). */
  centerOffset: number
  distance: number | null
}

/**
 * Projette une photo depuis la position du spectateur : elle reste à sa
 * place dans le décor quand il se déplace. Sans position, on le suppose
 * au point de vue. `offset` : recalage au point de vue (chasse).
 */
export function projectGeoPhoto(
  photo: GeoframedPhoto,
  fix: GeoFix | null,
  basis: CameraBasis,
  cam: ViewportCamera,
  offset?: Vec3,
): ArProjection {
  const g = photo.geoframe
  const distance = fix ? distanceMeters(fix, g.position) : null
  const eye: Vec3 = fix ? viewerEye(g.position, fix, offset) : [0, 0, 0]
  const photoBasis = basisFromAngles(g)
  const corners = photoPlaneCorners(photoBasis, photo)
  const facing = facesViewer(photoBasis, photo.depth, eye)
  const raw = projectPhoto(corners, eye, basis, cam)
  const projection = facing ? raw : { ...raw, onScreen: false }
  const visible = facing && projection.inFront
  const transform = visible ? quadTransform(OVERLAY_W, overlayHeight(photo), projection.corners) : null
  const cx = projection.corners.reduce((s, c) => s + c.x, 0) / 4
  const cy = projection.corners.reduce((s, c) => s + c.y, 0) / 4
  const centerOffset = visible ? Math.hypot(cx - cam.width / 2, cy - cam.height / 2) : Infinity
  return { corners, eye, facing, projection, transform, centerOffset, distance }
}

export const overlayHeight = (photo: GeoPhoto) => (OVERLAY_W * photo.height) / photo.width
