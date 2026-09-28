// Conversion entre les lignes de la base Supabase et le modèle de l'application.

import type { Capture, GeoPhoto, Profile, Visibility } from './types'

export interface PhotoRow {
  id: string
  owner: string
  title: string
  taken_at: string | null
  created_at: string
  width: number
  height: number
  focal35: number
  depth: number
  mode: GeoPhoto['mode']
  lat: number | null
  lon: number | null
  alt: number | null
  accuracy: number | null
  heading: number | null
  pitch: number | null
  roll: number | null
  heading_source: 'boussole' | 'exif' | null
  pitch_assumed: boolean
  selfie: boolean
  hint_lat: number | null
  hint_lon: number | null
  visibility: Visibility
  image_path: string
  thumb_path: string
  owner_profile?: { name: string } | null
}

/** Colonnes à sélectionner pour construire une photo complète. */
export const PHOTO_SELECT = '*, owner_profile:profiles!photos_owner_fkey(name)'

const ts = (v: string | null) => (v ? Date.parse(v) : null)
const iso = (v: number | null) => (v == null ? null : new Date(v).toISOString())

export function rowToPhoto(r: PhotoRow): GeoPhoto {
  const geoframed =
    r.mode != null && r.lat != null && r.lon != null && r.heading != null && r.pitch != null && r.roll != null
  return {
    id: r.id,
    owner: r.owner,
    ownerName: r.owner_profile?.name ?? '',
    visibility: r.visibility,
    imagePath: r.image_path,
    thumbPath: r.thumb_path,
    title: r.title,
    addedAt: Date.parse(r.created_at),
    takenAt: ts(r.taken_at),
    width: r.width,
    height: r.height,
    focal35: r.focal35,
    depth: r.depth,
    mode: geoframed ? r.mode : null,
    geoframe: geoframed
      ? {
          position: { lat: r.lat!, lon: r.lon!, alt: r.alt },
          accuracy: r.accuracy,
          heading: r.heading!,
          pitch: r.pitch!,
          roll: r.roll!,
          headingSource: r.heading_source ?? 'boussole',
          pitchAssumed: r.pitch_assumed,
        }
      : null,
    hintPosition: r.hint_lat != null && r.hint_lon != null ? { lat: r.hint_lat, lon: r.hint_lon } : null,
    selfie: r.selfie ?? false,
  }
}

/** Ligne à écrire (sans les champs gérés par la base : auteur, date d'ajout). */
export function photoToRow(p: GeoPhoto): Omit<PhotoRow, 'owner' | 'created_at' | 'owner_profile'> {
  const g = p.geoframe
  return {
    id: p.id,
    title: p.title,
    taken_at: iso(p.takenAt),
    width: p.width,
    height: p.height,
    focal35: p.focal35,
    depth: p.depth,
    mode: g ? p.mode : null,
    lat: g?.position.lat ?? null,
    lon: g?.position.lon ?? null,
    alt: g?.position.alt ?? null,
    accuracy: g?.accuracy ?? null,
    heading: g?.heading ?? null,
    pitch: g?.pitch ?? null,
    roll: g?.roll ?? null,
    heading_source: g?.headingSource ?? null,
    pitch_assumed: g?.pitchAssumed ?? false,
    selfie: p.selfie,
    hint_lat: p.hintPosition?.lat ?? null,
    hint_lon: p.hintPosition?.lon ?? null,
    visibility: p.visibility,
    image_path: p.imagePath,
    thumb_path: p.thumbPath,
  }
}

export interface ProfileRow {
  id: string
  name: string
  city: string
  friend_code: string
  plan: 'free' | 'premium'
}

export const rowToProfile = (r: ProfileRow): Profile => ({
  id: r.id,
  name: r.name,
  city: r.city,
  friendCode: r.friend_code,
  plan: r.plan,
})

export interface CaptureRow {
  id: string
  photo_id: string
  hunter: string
  captured_at: string
  score: number
  hunter_profile?: { name: string } | null
}

export const rowToCapture = (r: CaptureRow): Capture => ({
  id: r.id,
  photoId: r.photo_id,
  hunter: r.hunter,
  hunterName: r.hunter_profile?.name ?? '',
  capturedAt: Date.parse(r.captured_at),
  score: r.score,
})

/** Chemins de stockage : un dossier par utilisateur (exigé par les règles d'accès). */
export function storagePaths(userId: string, photoId: string, mime: string) {
  const ext = mime === 'image/png' ? 'png' : mime === 'image/webp' ? 'webp' : mime === 'image/heic' ? 'heic' : 'jpg'
  return { imagePath: `${userId}/${photoId}.${ext}`, thumbPath: `${userId}/${photoId}_vignette.jpg` }
}
