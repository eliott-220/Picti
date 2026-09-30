import { useEffect, useRef, useState } from 'react'
import { fromENU, toENU, type GeoFix, type GeoPoint } from '../geo/geodesy'
import { approach, type Vec3 } from '../geo/math'
import { accelerometerSign, MOTION, stepDirection } from '../geo/motion'
import type { CameraBasis } from '../geo/orientation'
import { trackFix, trackPosition, type Track } from '../geo/tracking'
import { currentMotion, walkedSteps } from './motion'
import { keepStepping, walkPosition } from './useGeolocation'

/** Amortissement (ms) des corrections du GPS à l'écran. */
const SMOOTHING_MS = 300

/**
 * Position du spectateur pour la réalité augmentée, recalculée à chaque
 * image : entre deux relevés GPS elle avance à la vitesse de marche, et les
 * corrections sont amorties pour que les photos ne sautent pas.
 *
 * Avec l'orientation du téléphone (`basis`), chaque pas compté par l'accéléromètre fait
 * avancer la position dans le sens de la marche : le GPS ne voit pas quelques mètres
 * (ses ±5 m les noient), alors qu'en avançant ou en reculant de 3 m la photo doit grandir
 * ou rapetisser à sa place.
 */
export function useLivePosition(track: Track | null, basis: CameraBasis | null = null): GeoFix | null {
  const [live, setLive] = useState<GeoFix | null>(null)
  // Position affichée, conservée d'un relevé à l'autre, et dernière position rendue.
  const shown = useRef<{ at: GeoPoint; time: number } | null>(null)
  const rendered = useRef<GeoPoint | null>(null)
  // Orientation actuelle et pas déjà pris en compte.
  const basisRef = useRef(basis)
  const counted = useRef<number | null>(null)
  // Convention de signe de l'accéléromètre, dernière valeur sûre (norme par défaut).
  const sign = useRef<1 | -1>(1)

  useEffect(() => {
    basisRef.current = basis
  })

  useEffect(() => {
    if (!track) return
    let frame = 0
    const tick = () => {
      const now = Date.now()
      if (walkStep()) return
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
    /** Nouveaux pas : la position avance (le suivi est republié, l'effet repart). */
    const walkStep = () => {
      const b = basisRef.current
      const steps = walkedSteps()
      if (!b || !steps) return false
      keepStepping()
      sign.current = accelerometerSign(b, steps.gravity) ?? sign.current
      if (counted.current == null || steps.walked < counted.current) counted.current = steps.walked
      const count = steps.walked - counted.current
      if (!count) return false
      counted.current = steps.walked
      const [f, r] = steps.direction
      const dir = stepDirection(b, [f * sign.current, r * sign.current])
      if (!dir) return false
      const d = count * MOTION.stepLength
      return walkPosition(dir[0] * d, dir[1] * d)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [track])

  return track ? live : null
}
