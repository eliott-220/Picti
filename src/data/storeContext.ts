import { createContext, useContext } from 'react'
import type { GeoPoint } from '../geo/geodesy'
import type { PhotoDraft } from './pipeline'
import type { Capture, Friendship, GeoPhoto, PersonResult, Profile, ProfileChanges, Visibility } from './types'

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
  isMine(photo: GeoPhoto): boolean
  loadPhoto(id: string): Promise<GeoPhoto | null>
  refreshNearby(position: GeoPoint): Promise<void>
  /** Sans visibilité : celle choisie par défaut dans le profil. */
  addPhoto(draft: PhotoDraft, images: { full: Blob; thumb: Blob }, visibility?: Visibility): Promise<GeoPhoto>
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
}

export const StoreContext = createContext<Store | null>(null)

export function useStore(): Store {
  const s = useContext(StoreContext)
  if (!s) throw new Error('useStore doit être utilisé dans <StoreProvider>')
  return s
}
