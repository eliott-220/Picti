// Lecture des métadonnées EXIF d'une photo importée : base du
// géocadrage en différé automatique (position GPS, direction de
// l'objectif, focale, date de prise de vue).

import type { GeoPoint } from './geodesy'
import { normalizeDeg } from './math'

export interface ExifGeoframe {
  position: GeoPoint | null
  /** Précision horizontale de la position (EXIF GPSHPositioningError, m), si l'appareil l'a notée. */
  accuracy: number | null
  /** Direction de l'objectif (EXIF GPSImgDirection), en degrés. */
  heading: number | null
  /** Référence du cap : nord vrai (T) ou magnétique (M). */
  headingRef: 'T' | 'M' | null
  focal35: number | null
  takenAt: number | null
}

/**
 * - `complet` : géocadrage automatique possible (position + direction) ;
 * - `position` : la direction manque, elle sera relevée sur place ;
 * - `aucun` : photo d'appareil sans GPS, géocadrage manuel sur place.
 */
export type ExifCompleteness = 'complet' | 'position' | 'aucun'

export function exifCompleteness(g: ExifGeoframe): ExifCompleteness {
  if (!g.position) return 'aucun'
  return g.heading == null ? 'position' : 'complet'
}

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null)

function parseExifDate(v: unknown): number | null {
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v.getTime()
  if (typeof v === 'string') {
    // Format EXIF brut : « 2022:07:12 18:04:33 »
    const m = v.match(/^(\d{4}):(\d{2}):(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/)
    if (m) return new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]).getTime()
    const t = Date.parse(v)
    return Number.isNaN(t) ? null : t
  }
  return null
}

/** Convertit les balises renvoyées par exifr en données de géocadrage. */
export function geoframeFromExif(tags: Record<string, unknown> | null | undefined): ExifGeoframe {
  const t = tags ?? {}
  const lat = num(t.latitude)
  const lon = num(t.longitude)
  const valid = lat != null && lon != null && !(lat === 0 && lon === 0) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180

  let alt = num(t.GPSAltitude)
  const altRef = t.GPSAltitudeRef
  if (alt != null && (altRef === 1 || (typeof altRef === 'string' && /below/i.test(altRef)))) alt = -alt

  const dir = num(t.GPSImgDirection)
  const ref = typeof t.GPSImgDirectionRef === 'string' ? t.GPSImgDirectionRef.trim().toUpperCase()[0] : null

  const focal35 = num(t.FocalLengthIn35mmFormat) ?? num(t.FocalLengthIn35mmFilm)
  // Notée par les iPhone et certains Android ; 0 ou négative n'a pas de sens.
  const accuracy = num(t.GPSHPositioningError)

  return {
    position: valid ? { lat: lat!, lon: lon!, alt } : null,
    accuracy: valid && accuracy != null && accuracy > 0 ? accuracy : null,
    heading: dir != null ? normalizeDeg(dir) : null,
    headingRef: ref === 'T' || ref === 'M' ? ref : null,
    focal35: focal35 && focal35 > 0 ? focal35 : null,
    takenAt: parseExifDate(t.DateTimeOriginal) ?? parseExifDate(t.CreateDate),
  }
}

export async function readExif(file: Blob): Promise<ExifGeoframe> {
  const { default: exifr } = await import('exifr')
  const tags = await exifr.parse(file, { gps: true, exif: true, tiff: true }).catch(() => null)
  return geoframeFromExif(tags as Record<string, unknown> | null)
}
