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
  if (name === 'NotAllowedError')
    return 'Accès à la caméra refusé. Pour ne plus avoir à l’autoriser : dans Safari, aA › Réglages du site web › Caméra › Autoriser'
  if (name === 'NotFoundError' || name === 'OverconstrainedError') return 'Aucune caméra détectée'
  if (name === 'NotReadableError') return 'Caméra déjà utilisée par une autre application'
  return 'Caméra indisponible'
}

function unsupportedReason(): string | null {
  if (typeof navigator.mediaDevices?.getUserMedia === 'function') return null
  return window.isSecureContext ? 'Caméra non prise en charge' : 'La caméra exige une connexion HTTPS'
}

// Un seul flux caméra pour toute l'app : passer de l'accueil à la chasse ou
// au recalage le réutilise au lieu de redemander l'accès (iOS redemande
// souvent l'autorisation à chaque nouvelle ouverture de la caméra).
/** Durée (ms) pendant laquelle le flux reste ouvert après avoir quitté la caméra. */
const KEEP_ALIVE_MS = 15_000

let shared: { facing: CameraFacing; stream: Promise<MediaStream>; users: number; stopTimer: number } | null = null

const isLive = (s: MediaStream) => s.getVideoTracks().some((t) => t.readyState === 'live')

function stopShared() {
  const s = shared
  shared = null
  if (s) void s.stream.then((st) => st.getTracks().forEach((t) => t.stop())).catch(() => undefined)
}

/**
 * Coupe tout de suite le flux gardé ouvert (sans attendre `KEEP_ALIVE_MS`) : le suivi visuel d'ARKit
 * (app iOS) va prendre l'objectif, et un flux encore ouvert le lui disputerait — caméra noire.
 * Attend (au plus `wait` ms) qu'une demande encore en route soit arrivée et coupée. Vrai s'il y en avait un.
 */
export async function stopWebCamera(wait = 1000): Promise<boolean> {
  const s = shared
  if (!s) return false
  clearTimeout(s.stopTimer)
  stopShared()
  await Promise.race([s.stream.catch(() => undefined), new Promise((r) => setTimeout(r, wait))])
  return true
}

async function acquireStream(facing: CameraFacing): Promise<MediaStream> {
  if (shared && shared.facing === facing) {
    clearTimeout(shared.stopTimer)
    const stream = await shared.stream.catch(() => null)
    if (stream && isLive(stream) && shared?.facing === facing) {
      shared.users++
      return stream
    }
  }
  stopShared()
  const stream = navigator.mediaDevices.getUserMedia({
    audio: false,
    // Format 4:3 natif des capteurs photo : le champ de vision reste celui
    // de l'objectif (pas de recadrage 16:9), ce que suppose le géocadrage.
    video: { facingMode: { ideal: facing }, width: { ideal: 2560 }, height: { ideal: 1920 } },
  })
  const entry = { facing, stream, users: 1, stopTimer: 0 }
  shared = entry
  stream.catch(() => {
    if (shared === entry) shared = null
  })
  return stream
}

function releaseStream(stream: MediaStream) {
  const s = shared
  if (!s) {
    stream.getTracks().forEach((t) => t.stop())
    return
  }
  void s.stream.then((current) => {
    if (current !== stream) {
      stream.getTracks().forEach((t) => t.stop())
      return
    }
    s.users = Math.max(0, s.users - 1)
    if (s.users === 0) {
      clearTimeout(s.stopTimer)
      s.stopTimer = window.setTimeout(() => {
        if (shared === s && s.users === 0) stopShared()
      }, KEEP_ALIVE_MS)
    }
  })
}

// App en arrière-plan : on coupe la caméra (voyant éteint, batterie épargnée).
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden' && shared?.users === 0) stopShared()
  })
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
  // Relance du flux quand le système l'a coupé (retour dans l'app).
  const [restart, setRestart] = useState(0)

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

    const onVisible = () => {
      if (document.visibilityState === 'visible' && stream && !isLive(stream)) setRestart((r) => r + 1)
    }
    document.addEventListener('visibilitychange', onVisible)

    acquireStream(facing)
      .then(async (s) => {
        stream = s
        if (cancelled) {
          releaseStream(s)
          return
        }
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
      if (stream) releaseStream(stream)
      document.removeEventListener('visibilitychange', onVisible)
      video.removeEventListener('loadedmetadata', onSize)
      video.removeEventListener('resize', onSize)
      video.srcObject = null
    }
  }, [enabled, unsupported, facing, restart])

  const capture = useCallback(() => {
    const video = videoRef.current
    if (!video) return Promise.reject(new Error('Caméra indisponible'))
    return grabVideoFrame(video)
  }, [])

  return unsupported
    ? { videoRef, status: 'error', error: unsupported, size: null, capture }
    : { videoRef, ...state, size, capture }
}
