import { useCallback, useEffect, useRef } from 'react'
import { rampZoom, ZOOM } from '../geo/zoom'

/**
 * Appui sur un bouton de zoom (0.24.1) : le zoom glisse jusqu'au repère en `ZOOM.rampMs`, image par image,
 * comme dans l'appareil photo de l'iPhone — le chiffre du bouton défile et la bulle passe d'un repère à
 * l'autre. `apply` reçoit chaque étape. « Réduire les animations » : on saute. `cancel` : un pincement
 * reprend la main.
 */
export function useZoomRamp(apply: (zoom: number) => void) {
  const frame = useRef(0)
  const applyRef = useRef(apply)
  useEffect(() => {
    applyRef.current = apply
  })

  const cancel = useCallback(() => {
    cancelAnimationFrame(frame.current)
    frame.current = 0
  }, [])

  const ramp = useCallback(
    (from: number, to: number) => {
      cancel()
      const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
      if (reduced || !(from > 0) || Math.abs(to / from - 1) < 0.01) {
        applyRef.current(to)
        return
      }
      const start = performance.now()
      const step = (now: number) => {
        const t = (now - start) / ZOOM.rampMs
        applyRef.current(t >= 1 ? to : Math.round(rampZoom(from, to, t) * 1000) / 1000)
        frame.current = t >= 1 ? 0 : requestAnimationFrame(step)
      }
      frame.current = requestAnimationFrame(step)
    },
    [cancel],
  )

  useEffect(() => cancel, [cancel])
  return { ramp, cancel }
}
