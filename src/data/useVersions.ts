import { useEffect, useMemo, useState } from 'react'
import { useStore } from './storeContext'
import type { GeoPhoto } from './types'

/** Reproductions déjà chargées pendant cette visite : `<utilisateur>:<photo>`. */
const loaded = new Set<string>()

/**
 * Reproductions directes d'une photo que je peux voir (RLS), pour la frise « Au fil du temps ».
 * Chargées une fois à l'ouverture de la fiche (une requête `version_of = id`), puis lues dans le
 * store comme `usePhoto` : une reproduction que je viens de prendre y apparaît sans recharger.
 * `null` pendant le premier chargement.
 */
export function useVersions(photo: GeoPhoto, enabled = true): { versions: GeoPhoto[] | null; error: boolean } {
  const { userId, photos, loadVersions } = useStore()
  const key = `${userId}:${photo.id}`
  const [state, setState] = useState<{ key: string; error: boolean } | null>(() =>
    loaded.has(key) ? { key, error: false } : null,
  )
  const ready = loaded.has(key) || state?.key === key

  useEffect(() => {
    if (!enabled || loaded.has(key)) return
    let alive = true
    loadVersions(photo.id)
      .then(() => {
        loaded.add(key)
        if (alive) setState({ key, error: false })
      })
      .catch(() => alive && setState({ key, error: true }))
    return () => {
      alive = false
    }
  }, [enabled, key, photo.id, loadVersions])

  const versions = useMemo(() => photos.filter((p) => p.versionOf === photo.id), [photos, photo.id])
  return { versions: ready ? versions : null, error: state?.key === key && state.error }
}
