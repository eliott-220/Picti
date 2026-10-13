import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type RefObject } from 'react'
import { grabVideoFrame, type EncodedImage } from '../data/images'
import { clampZoom, hardwareRange, type ZoomRange } from '../geo/zoom'

export type CameraStatus = 'starting' | 'ready' | 'error'

/** Caméra arrière (`environment`) ou avant, pour les selfies (`user`). */
export type CameraFacing = 'environment' | 'user'

export interface CameraState {
  videoRef: RefObject<HTMLVideoElement | null>
  status: CameraStatus
  error: string | null
  /** Dimensions natives du flux (px). */
  size: { width: number; height: number } | null
  /**
   * Zoom matériel de la caméra (contrainte `zoom`) : sa plage, null si elle ne zoome pas, undefined
   * tant qu'elle n'a jamais été ouverte ; `zoom` : celui qu'elle applique (1 sans zoom matériel).
   */
  zoomRange: ZoomRange | null | undefined
  zoom: number
  /** Image courante ; `digital` > 1 : seul le centre est gardé (zoom numérique). */
  capture(digital?: number): Promise<EncodedImage>
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

// Zoom matériel (Safari 17+ sur iPhone : 0,5 = ultra grand-angle, 1 = objectif principal, jusqu'à 10 ;
// certains Chrome) : absent des types du DOM.
type ZoomCapable = MediaTrackCapabilities & { zoom?: { min?: number; max?: number } }
type ZoomSettings = MediaTrackSettings & { zoom?: number }

// Dernière plage de zoom vue pour chaque caméra : connue avant même de rouvrir le flux (le viseur
// choisit sa caméra d'après elle, `zoomPlan`).
let knownZoom: Partial<Record<CameraFacing, ZoomRange | null>> = {}
const zoomListeners = new Set<() => void>()

function setKnownZoom(facing: CameraFacing, range: ZoomRange | null) {
  const previous = knownZoom[facing]
  if (previous === range || (previous && range && previous.min === range.min && previous.max === range.max)) return
  knownZoom = { ...knownZoom, [facing]: range }
  zoomListeners.forEach((l) => l())
}

/** Plage du zoom matériel de cette caméra : null si elle ne zoome pas, undefined si jamais ouverte. */
export function useCameraZoomRange(facing: CameraFacing): ZoomRange | null | undefined {
  return useSyncExternalStore(
    (listener) => {
      zoomListeners.add(listener)
      return () => {
        zoomListeners.delete(listener)
      }
    },
    () => knownZoom[facing],
  )
}

function trackZoomRange(track: MediaStreamTrack | undefined): ZoomRange | null {
  try {
    return hardwareRange((track?.getCapabilities?.() as ZoomCapable | undefined)?.zoom)
  } catch {
    return null
  }
}

function trackZoom(track: MediaStreamTrack | undefined): number {
  const z = (track?.getSettings?.() as ZoomSettings | undefined)?.zoom
  return typeof z === 'number' && z > 0 ? z : 1
}

/** Demande le zoom `zoom` (borné à la plage de la caméra) ; renvoie celui qu'elle applique. */
async function applyZoom(track: MediaStreamTrack | undefined, zoom: number): Promise<number> {
  const range = trackZoomRange(track)
  if (!track || !range) return 1
  const wanted = clampZoom(zoom, range)
  if (Math.abs(trackZoom(track) - wanted) > 1e-3) {
    try {
      await track.applyConstraints({ advanced: [{ zoom: wanted } as MediaTrackConstraintSet] })
    } catch {
      // Refusé (caméra occupée, valeur hors des formats) : on garde le zoom actuel.
    }
  }
  return trackZoom(track)
}

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

/**
 * Flux de la caméra (arrière par défaut), affiché dans l'élément <video> référencé ; `zoom` : zoom
 * matériel demandé (appliqué si la caméra sait zoomer — le flux partagé reprend celui de chaque écran).
 */
export function useCamera(enabled = true, facing: CameraFacing = 'environment', zoom = 1): CameraState {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const [unsupported] = useState(unsupportedReason)
  const [state, setState] = useState<{ status: CameraStatus; error: string | null }>({
    status: 'starting',
    error: null,
  })
  const [size, setSize] = useState<{ width: number; height: number } | null>(null)
  // Relance du flux quand le système l'a coupé (retour dans l'app).
  const [restart, setRestart] = useState(0)
  const zoomRange = useCameraZoomRange(facing)
  const [applied, setApplied] = useState(1)
  const [track, setTrack] = useState<MediaStreamTrack | null>(null)
  const zoomRef = useRef(zoom)
  useEffect(() => {
    zoomRef.current = zoom
  })

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
        // Zoom de l'écran appliqué avant d'afficher l'image (pas d'éclair au mauvais cadrage).
        const t = s.getVideoTracks()[0]
        const z = await applyZoom(t, zoomRef.current)
        if (cancelled) return
        setKnownZoom(facing, trackZoomRange(t))
        setApplied(z)
        setTrack(t ?? null)
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
      setTrack(null)
      if (stream) releaseStream(stream)
      document.removeEventListener('visibilitychange', onVisible)
      video.removeEventListener('loadedmetadata', onSize)
      video.removeEventListener('resize', onSize)
      video.srcObject = null
    }
  }, [enabled, unsupported, facing, restart])

  // Zoom changé pendant que le flux est ouvert (boutons, pincement) : appliqué au fil de l'eau, une
  // demande à la fois (la dernière l'emporte).
  useEffect(() => {
    if (!track || !zoomRange) return
    let stale = false
    void applyZoom(track, zoom).then((z) => {
      if (!stale) setApplied(z)
    })
    return () => {
      stale = true
    }
  }, [track, zoomRange, zoom])

  const capture = useCallback((digital = 1) => {
    const video = videoRef.current
    if (!video) return Promise.reject(new Error('Caméra indisponible'))
    return grabVideoFrame(video, digital)
  }, [])

  return unsupported
    ? { videoRef, status: 'error', error: unsupported, size: null, zoomRange: null, zoom: 1, capture }
    : { videoRef, ...state, size, zoomRange, zoom: zoomRange ? applied : 1, capture }
}
