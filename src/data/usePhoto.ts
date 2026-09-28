import { useEffect, useState } from 'react'
import { useStore } from './storeContext'
import type { GeoPhoto } from './types'

/** Photo par identifiant ; la charge depuis Supabase si elle n'est pas encore connue (lien direct). */
export function usePhoto(id: string): { photo: GeoPhoto | undefined; loading: boolean } {
  const { photos, loadPhoto } = useStore()
  const photo = photos.find((p) => p.id === id)
  const [missing, setMissing] = useState(false)
  useEffect(() => {
    if (photo) return
    let alive = true
    loadPhoto(id).then((p) => alive && !p && setMissing(true))
    return () => {
      alive = false
    }
  }, [id, photo, loadPhoto])
  return { photo, loading: !photo && !missing }
}
