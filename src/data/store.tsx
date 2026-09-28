import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import * as db from './db'
import { forgetImageUrls } from './imageUrls'
import { StoreContext, type Store } from './storeContext'
import { newId, type Capture, type GeoPhoto, type Profile } from './types'

const PROFILE_KEY = 'picti.profile'

function loadProfile(): Profile | null {
  try {
    const raw = localStorage.getItem(PROFILE_KEY)
    return raw ? (JSON.parse(raw) as Profile) : null
  } catch {
    return null
  }
}

const byNewest = <T,>(key: (x: T) => number) => (a: T, b: T) => key(b) - key(a)

export function StoreProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [photos, setPhotos] = useState<GeoPhoto[]>([])
  const [captures, setCaptures] = useState<Capture[]>([])
  const [profile, setProfile] = useState<Profile | null>(loadProfile)

  useEffect(() => {
    Promise.all([db.listPhotos(), db.listCaptures()])
      .then(([p, c]) => {
        setPhotos(p.sort(byNewest((x) => x.addedAt)))
        setCaptures(c.sort(byNewest((x) => x.capturedAt)))
      })
      .catch((e: unknown) => setError(`Stockage local indisponible : ${String(e)}`))
      .finally(() => setReady(true))
  }, [])

  const addPhoto = useCallback(async (photo: GeoPhoto, images: { full: Blob; thumb: Blob }) => {
    await db.putPhoto(photo, { id: photo.id, ...images })
    setPhotos((prev) => [photo, ...prev.filter((p) => p.id !== photo.id)])
  }, [])

  const updatePhoto = useCallback(async (photo: GeoPhoto) => {
    await db.putPhoto(photo)
    setPhotos((prev) => prev.map((p) => (p.id === photo.id ? photo : p)))
  }, [])

  const removePhoto = useCallback(async (id: string) => {
    await db.deletePhoto(id)
    forgetImageUrls(id)
    setPhotos((prev) => prev.filter((p) => p.id !== id))
    setCaptures((prev) => prev.filter((c) => c.photoId !== id))
  }, [])

  const addCapture = useCallback(async (photoId: string, score: number) => {
    const capture: Capture = { id: newId(), photoId, capturedAt: Date.now(), score }
    await db.putCapture(capture)
    setCaptures((prev) => [capture, ...prev])
    return capture
  }, [])

  const saveProfile = useCallback((p: Profile) => {
    try {
      localStorage.setItem(PROFILE_KEY, JSON.stringify(p))
    } catch {
      // Stockage indisponible (navigation privée) : le profil vit le temps de la session.
    }
    setProfile(p)
  }, [])

  const value = useMemo<Store>(
    () => ({ ready, error, photos, captures, profile, addPhoto, updatePhoto, removePhoto, addCapture, saveProfile }),
    [ready, error, photos, captures, profile, addPhoto, updatePhoto, removePhoto, addCapture, saveProfile],
  )
  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>
}
