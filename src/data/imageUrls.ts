// URLs d'affichage des images : URLs signées (bucket privé), mises en cache.

import { useEffect, useState } from 'react'
import { PHOTO_BUCKET, supabase } from './supabase'
import type { GeoPhoto } from './types'

type ImageKind = 'thumb' | 'full'

/** Durée de validité des URLs signées (s). */
const TTL = 3600

const paths = new Map<string, { full: string; thumb: string }>()
const cache = new Map<string, { url: Promise<string | null>; expires: number }>()
const listeners = new Set<() => void>()

/** Mémorise les chemins d'images des photos connues du store. */
export function registerImagePaths(photos: GeoPhoto[]) {
  let changed = false
  for (const p of photos) {
    if (!paths.has(p.id)) changed = true
    paths.set(p.id, { full: p.imagePath, thumb: p.thumbPath })
  }
  if (changed) listeners.forEach((l) => l())
}

/** Affiche tout de suite une image qui vient d'être prise, sans la retélécharger. */
export function primeImage(path: string, blob: Blob) {
  cache.set(path, { url: Promise.resolve(URL.createObjectURL(blob)), expires: Infinity })
}

export function forgetImage(path: string) {
  cache.delete(path)
}

function signedUrl(path: string): Promise<string | null> {
  const hit = cache.get(path)
  if (hit && hit.expires > Date.now()) return hit.url
  const url = supabase.storage
    .from(PHOTO_BUCKET)
    .createSignedUrl(path, TTL)
    .then(({ data }) => data?.signedUrl ?? null)
    .catch(() => null)
  cache.set(path, { url, expires: Date.now() + (TTL - 300) * 1000 })
  return url
}

export function useImageUrl(id: string | null | undefined, kind: ImageKind = 'thumb'): string | null {
  const [, setVersion] = useState(0)
  const [state, setState] = useState<{ path: string; url: string | null } | null>(null)
  const path = id ? paths.get(id)?.[kind] : undefined

  // Réagit à l'arrivée tardive des chemins (photo chargée après le rendu).
  useEffect(() => {
    if (path) return
    const onChange = () => setVersion((v) => v + 1)
    listeners.add(onChange)
    return () => {
      listeners.delete(onChange)
    }
  }, [path])

  useEffect(() => {
    if (!path) return
    let alive = true
    signedUrl(path).then((url) => alive && setState({ path, url }))
    return () => {
      alive = false
    }
  }, [path])

  return state && state.path === path ? state.url : null
}
