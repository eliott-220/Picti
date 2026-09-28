import { useEffect, useRef, useState } from 'react'
import { fromENU, toENU, type GeoFix, type GeoPoint } from '../geo/geodesy'
import { approach, type Vec3 } from '../geo/math'
import { trackFix, trackPosition, type Track } from '../geo/tracking'
import { currentMotion } from './motion'

/** Amortissement (ms) des corrections du GPS à l'écran. */
const SMOOTHING_MS = 300

/**
 * Position du spectateur pour la réalité augmentée, recalculée à chaque
 * image : entre deux relevés GPS elle avance à la vitesse de marche, et les
 * corrections sont amorties pour que les photos ne sautent pas.
 */
export function useLivePosition(track: Track | null): GeoFix | null {
  const [live, setLive] = useState<GeoFix | null>(null)
  // Position affichée, conservée d'un relevé à l'autre, et dernière position rendue.
  const shown = useRef<{ at: GeoPoint; time: number } | null>(null)
  const rendered = useRef<GeoPoint | null>(null)

  useEffect(() => {
    if (!track) return
    let frame = 0
    const tick = () => {
      const now = Date.now()
      const [e, n] = trackPosition(track, now, currentMotion())
      let next: Vec3 = [e, n, 0]
      const prev = shown.current
      if (prev) {
        const [pe, pn] = toENU(track.origin, prev.at)
        next = approach([pe, pn, 0], next, now - prev.time, SMOOTHING_MS)
      }
      const at = fromENU(track.origin, next)
      shown.current = { at, time: now }
      // Nouveau rendu dès qu'on s'est déplacé d'un centimètre.
      const last = rendered.current
      const [de, dn] = last ? toENU(last, at) : [Infinity, 0]
      if (Math.hypot(de, dn) >= 0.01) {
        rendered.current = at
        setLive(trackFix(track, [next[0], next[1]]))
      }
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [track])

  return track ? live : null
}
