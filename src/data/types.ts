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

/** Qui peut voir la photo (et donc la chasser). */
export type Visibility = 'public' | 'amis' | 'prive'

export const VISIBILITY_LABEL: Record<Visibility, string> = {
  public: 'Publique',
  amis: 'Amis uniquement',
  prive: 'Privée',
}

export interface GeoPhoto {
  id: string
  /** Auteur de la photo. */
  owner: string
  ownerName: string
  visibility: Visibility
  /** Chemins des images dans le stockage Supabase. */
  imagePath: string
  thumbPath: string
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
  /**
   * Selfie pris avec la caméra avant. Le géocadrage est celui de l'objectif
   * avant : on le retrouve en visant, depuis la place du téléphone, l'endroit
   * où se tenait son auteur.
   */
  selfie: boolean
}

/** Une photo retrouvée in situ lors d'une chasse. */
export interface Capture {
  id: string
  photoId: string
  hunter: string
  hunterName: string
  capturedAt: number
  /** Qualité de l'alignement au moment de la capture (0 à 1). */
  score: number
}

export interface Profile {
  id: string
  name: string
  city: string
  /** Code à partager pour être ajouté en ami. */
  friendCode: string
  plan: 'free' | 'premium'
}

/** Lien d'amitié vu depuis l'utilisateur connecté. */
export interface Friendship {
  /** L'autre personne. */
  userId: string
  name: string
  city: string
  status: 'pending' | 'accepted'
  /** La demande vient de moi (en attente de sa réponse). */
  outgoing: boolean
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

/** Identifiant UUID v4 (clé primaire des photos en base). */
export function newId(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  const b = crypto.getRandomValues(new Uint8Array(16))
  b[6] = (b[6] & 0x0f) | 0x40
  b[8] = (b[8] & 0x3f) | 0x80
  const h = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('')
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`
}
