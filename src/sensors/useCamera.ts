import { useCallback, useEffect, useRef, useState, type RefObject } from 'react'
import { grabVideoFrame, type EncodedImage } from '../data/images'

export type CameraStatus = 'starting' | 'ready' | 'error'

/** Caméra arrière (`environment`) ou avant, pour les selfies (`user`). */
export type CameraFacing = 'environment' | 'user'

export interface CameraState {
  videoRef: RefObject<HTMLVideoElement | null>
  status: CameraStatus
  error: string | null
  /** Dimensions natives du flux (px). */
  size: { width: number; height: number } | null
  capture(): Promise<EncodedImage>
}

function describe(e: unknown): string {
  const name = e instanceof DOMException ? e.name : ''
  if (name === 'NotAllowedError') return 'Accès à la caméra refusé'
  if (name === 'NotFoundError' || name === 'OverconstrainedError') return 'Aucune caméra détectée'
  if (name === 'NotReadableError') return 'Caméra déjà utilisée par une autre application'
  return 'Caméra indisponible'
}

function unsupportedReason(): string | null {
  if (typeof navigator.mediaDevices?.getUserMedia === 'function') return null
  return window.isSecureContext ? 'Caméra non prise en charge' : 'La caméra exige une connexion HTTPS'
}

/** Flux de la caméra (arrière par défaut), affiché dans l'élément <video> référencé. */
export function useCamera(enabled = true, facing: CameraFacing = 'environment'): CameraState {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const [unsupported] = useState(unsupportedReason)
  const [state, setState] = useState<{ status: CameraStatus; error: string | null }>({
    status: 'starting',
    error: null,
  })
  const [size, setSize] = useState<{ width: number; height: number } | null>(null)

  useEffect(() => {
    const video = videoRef.current
    if (!enabled || unsupported || !video) return
    let stream: MediaStream | null = null
    let cancelled = false
    setState({ status: 'starting', error: null })
    const onSize = () => {
      if (video.videoWidth) setSize({ width: video.videoWidth, height: video.videoHeight })
    }
    video.addEventListener('loadedmetadata', onSize)
    video.addEventListener('resize', onSize)

    navigator.mediaDevices
      .getUserMedia({
        audio: false,
        // Format 4:3 natif des capteurs photo : le champ de vision reste celui
        // de l'objectif (pas de recadrage 16:9), ce que suppose le géocadrage.
        video: { facingMode: { ideal: facing }, width: { ideal: 2560 }, height: { ideal: 1920 } },
      })
      .then(async (s) => {
        stream = s
        if (cancelled) return
        video.srcObject = s
        await video.play().catch(() => undefined)
        onSize()
        setState({ status: 'ready', error: null })
      })
      .catch((e: unknown) => {
        if (!cancelled) setState({ status: 'error', error: describe(e) })
      })

    return () => {
      cancelled = true
      stream?.getTracks().forEach((t) => t.stop())
      video.removeEventListener('loadedmetadata', onSize)
      video.removeEventListener('resize', onSize)
      video.srcObject = null
    }
  }, [enabled, unsupported, facing])

  const capture = useCallback(() => {
    const video = videoRef.current
    if (!video) return Promise.reject(new Error('Caméra indisponible'))
    return grabVideoFrame(video)
  }, [])

  return unsupported
    ? { videoRef, status: 'error', error: unsupported, size: null, capture }
    : { videoRef, ...state, size, capture }
}
