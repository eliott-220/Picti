// « La photo la plus proche » (0.22.0) : fin du tutoriel, avec ou sans compte. Fonction SQL
// `nearest_public_photo` (security definer, appelable sans compte) : distance arrondie à 10 m et
// direction au huitième de tour d'une photo publique à moins de 5 km ; connecté, aussi son
// identifiant et sa vignette (« Y aller »). Voir `supabase/migrations/20261012160000_photo_la_plus_proche.sql`.

import { formatDistance } from '../geo/geodesy'
import { normalizeDeg } from '../geo/math'
import { supabase } from './supabase'

/** Rayon de recherche (m), celui de la fonction SQL. */
export const NEAREST_RADIUS = 5000

export interface NearestPhoto {
  /** Distance (m), arrondie à 10 m. */
  distance: number
  /** Direction depuis l'utilisateur (°, depuis le nord). */
  bearing: number
  /** Connecté seulement : la photo (pour y aller) et sa vignette. */
  id: string | null
  thumbPath: string | null
}

const DIRECTIONS = ['au nord', 'au nord-est', 'à l’est', 'au sud-est', 'au sud', 'au sud-ouest', 'à l’ouest', 'au nord-ouest']

/** Direction lisible (rose à 8 directions) : « au nord-est », « à l’ouest ». */
export function directionText(bearing: number): string {
  return DIRECTIONS[Math.round(normalizeDeg(bearing) / 45) % 8]
}

/** « 240 m au nord-est », « 1,2 km au sud ». */
export function nearestText(photo: Pick<NearestPhoto, 'distance' | 'bearing'>): string {
  return `${formatDistance(photo.distance)} ${directionText(photo.bearing)}`
}

/** Ligne renvoyée par la fonction SQL → photo la plus proche (null : rien à moins de 5 km). */
export function nearestFromRow(row: unknown): NearestPhoto | null {
  const r = row as { distance_m?: unknown; bearing_deg?: unknown; photo_id?: unknown; thumb_path?: unknown } | null
  if (!r || typeof r.distance_m !== 'number' || typeof r.bearing_deg !== 'number') return null
  return {
    distance: r.distance_m,
    bearing: r.bearing_deg,
    id: typeof r.photo_id === 'string' ? r.photo_id : null,
    thumbPath: typeof r.thumb_path === 'string' ? r.thumb_path : null,
  }
}

/**
 * Photo publique la plus proche de (lat, lng) ; null s'il n'y en a pas à moins de 5 km. Lève une
 * erreur si la base ne répond pas (ou n'a pas encore la fonction) : l'écran se rabat alors sur
 * « Crée ton compte pour voir les photos autour de toi ».
 */
export async function fetchNearestPublicPhoto(lat: number, lng: number): Promise<NearestPhoto | null> {
  const { data, error } = await supabase.rpc('nearest_public_photo', { p_lat: lat, p_lng: lng })
  if (error) throw new Error(error.message)
  return nearestFromRow(Array.isArray(data) ? data[0] : data)
}
