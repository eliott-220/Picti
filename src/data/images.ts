// Préparation des images : capture d'une trame vidéo, vignettes.

import { cropRect } from '../geo/zoom'

export interface EncodedImage {
  blob: Blob
  width: number
  height: number
}

function canvasToBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Encodage JPEG impossible'))), 'image/jpeg', quality),
  )
}

function draw(source: CanvasImageSource, width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  canvas.getContext('2d')!.drawImage(source, 0, 0, width, height)
  return canvas
}

/**
 * Fige l'image courante du flux caméra, en pleine résolution ; `zoom` > 1 (zoom numérique) : seul le
 * centre est gardé, comme à l'écran.
 */
export async function grabVideoFrame(video: HTMLVideoElement, zoom = 1): Promise<EncodedImage> {
  const { videoWidth, videoHeight } = video
  if (!videoWidth || !videoHeight) throw new Error('Caméra pas encore prête')
  const crop = cropRect(videoWidth, videoHeight, zoom)
  const canvas = document.createElement('canvas')
  canvas.width = crop.width
  canvas.height = crop.height
  canvas.getContext('2d')!.drawImage(video, crop.x, crop.y, crop.width, crop.height, 0, 0, crop.width, crop.height)
  return { blob: await canvasToBlob(canvas, 0.92), width: crop.width, height: crop.height }
}

/** Décode une image en respectant son orientation EXIF. */
export async function decodeImage(blob: Blob): Promise<ImageBitmap> {
  return createImageBitmap(blob, { imageOrientation: 'from-image' })
}

export async function makeThumbnail(source: ImageBitmap | Blob, maxSide = 480): Promise<Blob> {
  const bitmap = source instanceof Blob ? await decodeImage(source) : source
  const k = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height))
  return canvasToBlob(draw(bitmap, Math.round(bitmap.width * k), Math.round(bitmap.height * k)), 0.8)
}

// ---------- Métadonnées (0.24.0) ----------
//
// Aucune métadonnée ne part au stockage ni dans un partage : ni EXIF (position GPS, date, modèle du
// téléphone), ni XMP, ni IPTC — les données du géocadrage sont déjà dans la base. Un JPEG est nettoyé SANS
// PERTE (on retire ses segments de métadonnées, l'image elle-même n'est pas recompressée) ; il n'est
// ré-encodé que s'il dépend de son EXIF pour être affiché droit (orientation), ou s'il n'est pas un JPEG
// (HEIC de l'iPhone, PNG…), et devient alors un JPEG.

const SOI = 0xd8
const SOS = 0xda
const APP1 = 0xe1

/**
 * Segments gardés : APP0 (JFIF), APP2 (profil de couleur ICC), APP14 (Adobe, indispensable à certaines
 * couleurs) et toutes les tables de l'image. Retirés : APP1 (EXIF, XMP), APP3 à APP13 (IPTC…), APP15, COM.
 */
const keepSegment = (marker: number) =>
  !((marker >= 0xe1 && marker <= 0xef && marker !== 0xe2 && marker !== 0xee) || marker === 0xfe)

/** JPEG sans ses segments de métadonnées (image identique) ; null si ce n'est pas un JPEG lisible. */
export function stripJpegMetadata(bytes: Uint8Array): Uint8Array<ArrayBuffer> | null {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== SOI) return null
  const parts: Uint8Array[] = [bytes.subarray(0, 2)]
  let pos = 2
  while (pos < bytes.length) {
    if (bytes[pos] !== 0xff) return null
    let m = pos + 1
    while (m < bytes.length && bytes[m] === 0xff) m++
    const marker = bytes[m]
    if (marker === undefined) return null
    // Début des données compressées : tout le reste est l'image, gardé tel quel.
    if (marker === SOS) {
      parts.push(bytes.subarray(pos))
      break
    }
    // Marqueurs sans longueur (redémarrages, TEM).
    if ((marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) {
      parts.push(bytes.subarray(pos, m + 1))
      pos = m + 1
      continue
    }
    if (m + 2 >= bytes.length) return null
    const length = (bytes[m + 1] << 8) | bytes[m + 2]
    const end = m + 1 + length
    if (length < 2 || end > bytes.length) return null
    if (keepSegment(marker)) parts.push(bytes.subarray(pos, end))
    pos = end
  }
  const out = new Uint8Array(new ArrayBuffer(parts.reduce((n, p) => n + p.length, 0)))
  let at = 0
  for (const p of parts) {
    out.set(p, at)
    at += p.length
  }
  return out
}

/** Orientation EXIF d'un JPEG (1 à 8), null sans EXIF. */
export function jpegOrientation(bytes: Uint8Array): number | null {
  if (bytes[0] !== 0xff || bytes[1] !== SOI) return null
  let pos = 2
  while (pos + 4 < bytes.length && bytes[pos] === 0xff) {
    const marker = bytes[pos + 1]
    if (marker === SOS) return null
    const length = (bytes[pos + 2] << 8) | bytes[pos + 3]
    const start = pos + 4
    if (
      marker === APP1 &&
      bytes[start] === 0x45 && // « Exif\0\0 »
      bytes[start + 1] === 0x78 &&
      bytes[start + 2] === 0x69 &&
      bytes[start + 3] === 0x66
    ) {
      const tiff = start + 6
      const little = bytes[tiff] === 0x49
      const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
      const u16 = (o: number) => view.getUint16(o, little)
      const u32 = (o: number) => view.getUint32(o, little)
      const ifd = tiff + u32(tiff + 4)
      if (ifd + 2 > bytes.length) return null
      const count = u16(ifd)
      for (let i = 0; i < count; i++) {
        const entry = ifd + 2 + i * 12
        if (entry + 12 > bytes.length) return null
        if (u16(entry) === 0x0112) return u16(entry + 8)
      }
      return null
    }
    pos += 2 + length
  }
  return null
}

/**
 * Le fichier à envoyer ou à partager, sans métadonnées : sans perte quand c'est possible ; sinon ré-encodé
 * en JPEG depuis `decoded` (l'image déjà décodée, à l'endroit) ou depuis le fichier.
 */
export async function withoutMetadata(blob: Blob, decoded?: ImageBitmap): Promise<Blob> {
  const bytes = new Uint8Array(await blob.arrayBuffer())
  const orientation = jpegOrientation(bytes)
  if (orientation == null || orientation === 1) {
    const clean = stripJpegMetadata(bytes)
    if (clean) return new Blob([clean], { type: 'image/jpeg' })
  }
  const bitmap = decoded ?? (await decodeImage(blob))
  try {
    return await canvasToBlob(draw(bitmap, bitmap.width, bitmap.height), 0.92)
  } finally {
    if (!decoded) bitmap.close()
  }
}
