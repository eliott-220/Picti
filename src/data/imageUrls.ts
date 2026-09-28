import { useEffect, useState } from 'react'
import * as db from './db'

// --- URLs d'images (object URLs mises en cache) ---------------------------

type ImageKind = 'thumb' | 'full'
const urlCache = new Map<string, Promise<string | null>>()

export function forgetImageUrls(id: string) {
  for (const kind of ['thumb', 'full'] as const) {
    const key = `${id}:${kind}`
    urlCache.get(key)?.then((u) => u && URL.revokeObjectURL(u))
    urlCache.delete(key)
  }
}

function imageUrl(id: string, kind: ImageKind): Promise<string | null> {
  const key = `${id}:${kind}`
  let p = urlCache.get(key)
  if (!p) {
    p = db
      .getImages(id)
      .then((img) => (img ? URL.createObjectURL(img[kind]) : null))
      .catch(() => null)
    urlCache.set(key, p)
  }
  return p
}

export function useImageUrl(id: string | null | undefined, kind: ImageKind = 'thumb'): string | null {
  const [url, setUrl] = useState<{ key: string; url: string | null } | null>(null)
  const key = id ? `${id}:${kind}` : null
  useEffect(() => {
    if (!id || !key) return
    let alive = true
    imageUrl(id, kind).then((u) => alive && setUrl({ key, url: u }))
    return () => {
      alive = false
    }
  }, [id, kind, key])
  return url && url.key === key ? url.url : null
}
