import { useEffect, useRef, useState } from 'react'
import { SPOT_CALIBRATION_MS } from '../geo/alignment'
import { approach, type Vec3 } from '../geo/math'
import { currentMotion } from '../sensors/motion'

const NONE: Vec3 = [0, 0, 0]

/**
 * Recalage au point de vue, lors d'une chasse (voir `SPOT_CALIBRATION_MS`) :
 * tant que `active` (photo alignée, pas encore capturée) et qu'on ne marche
 * pas, l'écart entre la position GPS (`eye`, relative au point de vue) et le
 * point de vue est progressivement attribué au GPS. Le reste du temps, il ne
 * bouge pas : la photo garde sa place quand on se déplace.
 */
export function useSpotCalibration(eye: Vec3 | null, active: boolean): Vec3 {
  const [offset, setOffset] = useState<Vec3>(NONE)
  const target = useRef(eye)
  useEffect(() => {
    target.current = eye
  })

  useEffect(() => {
    if (!active) return
    let frame = 0
    let last = performance.now()
    const tick = () => {
      const now = performance.now()
      const dt = now - last
      last = now
      const to = target.current
      // Seulement téléphone immobile (accéléromètre), jamais en marchant ni sans capteur.
      const motion = currentMotion()
      if (to && (motion === 'still' || motion === 'settling')) {
        setOffset((o) => {
          const gap = Math.hypot(to[0] - o[0], to[1] - o[1])
          if (gap < 0.005) return o
          return gap < 0.02 ? to : approach(o, to, dt, SPOT_CALIBRATION_MS)
        })
      }
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [active])

  return offset
}
