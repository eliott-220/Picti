import { useEffect, useRef, useState } from 'react'
import type { GeoFix } from '../geo/geodesy'
import { reproduceStatus, type ReproduceState } from '../geo/reproduce'
import type { ViewPoint } from '../geo/views'

/** Recalcul de l'état (ms) : le délai avant « hors de la vue » s'écoule même sans nouvelle mesure. */
const TICK_MS = 200

/**
 * État du mode « Reproduire » (`reproduceStatus`), recalculé en continu à partir de la position
 * affichée et de l'orientation de l'objectif utilisé ; null sans position ou sans boussole.
 * `parent` doit rester le même objet tant que la photo d'origine ne change pas.
 */
export function useReproduceStatus(
  parent: ViewPoint | null,
  fix: GeoFix | null,
  angles: { heading: number; pitch: number } | null,
): ReproduceState | null {
  const [state, setState] = useState<ReproduceState | null>(null)
  const inputs = useRef({ fix, angles })
  useEffect(() => {
    inputs.current = { fix, angles }
  })

  useEffect(() => {
    if (!parent) return
    const tick = () => {
      const { fix: f, angles: a } = inputs.current
      const time = Date.now()
      setState((prev) =>
        f && a ? reproduceStatus({ position: f, heading: a.heading, pitch: a.pitch, time }, parent, f.accuracy, prev) : prev,
      )
    }
    tick()
    const id = setInterval(tick, TICK_MS)
    return () => {
      clearInterval(id)
      setState(null)
    }
  }, [parent])

  // Vibration courte en sortant de la vue (Android ; l'iPhone n'a pas `navigator.vibrate`).
  const view = state?.view
  const shown = useRef(view)
  useEffect(() => {
    const was = shown.current
    shown.current = view
    if (view === 'out' && (was === 'in-view' || was === 'drifting')) navigator.vibrate?.(80)
  }, [view])

  return state
}
