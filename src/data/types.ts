import type { GeoPoint } from '../geo/geodesy'
import type { CameraAngles } from '../geo/orientation'

/**
 * - `direct` : photo prise dans PICTI, géocadrée à la volée ;
 * - `differe-auto` : photo importée, géocadrée grâce à ses données EXIF ;
 * - `differe-manuel` : photo importée, recalée à la main sur le lieu même.
 */
export type GeoframeMode = 'direct' | 'differe-auto' | 'differe-manuel'

/** Position et orientation exactes de l'objectif au moment de la prise de vue. */
export interface Geoframe extends CameraAngles {
  position: GeoPoint
  /** Précision de la position (m), si connue. */
  accuracy: number | null
  /** Origine du cap : boussole du téléphone ou EXIF (GPSImgDirection). */
  headingSource: 'boussole' | 'exif'
  /** L'inclinaison n'est pas connue (EXIF) : on la suppose horizontale. */
  pitchAssumed?: boolean
}

export interface GeoPhoto {
  id: string
  title: string
  /** Date d'ajout dans PICTI. */
  addedAt: number
  /** Date de prise de vue, si connue. */
  takenAt: number | null
  width: number
  height: number
  /** Focale équivalente 24×36. */
  focal35: number
  /** Distance supposée du sujet (m), utilisée pour la parallaxe. */
  depth: number
  /** null tant que la photo n'est pas géocadrée. */
  mode: GeoframeMode | null
  geoframe: Geoframe | null
  /** Position approximative connue avant géocadrage (EXIF sans direction). */
  hintPosition: GeoPoint | null
}

/** Une photo retrouvée in situ lors d'une chasse. */
export interface Capture {
  id: string
  photoId: string
  capturedAt: number
  /** Qualité de l'alignement au moment de la capture (0 à 1). */
  score: number
}

export interface Profile {
  name: string
  city: string
}

export const DEFAULT_DEPTH = 6

export const isGeoframed = (p: GeoPhoto): p is GeoPhoto & { geoframe: Geoframe; mode: GeoframeMode } =>
  p.geoframe != null && p.mode != null

export const MODE_LABEL: Record<GeoframeMode, string> = {
  direct: 'Géocadrée en direct',
  'differe-auto': 'Géocadrée en différé (EXIF)',
  'differe-manuel': 'Géocadrée en différé (sur place)',
}

export function formatDate(ts: number | null | undefined): string {
  if (ts == null) return 'Date inconnue'
  return new Date(ts).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })
}

/** Date de prise de vue à afficher sous le titre (sauf si le titre est déjà cette date). */
export function photoDate(p: GeoPhoto): string | null {
  const d = formatDate(p.takenAt ?? p.addedAt)
  return d === p.title ? null : d
}

export function newId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
}
