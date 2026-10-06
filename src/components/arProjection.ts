// Projection d'une photo géocadrée dans la vue caméra de l'écran.

import { viewerEye } from '../geo/alignment'
import { distanceMeters, type GeoFix } from '../geo/geodesy'
import type { Vec3 } from '../geo/math'
import { coverViewport, DEFAULT_PHONE_FOCAL35, focalPx, type ViewportCamera } from '../geo/optics'
import { basisFromAngles, type CameraBasis } from '../geo/orientation'
import {
  displayScale,
  edgeFade,
  facesViewer,
  panelDistance,
  panelProximityFade,
  photoPlaneCorners,
  projectCard,
  quadTransform,
  toCssMatrix3d,
  viewCosine,
  type PhotoProjection,
  type Quad,
} from '../geo/projection'
import type { Geoframe, GeoPhoto } from '../data/types'

/** Largeur de rendu de la photo superposée (px CSS, avant transformation). */
export const OVERLAY_W = 1000

export type GeoframedPhoto = GeoPhoto & { geoframe: Geoframe }

/** Date de référence d'une photo : prise de vue, à défaut ajout. */
export const photoTime = (p: GeoPhoto) => p.takenAt ?? p.addedAt

/**
 * Caméra de l'écran : le flux vidéo couvre la scène (object-fit: cover).
 * `focal35` : focale du flux, mesurée sur le téléphone (`useCameraFocal`).
 */
export function viewportCamera(
  stage: { width: number; height: number },
  cameraSize: { width: number; height: number } | null,
  focal35 = DEFAULT_PHONE_FOCAL35,
): ViewportCamera | null {
  if (!stage.width) return null
  return cameraSize
    ? coverViewport(cameraSize.width, cameraSize.height, stage.width, stage.height, focal35)
    : { width: stage.width, height: stage.height, focal: focalPx(focal35, stage.width, stage.height) }
}

export interface ArProjection {
  /** Coins du plan-photo (repère ENU centré sur le point de vue). */
  corners: Quad<Vec3>
  /** Position de l'œil utilisée (repère ENU centré sur le point de vue). */
  eye: Vec3
  /** On voit la photo de face (on ne l'a pas dépassée) ; sinon de dos, comme sur une vitre. */
  facing: boolean
  /**
   * Opacité : par la tranche (`edgeFade` : 1 de face ou de dos, 0 par la tranche) × à l'approche
   * du plan-photo (`panelProximityFade` : 1 à 2 m et plus, 0 sous 0,5 m).
   */
  fade: number
  /** Flou à l'approche du plan-photo (px à l'écran) : 0 à 2 m et plus. */
  blur: number
  /** Distance au plan-photo (m), voir `panelDistance`. */
  panelDistance: number
  /** Carte à l'écran : coins projetés, réduits si la photo dépasse `CARD_MAX`. */
  projection: PhotoProjection
  /** Réduction de la carte à l'écran (`CARD_MAX`) : 1 si elle tient sans réduction. */
  cardScale: number
  /** Transformation CSS de la photo, null si elle n'est pas visible d'ici. */
  transform: string | null
  /** Distance du centre de la photo projetée au centre de l'écran (px). */
  centerOffset: number
  distance: number | null
}

/**
 * Projette une photo depuis la position du spectateur : elle reste à sa
 * place dans le décor quand il se déplace, et paraît lointaine de loin
 * (`displayScale`). C'est une carte : de près, sa taille à l'écran est
 * plafonnée (`CARD_MAX`), elle ne remplit jamais l'écran. Une fois dépassée,
 * elle reste visible de dos, comme imprimée sur une vitre : l'homographie du
 * plan vu de derrière donne d'elle-même l'image en miroir. Par la tranche, ou
 * à moins de 2 m de son plan, elle s'efface en douceur (`fade`, `blur`).
 * Sans position, on le suppose au point de vue.
 * `offset` : recalage au point de vue (chasse).
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
  const corners = photoPlaneCorners(photoBasis, photo, undefined, displayScale(photoBasis, photo, eye))
  const facing = facesViewer(photoBasis, photo.depth, eye)
  const toPanel = panelDistance(corners, eye)
  const near = panelProximityFade(toPanel)
  const fade = edgeFade(viewCosine(photoBasis, photo.depth, eye)) * near.opacity
  const { scale: cardScale, ...card } = projectCard(corners, eye, basis, cam)
  const visible = fade > 0 && card.inFront
  const projection = visible ? card : { ...card, onScreen: false }
  const transform = visible ? quadTransform(OVERLAY_W, overlayHeight(photo), projection.corners) : null
  const cx = projection.corners.reduce((s, c) => s + c.x, 0) / 4
  const cy = projection.corners.reduce((s, c) => s + c.y, 0) / 4
  const centerOffset = visible ? Math.hypot(cx - cam.width / 2, cy - cam.height / 2) : Infinity
  return {
    corners,
    eye,
    facing,
    fade,
    blur: near.blur,
    panelDistance: toPanel,
    projection,
    cardScale,
    transform,
    centerOffset,
    distance,
  }
}

export const overlayHeight = (photo: GeoPhoto) => (OVERLAY_W * photo.height) / photo.width

/**
 * Transformation CSS de la photo couvrant tout l'écran, centrée (mode « cover » : bords rognés
 * si le format diffère) : la fin de l'agrandissement de la capture.
 */
export function coverTransform(photo: GeoPhoto, cam: { width: number; height: number }): string {
  const h = overlayHeight(photo)
  const s = Math.max(cam.width / OVERLAY_W, cam.height / h)
  return toCssMatrix3d([s, 0, (cam.width - OVERLAY_W * s) / 2, 0, s, (cam.height - h * s) / 2, 0, 0, 1])
}

/** Échelle d'affichage de la photo (px d'écran par px de rendu), le long de son bord haut. */
export function overlayScale(ar: ArProjection): number {
  const [tl, tr] = ar.projection.corners
  return Math.hypot(tr.x - tl.x, tr.y - tl.y) / OVERLAY_W
}
