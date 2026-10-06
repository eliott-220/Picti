import { createContext, useContext } from 'react'
import type { GeoPoint } from '../geo/geodesy'
import type { PhotoDraft } from './pipeline'
import type {
  AppNotification,
  Capture,
  Friendship,
  GeoPhoto,
  Liker,
  MyLike,
  PersonResult,
  Profile,
  ProfileChanges,
  Visibility,
} from './types'

export interface Store {
  userId: string
  /** Chargement initial terminé. */
  ready: boolean
  error: string | null
  profile: Profile | null
  /** Toutes les photos connues (les miennes et celles des autres), récentes d'abord. */
  photos: GeoPhoto[]
  /** Mes photos, récentes d'abord. */
  myPhotos: GeoPhoto[]
  /** Dernière recherche à proximité : identifiant de photo → distance (m). */
  nearby: Map<string, number>
  /** Photos que j'ai capturées in situ. */
  captures: Capture[]
  /** Captures de mes photos par d'autres utilisateurs (mes chasseurs). */
  hunters: Capture[]
  friends: Friendship[]
  /** Mes likes : identifiant de photo → like (sur place ou non). */
  likes: ReadonlyMap<string, MyLike>
  /** Nombre de likes des photos hors du store (carte), après mes likes. */
  likeCounts: ReadonlyMap<string, number>
  /** Mes notifications (likes et captures de mes photos), les plus récentes d'abord. */
  notifications: AppNotification[]
  isMine(photo: GeoPhoto): boolean
  loadPhoto(id: string): Promise<GeoPhoto | null>
  refreshNearby(position: GeoPoint): Promise<void>
  /** Charge toutes les photos (visibles) d'un lieu, autour de cette position. */
  loadSpot(position: GeoPoint): Promise<void>
  /** Versions (reproductions) visibles d'une photo. */
  loadVersions(photoId: string): Promise<GeoPhoto[]>
  /**
   * Publie une photo. `visibility` : sans elle, celle choisie par défaut dans le profil.
   * `versionOf` : photo à reproduire (bouton « Reproduire »), `null` pour ne rattacher à rien ;
   * sans lui, la photo de la même vue choisie par `chooseParent`.
   */
  addPhoto(
    draft: PhotoDraft,
    images: { full: Blob; thumb: Blob },
    options?: { visibility?: Visibility; versionOf?: string | null },
  ): Promise<GeoPhoto>
  updatePhoto(photo: GeoPhoto): Promise<void>
  removePhoto(id: string): Promise<void>
  addCapture(photoId: string, score: number): Promise<void>
  saveProfile(changes: ProfileChanges): Promise<void>
  /** Envoie une demande d'ami (ou accepte la sienne) ; renvoie un message à afficher. */
  addFriend(code: string): Promise<string>
  /** Même chose depuis la recherche par nom ou un lien d'invitation. */
  requestFriend(other: { id: string; name: string }): Promise<string>
  /** Compte correspondant à un code ami (lien d'invitation), ou null. */
  findByFriendCode(code: string): Promise<PersonResult | null>
  /** Recherche d'amis par nom (3 lettres au moins) : ni moi, ni mes amis. */
  searchPeople(query: string): Promise<PersonResult[]>
  acceptFriend(userId: string): Promise<void>
  removeFriend(userId: string): Promise<void>
  /** Passe le compte en Premium avec un code (seconde option de paiement). */
  redeemPremiumCode(code: string): Promise<{ ok: boolean; message: string }>
  /** Like / unlike (pas sa propre photo, pas le like d'une capture). */
  toggleLike(photo: { id: string; owner: string; likesCount: number }): Promise<void>
  /** Qui a aimé ma photo. */
  fetchLikers(photoId: string): Promise<Liker[]>
  reloadNotifications(): Promise<void>
  markNotificationsRead(ids: string[]): Promise<void>
}

export const StoreContext = createContext<Store | null>(null)

export function useStore(): Store {
  const s = useContext(StoreContext)
  if (!s) throw new Error('useStore doit être utilisé dans <StoreProvider>')
  return s
}
