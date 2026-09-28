// Création des photos PICTI : géocadrage en direct et import (en différé).

import { exifCompleteness, readExif, type ExifCompleteness } from '../geo/exif'
import type { GeoFix } from '../geo/geodesy'
import { DEFAULT_PHONE_FOCAL35 } from '../geo/optics'
import type { CameraAngles } from '../geo/orientation'
import { decodeImage, makeThumbnail, type EncodedImage } from './images'
import { DEFAULT_DEPTH, formatDate, newId, type GeoPhoto } from './types'

export interface NewPhoto {
  photo: GeoPhoto
  images: { full: Blob; thumb: Blob }
}

/** Relevé des capteurs au moment du déclenchement. */
export interface SensorSnapshot {
  fix: GeoFix | null
  angles: CameraAngles | null
  /** La boussole donne un cap absolu (par rapport au nord). */
  absolute: boolean
}

/**
 * Géocadrage en direct : la photo est marquée de la position et de
 * l'orientation exactes du téléphone. Si un capteur manque, elle est
 * conservée « à géocadrer » pour être recalée plus tard, sur place.
 */
export async function createDirectPhoto(
  frame: EncodedImage,
  sensors: SensorSnapshot,
  focal35 = DEFAULT_PHONE_FOCAL35,
): Promise<NewPhoto> {
  const now = Date.now()
  const { fix, angles, absolute } = sensors
  const complete = fix != null && angles != null && absolute
  const photo: GeoPhoto = {
    id: newId(),
    title: formatDate(now),
    addedAt: now,
    takenAt: now,
    width: frame.width,
    height: frame.height,
    focal35,
    depth: DEFAULT_DEPTH,
    mode: complete ? 'direct' : null,
    geoframe: complete
      ? {
          position: { lat: fix.lat, lon: fix.lon, alt: fix.alt ?? null },
          accuracy: fix.accuracy,
          heading: angles.heading,
          pitch: angles.pitch,
          roll: angles.roll,
          headingSource: 'boussole',
        }
      : null,
    hintPosition: fix ? { lat: fix.lat, lon: fix.lon, alt: fix.alt ?? null } : null,
  }
  return { photo, images: { full: frame.blob, thumb: await makeThumbnail(frame.blob) } }
}

export interface ImportResult extends NewPhoto {
  completeness: ExifCompleteness
}

/**
 * Géocadrage en différé : une photo de smartphone contenant position et
 * direction est géocadrée automatiquement ; sinon elle attend d'être
 * recalée sur le lieu de la prise de vue.
 */
export async function importPhotoFile(file: File): Promise<ImportResult> {
  const [exif, bitmap] = await Promise.all([readExif(file), decodeImage(file)])
  try {
    const completeness = exifCompleteness(exif)
    const title = exif.takenAt ? formatDate(exif.takenAt) : file.name.replace(/\.[^.]+$/, '')
    const photo: GeoPhoto = {
      id: newId(),
      title,
      addedAt: Date.now(),
      takenAt: exif.takenAt,
      width: bitmap.width,
      height: bitmap.height,
      focal35: exif.focal35 ?? DEFAULT_PHONE_FOCAL35,
      depth: DEFAULT_DEPTH,
      mode: completeness === 'complet' ? 'differe-auto' : null,
      geoframe:
        completeness === 'complet'
          ? {
              position: exif.position!,
              accuracy: null,
              heading: exif.heading!,
              pitch: 0,
              roll: 0,
              headingSource: 'exif',
              pitchAssumed: true,
            }
          : null,
      hintPosition: exif.position,
    }
    return { photo, images: { full: file, thumb: await makeThumbnail(bitmap) }, completeness }
  } finally {
    bitmap.close()
  }
}
