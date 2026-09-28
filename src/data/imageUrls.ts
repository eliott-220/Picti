// URLs d'affichage des images : URLs signées (bucket privé), mises en cache.

import { useEffect, useState } from 'react'
import { PHOTO_BUCKET, supabase } from './supabase'
import type { GeoPhoto } from './types'

type ImageKind = 'thumb' | 'full'

/** Durée de validité des URLs signées (s). */
const TTL = 3600

const paths = new Map<string, { full: string; thumb: string }>()
const cache = new Map<string, { url: Promise<string | null>; expires: number }>()
// Adresses déjà obtenues : une image revue s'affiche dès le premier rendu (pas de clignement).
const resolved = new Map<string, string>()
const listeners = new Set<() => void>()

/** Mémorise les chemins d'images des photos connues du store. */
export function registerImagePaths(photos: GeoPhoto[]) {
  let changed = false
  for (const p of photos) {
    const known = paths.get(p.id)
    if (!known || !known.full) changed = true
    paths.set(p.id, { full: p.imagePath, thumb: p.thumbPath })
  }
  if (changed) listeners.forEach((l) => l())
}

/** Mémorise seulement les vignettes (photos affichées sur la carte). */
export function registerThumbs(items: { id: string; thumbPath: string }[]) {
  let changed = false
  for (const it of items) {
    if (paths.has(it.id)) continue
    // Le chemin de l'image complète est inconnu tant que la photo n'est pas chargée.
    paths.set(it.id, { full: '', thumb: it.thumbPath })
    changed = true
  }
  if (changed) listeners.forEach((l) => l())
}

/** Affiche tout de suite une image qui vient d'être prise, sans la retélécharger. */
export function primeImage(path: string, blob: Blob) {
  const url = URL.createObjectURL(blob)
  cache.set(path, { url: Promise.resolve(url), expires: Infinity })
  resolved.set(path, url)
}

function knownUrl(path: string): string | null {
  const hit = cache.get(path)
  return hit && hit.expires > Date.now() ? (resolved.get(path) ?? null) : null
}

export function forgetImage(path: string) {
  cache.delete(path)
  resolved.delete(path)
}

// Les demandes d'un même instant sont regroupées en une seule requête.
let pending: { path: string; resolve: (url: string | null) => void }[] = []
let flushTimer: ReturnType<typeof setTimeout> | null = null

function flush() {
  const batch = pending
  pending = []
  flushTimer = null
  supabase.storage
    .from(PHOTO_BUCKET)
    .createSignedUrls(
      batch.map((b) => b.path),
      TTL,
    )
    .then(({ data }) => {
      const byPath = new Map((data ?? []).map((d) => [d.path, d.signedUrl]))
      batch.forEach((b) => b.resolve(byPath.get(b.path) ?? null))
    })
    .catch(() => batch.forEach((b) => b.resolve(null)))
}

function signedUrl(path: string): Promise<string | null> {
  const hit = cache.get(path)
  if (hit && hit.expires > Date.now()) return hit.url
  const url = new Promise<string | null>((resolve) => {
    pending.push({ path, resolve })
    flushTimer ??= setTimeout(flush, 20)
  })
  cache.set(path, { url, expires: Date.now() + (TTL - 300) * 1000 })
  resolved.delete(path)
  void url.then((u) => {
    if (u) resolved.set(path, u)
  })
  return url
}

export function useImageUrl(id: string | null | undefined, kind: ImageKind = 'thumb'): string | null {
  const [, setVersion] = useState(0)
  const [state, setState] = useState<{ path: string; url: string | null } | null>(null)
  const path = (id ? paths.get(id)?.[kind] : undefined) || undefined

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

  if (state && state.path === path) return state.url
  return path ? knownUrl(path) : null
}
