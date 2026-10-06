// Création des photos PICTI : géocadrage en direct et import (en différé).

import { exifCompleteness, readExif, type ExifCompleteness } from '../geo/exif'
import type { GeoFix } from '../geo/geodesy'
import { DEFAULT_PHONE_FOCAL35 } from '../geo/optics'
import type { CameraAngles } from '../geo/orientation'
import { decodeImage, makeThumbnail, type EncodedImage } from './images'
import { DEFAULT_DEPTH, formatDate, newId, SELFIE_DEPTH, type GeoPhoto } from './types'

/**
 * Photo pas encore publiée : l'auteur, les chemins d'images, la visibilité et la photo parente
 * (version) sont fixés à l'envoi ; les compteurs, par la base.
 */
export type PhotoDraft = Omit<
  GeoPhoto,
  'owner' | 'ownerName' | 'visibility' | 'imagePath' | 'thumbPath' | 'likesCount' | 'versionOf' | 'versionsCount'
>

export interface NewPhoto {
  photo: PhotoDraft
  images: { full: Blob; thumb: Blob }
}

/** Relevé des capteurs au moment du déclenchement. */
export interface SensorSnapshot {
  fix: GeoFix | null
  angles: CameraAngles | null
  /** La boussole donne un cap absolu (par rapport au nord). */
  absolute: boolean
}

export interface DirectOptions {
  /** Focale équivalente de la caméra utilisée. */
  focal35?: number
  /** Prise avec la caméra avant : `angles` sont alors ceux de l'objectif avant. */
  selfie?: boolean
}

/**
 * Géocadrage en direct : la photo est marquée de la position et de
 * l'orientation exactes du téléphone. Si un capteur manque, elle est
 * conservée « à géocadrer » pour être recalée plus tard, sur place.
 */
export async function createDirectPhoto(
  frame: EncodedImage,
  sensors: SensorSnapshot,
  { focal35 = DEFAULT_PHONE_FOCAL35, selfie = false }: DirectOptions = {},
): Promise<NewPhoto> {
  const now = Date.now()
  const { fix, angles, absolute } = sensors
  const complete = fix != null && angles != null && absolute
  const photo: PhotoDraft = {
    id: newId(),
    title: formatDate(now),
    addedAt: now,
    takenAt: now,
    width: frame.width,
    height: frame.height,
    focal35,
    depth: selfie ? SELFIE_DEPTH : DEFAULT_DEPTH,
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
    selfie,
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
    const photo: PhotoDraft = {
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
              // Précision notée par l'appareil (GPSHPositioningError), sinon inconnue.
              accuracy: exif.accuracy,
              heading: exif.heading!,
              pitch: 0,
              roll: 0,
              headingSource: 'exif',
              pitchAssumed: true,
            }
          : null,
      hintPosition: exif.position,
      selfie: false,
    }
    return { photo, images: { full: file, thumb: await makeThumbnail(bitmap) }, completeness }
  } finally {
    bitmap.close()
  }
}
