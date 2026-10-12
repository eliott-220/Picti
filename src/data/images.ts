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
