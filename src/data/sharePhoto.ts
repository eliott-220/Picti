// Partager une photo (0.23.0, bouton ⇪ de la fiche) : la feuille de partage du système avec le
// fichier image — WhatsApp, Messages, Instagram, AirDrop… et « Enregistrer l'image » (Photos) qui est
// dedans. Remplace « Enregistrer sur mon téléphone ». Même image (pleine résolution) et mêmes droits.

import { APP_URL } from '../config'
import { isNative } from '../native'
import { PHOTO_BUCKET, supabase } from './supabase'
import type { GeoPhoto } from './types'

/** Texte joint : court, avec le lien du site (jamais la position exacte de la photo). */
export const SHARE_TEXT = `Trouvée sur PICTI ${APP_URL}`

const slug = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase() || 'photo'

/** Nom du fichier partagé : « picti-<titre>.<extension> ». */
export function shareFileName(title: string, imagePath: string): string {
  const ext = imagePath.split('.').pop() || 'jpg'
  return `picti-${slug(title)}.${ext}`
}

/**
 * Comment partager : `native` (app : plugins Share + Filesystem), `web-share` (navigateur qui sait
 * partager des fichiers), sinon `download` (téléchargement du fichier, comme l'ancien bouton).
 */
export function shareRoute(native: boolean, canShareFiles: boolean): 'native' | 'web-share' | 'download' {
  if (native) return 'native'
  return canShareFiles ? 'web-share' : 'download'
}

/** L'utilisateur a refermé la feuille sans rien choisir : rien à signaler. */
export function isShareCancel(e: unknown): boolean {
  if (e instanceof DOMException && e.name === 'AbortError') return true
  const message = e instanceof Error ? e.message : typeof e === 'string' ? e : ''
  return /cancel/i.test(message)
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result).replace(/^data:[^,]*,/, ''))
    reader.onerror = () => reject(reader.error ?? new Error('Lecture de la photo impossible'))
    reader.readAsDataURL(blob)
  })
}

/** Ouvre la feuille de partage avec la photo en pleine résolution ; annulée : rien. */
export async function sharePhoto(photo: GeoPhoto): Promise<void> {
  const { data, error } = await supabase.storage.from(PHOTO_BUCKET).download(photo.imagePath)
  if (error || !data) throw new Error('Téléchargement de la photo impossible')
  const name = shareFileName(photo.title, photo.imagePath)
  const file = new File([data], name, { type: data.type || 'image/jpeg' })
  const route = shareRoute(isNative(), !!navigator.canShare?.({ files: [file] }))
  try {
    if (route === 'native') {
      // Le fichier est écrit dans le cache de l'app, puis donné à la feuille de partage d'iOS / Android.
      const [{ Directory, Filesystem }, { Share }] = await Promise.all([import('@capacitor/filesystem'), import('@capacitor/share')])
      const written = await Filesystem.writeFile({
        path: `partage/${name}`,
        data: await blobToBase64(file),
        directory: Directory.Cache,
        recursive: true,
      })
      try {
        await Share.share({ title: 'PICTI', text: SHARE_TEXT, files: [written.uri], dialogTitle: 'Partager la photo' })
      } finally {
        void Filesystem.deleteFile({ path: `partage/${name}`, directory: Directory.Cache }).catch(() => undefined)
      }
      return
    }
    if (route === 'web-share') {
      await navigator.share({ files: [file], text: SHARE_TEXT, title: 'PICTI' })
      return
    }
  } catch (e) {
    if (isShareCancel(e)) return
    throw e
  }
  const url = URL.createObjectURL(file)
  const a = document.createElement('a')
  a.href = url
  a.download = file.name
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}
