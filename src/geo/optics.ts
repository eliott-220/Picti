// Optique : relation entre focale, champ de vision et pixels.
//
// On raisonne en « focale équivalente 24×36 » (EXIF FocalLengthIn35mmFilm),
// définie par rapport à la diagonale du plein format : elle permet de
// retrouver le champ de vision de n'importe quelle image, quel que soit
// son format ou sa résolution.

import { DEG } from './math'

/** Diagonale du capteur plein format 24×36, en mm. */
export const FULL_FRAME_DIAGONAL_MM = Math.hypot(36, 24)

/** Focale équivalente typique du module principal d'un smartphone. */
export const DEFAULT_PHONE_FOCAL35 = 26

/** Focale exprimée en pixels pour une image de `width` × `height`. */
export function focalPx(focal35: number, width: number, height: number): number {
  return (focal35 * Math.hypot(width, height)) / FULL_FRAME_DIAGONAL_MM
}

/** Champs de vision horizontal et vertical (degrés). */
export function fieldOfView(focal35: number, width: number, height: number): { h: number; v: number } {
  const f = focalPx(focal35, width, height)
  return {
    h: (2 * Math.atan(width / 2 / f)) / DEG,
    v: (2 * Math.atan(height / 2 / f)) / DEG,
  }
}

/** Caméra virtuelle de l'écran : point principal au centre, focale en px CSS. */
export interface ViewportCamera {
  width: number
  height: number
  focal: number
}

/**
 * Caméra équivalente à un flux vidéo `videoW` × `videoH` affiché en
 * `object-fit: cover` dans une zone de `screenW` × `screenH` px CSS.
 */
export function coverViewport(
  videoW: number,
  videoH: number,
  screenW: number,
  screenH: number,
  focal35: number,
): ViewportCamera {
  const s = Math.max(screenW / videoW, screenH / videoH)
  return { width: screenW, height: screenH, focal: focalPx(focal35, videoW, videoH) * s }
}
