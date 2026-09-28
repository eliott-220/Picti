import { createContext, useContext } from 'react'
import type { Capture, GeoPhoto, Profile } from './types'

export interface Store {
  ready: boolean
  error: string | null
  /** Photos, de la plus récente à la plus ancienne. */
  photos: GeoPhoto[]
  captures: Capture[]
  profile: Profile | null
  addPhoto(photo: GeoPhoto, images: { full: Blob; thumb: Blob }): Promise<void>
  updatePhoto(photo: GeoPhoto): Promise<void>
  removePhoto(id: string): Promise<void>
  addCapture(photoId: string, score: number): Promise<Capture>
  saveProfile(profile: Profile): void
}

export const StoreContext = createContext<Store | null>(null)

export function useStore(): Store {
  const s = useContext(StoreContext)
  if (!s) throw new Error('useStore doit être utilisé dans <StoreProvider>')
  return s
}
