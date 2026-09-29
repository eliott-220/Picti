import { useEffect, useRef, type RefObject } from 'react'
import {
  columnProfile,
  feedFocal,
  focal35FromProfile,
  initialFocalState,
  measuredFocal,
  profileShift,
} from '../geo/focalCalibration'
import type { CameraAngles } from '../geo/orientation'
import { setMeasuredFocal } from './cameraFocal'

/** Largeur (px) de l'image réduite analysée à chaque image. */
const WIDTH = 240

/**
 * Mesure en continu la focale de la caméra principale (voir
 * `geo/focalCalibration.ts`) pendant qu'on tourne le téléphone, et
 * l'enregistre dès que plusieurs mesures concordent.
 */
export function useFocalCalibration(
  videoRef: RefObject<HTMLVideoElement | null>,
  angles: CameraAngles | null,
  active: boolean,
) {
  const latest = useRef(angles)
  useEffect(() => {
    latest.current = angles
  })

  useEffect(() => {
    const video = videoRef.current
    if (!active || !video) return
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    if (!ctx) return
    let state = initialFocalState()
    let prev: Float32Array | null = null
    let stopped = false
    let handle = 0

    const onFrame = () => {
      if (stopped) return
      const a = latest.current
      const { videoWidth: vw, videoHeight: vh } = video
      if (a && vw && vh && video.readyState >= 2) {
        const height = Math.round((WIDTH * vh) / vw)
        if (canvas.width !== WIDTH || canvas.height !== height) {
          canvas.width = WIDTH
          canvas.height = height
          prev = null
        }
        ctx.drawImage(video, 0, 0, WIDTH, height)
        const profile = columnProfile(ctx.getImageData(0, 0, WIDTH, height).data, WIDTH, height)
        const shift = prev ? profileShift(prev, profile) : null
        prev = profile
        state = feedFocal(state, { t: performance.now(), heading: a.heading, pitch: a.pitch, roll: a.roll, shift })
        const focal = measuredFocal(state, WIDTH)
        const mm = focal && focal35FromProfile(focal, WIDTH, vw, vh)
        if (mm) setMeasuredFocal(mm)
      }
      schedule()
    }
    // Une analyse par nouvelle image de la vidéo (à défaut, à chaque rafraîchissement).
    const schedule = () => {
      handle = video.requestVideoFrameCallback
        ? video.requestVideoFrameCallback(onFrame)
        : requestAnimationFrame(onFrame)
    }
    schedule()
    return () => {
      stopped = true
      if (video.cancelVideoFrameCallback) video.cancelVideoFrameCallback(handle)
      else cancelAnimationFrame(handle)
    }
  }, [videoRef, active])
}
