// Enregistrement d'une photo sur le téléphone (feuille de partage iOS/Android
// → « Enregistrer l'image », sinon téléchargement classique).

import { PHOTO_BUCKET, supabase } from './supabase'
import type { GeoPhoto } from './types'

const slug = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase() || 'photo'

export async function savePhotoToDevice(photo: GeoPhoto): Promise<void> {
  const { data, error } = await supabase.storage.from(PHOTO_BUCKET).download(photo.imagePath)
  if (error || !data) throw new Error('Téléchargement de la photo impossible')
  const ext = photo.imagePath.split('.').pop() || 'jpg'
  const file = new File([data], `picti-${slug(photo.title)}.${ext}`, { type: data.type || 'image/jpeg' })

  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: 'PICTI' })
    } catch (e) {
      // Partage annulé par l'utilisateur : rien à faire.
      if (e instanceof DOMException && e.name === 'AbortError') return
      throw e
    }
    return
  }
  const url = URL.createObjectURL(file)
  const a = document.createElement('a')
  a.href = url
  a.download = file.name
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}
