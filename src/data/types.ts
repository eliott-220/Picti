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

/** Ordre d'affichage (et de défilement de la pastille du viseur). */
export const VISIBILITIES: Visibility[] = ['public', 'amis', 'prive']

export const VISIBILITY_LABEL: Record<Visibility, string> = {
  public: 'Publique',
  amis: 'Amis uniquement',
  prive: 'Privée',
}

/** Libellé court de la pastille du viseur. */
export const VISIBILITY_SHORT: Record<Visibility, string> = {
  public: 'Public',
  amis: 'Amis',
  prive: 'Privé',
}

/** Réglage du profil : « Mes nouvelles photos sont visibles par… ». */
export const VISIBILITY_AUDIENCE: Record<Visibility, string> = {
  public: 'Tout le monde',
  amis: 'Mes amis',
  prive: 'Moi seul',
}

/** « Photo géocadrée · visible par vos amis ». */
export const VISIBLE_BY: Record<Visibility, string> = {
  public: 'tout le monde',
  amis: 'vos amis',
  prive: 'vous seul',
}

/** Qui peut découvrir la photo (ou, au pluriel, les nouvelles photos) sur place. */
export function visibilityHelp(v: Visibility, { plural = false } = {}): string {
  const them = plural ? 'les' : 'la'
  switch (v) {
    case 'public':
      return `Tous les utilisateurs de PICTI qui passent sur place peuvent ${them} découvrir.`
    case 'amis':
      return `Seuls vos amis peuvent ${them} découvrir sur place.`
    case 'prive':
      return `Vous seul pouvez ${them} voir.`
  }
}

/** Valeur suivante de la pastille du viseur (un appui fait défiler les trois). */
export function nextVisibility(v: Visibility): Visibility {
  return VISIBILITIES[(VISIBILITIES.indexOf(v) + 1) % VISIBILITIES.length]
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
  /** Nombre de likes (tenu par la base). */
  likesCount: number
  /**
   * Version (reproduction) : la photo parente, celle que l'auteur a voulu reproduire ou la
   * photo de la même vue choisie à l'enregistrement (`chooseParent`). Null sinon.
   */
  versionOf: string | null
  /** Nombre de versions de cette photo (tenu par la base). */
  versionsCount: number
}

/** Mon like sur une photo : `onSite` = donné par une capture (« aimée sur place »). */
export interface MyLike {
  onSite: boolean
}

/** Un like vu par l'auteur de la photo (« Aimée par … »). */
export interface Liker {
  userId: string
  name: string
  onSite: boolean
  likedAt: number
}

export type NotificationKind = 'like' | 'capture'

export interface AppNotification {
  id: string
  kind: NotificationKind
  photoId: string
  /** Vignette de la photo (stockage). */
  thumbPath: string | null
  actorId: string
  actorName: string
  createdAt: number
  read: boolean
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
  /** Visibilité de mes nouvelles photos quand je n'en choisis pas d'autre (« amis » par défaut). */
  defaultVisibility: Visibility
}

/** Modifications du profil que l'utilisateur peut faire lui-même (jamais le plan). */
export type ProfileChanges = Partial<Pick<Profile, 'name' | 'city' | 'defaultVisibility'>>

/** Un compte trouvé par la recherche d'amis par nom. */
export interface PersonResult {
  id: string
  name: string
  city: string
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

/**
 * Distance du sujet d'un selfie (m) : l'auteur, à bout de bras. Placée à 6 m comme les
 * autres photos, son visage devenait un portrait géant de plusieurs mètres ; à 0,6 m il
 * flotte à sa taille réelle, là où il se tenait.
 */
export const SELFIE_DEPTH = 0.6

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

/** Heure, ex. « 17:05 ». */
export function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
}

/**
 * Date et heure, ex. « 28 septembre 2026 à 17:05 » ou, en version courte
 * (vignettes, frise), « 28 sept. 2026 · 17:05 ».
 */
export function formatDateTime(ts: number | null | undefined, { short = false } = {}): string {
  if (ts == null) return 'Date inconnue'
  if (!short) return `${formatDate(ts)} à ${formatTime(ts)}`
  const day = new Date(ts).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })
  return `${day} · ${formatTime(ts)}`
}

/**
 * Version courte sans l'année quand c'est l'année en cours, ex. « 28 sept. · 17:05 » :
 * tient dans l'étiquette étroite du viseur sans couper l'heure.
 */
export function formatDayTime(ts: number | null | undefined, now = Date.now()): string {
  if (ts == null) return 'Date inconnue'
  if (new Date(ts).getFullYear() !== new Date(now).getFullYear()) return formatDateTime(ts, { short: true })
  const day = new Date(ts).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })
  return `${day} · ${formatTime(ts)}`
}

/**
 * Date et heure de prise de vue à afficher sous le titre ; seulement
 * l'heure si le titre est déjà cette date.
 */
export function photoDate(p: GeoPhoto): string {
  const ts = p.takenAt ?? p.addedAt
  return formatDate(ts) === p.title ? `à ${formatTime(ts)}` : formatDateTime(ts)
}

/** Titre suivi de la date et de l'heure (sans répéter la date si c'est le titre). */
export function photoTitleAndDate(p: GeoPhoto): string {
  const when = formatDateTime(p.takenAt ?? p.addedAt)
  return formatDate(p.takenAt ?? p.addedAt) === p.title || !p.title ? when : `${p.title} · ${when}`
}

/** « de Paul », « d’Alice » : complément du nom avec élision devant une voyelle ou un h. */
export const ofName = (name: string) => (/^[aeiouyàâäéèêëîïôöùûüh]/i.test(name) ? `d’${name}` : `de ${name}`)

/** Identifiant UUID v4 (clé primaire des photos en base). */
export function newId(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  const b = crypto.getRandomValues(new Uint8Array(16))
  b[6] = (b[6] & 0x0f) | 0x40
  b[8] = (b[8] & 0x3f) | 0x80
  const h = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('')
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`
}
