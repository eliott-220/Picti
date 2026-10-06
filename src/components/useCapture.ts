import { useCallback, useEffect, useRef, useState } from 'react'
import { CAPTURE, checkCapture, type CaptureSample } from '../geo/capture'
import type { CameraAngles } from '../geo/orientation'
import { walkedSteps } from '../sensors/motion'

/**
 * Célébration d'une capture (ms) : la photo capturée couvre l'écran, puis sa fiche monte en
 * feuille par-dessus la caméra (chasse et viseur).
 */
export const CELEBRATION_MS = 1500

/**
 * Déroulé d'une capture (voir `geo/capture.ts`) :
 * - `growing` : la carte quitte sa place (`from`, sa transformation au départ) et s'agrandit ;
 * - `captured` : capturée, elle couvre tout l'écran ;
 * - `back` : elle revient à sa place (`to`) en rétrécissant, après une annulation (`cancelled` :
 *   couleur retirée, rien n'est enregistré) ou après la capture.
 */
export type CaptureState =
  | { phase: 'idle' }
  | { phase: 'growing'; id: string; from: string }
  | { phase: 'captured'; id: string; from: string }
  | { phase: 'back'; id: string; to: string; cancelled: boolean }

/** Ce que voit l'écran à chaque rendu : orientation, et place à l'écran d'une photo (null si elle n'y est pas). */
export interface CaptureView {
  angles: CameraAngles | null
  place: (id: string) => string | null
}

/**
 * Capture par agrandissement, partagée par le viseur et la chasse. `start` lance
 * l'agrandissement ; chaque image, les capteurs sont comparés à leur état au départ
 * (`checkCapture`) : à 100 %, `onCaptured` enregistre la capture ; sinon, annulation et message.
 * `sync` donne à chaque rendu ce que voit l'écran ; `release` renvoie à sa place une photo capturée.
 */
export function useCapture(onCaptured: (id: string) => void) {
  const [state, setState] = useState<CaptureState>({ phase: 'idle' })
  const [notice, setNotice] = useState<string | null>(null)
  const view = useRef<CaptureView>({ angles: null, place: () => null })
  const startedWith = useRef<CaptureSample | null>(null)
  const onCapturedRef = useRef(onCaptured)
  useEffect(() => {
    onCapturedRef.current = onCaptured
  })

  const sample = (id: string): CaptureSample => ({
    t: performance.now(),
    angles: view.current.angles,
    steps: walkedSteps()?.steps ?? null,
    onScreen: view.current.place(id) != null,
  })

  const sync = useCallback((next: CaptureView) => {
    view.current = next
  }, [])

  const idle = state.phase === 'idle'
  const start = useCallback(
    (id: string, from: string) => {
      if (!idle) return
      startedWith.current = sample(id)
      setState({ phase: 'growing', id, from })
      setNotice(null)
    },
    // `sample` ne lit que des références.
    [idle],
  )

  const release = useCallback(() => {
    setState((s) =>
      s.phase === 'captured' ? { phase: 'back', id: s.id, to: view.current.place(s.id) ?? s.from, cancelled: false } : s,
    )
  }, [])

  // Pendant l'agrandissement : capteurs vérifiés à chaque image.
  useEffect(() => {
    if (state.phase !== 'growing' || !startedWith.current) return
    const { id, from } = state
    const begin = startedWith.current
    let frame = 0
    const tick = () => {
      const check = checkCapture(begin, sample(id))
      if (check.status === 'cancelled') {
        setState({ phase: 'back', id, to: view.current.place(id) ?? from, cancelled: true })
        setNotice('Capture interrompue : restez immobile')
        navigator.vibrate?.(80)
        return
      }
      if (check.status === 'complete') {
        setState({ phase: 'captured', id, from })
        onCapturedRef.current(id)
        return
      }
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [state])

  // Retour à sa place, puis la photo reprend son affichage habituel.
  useEffect(() => {
    if (state.phase !== 'back') return
    const t = setTimeout(() => setState({ phase: 'idle' }), CAPTURE.backMs)
    return () => clearTimeout(t)
  }, [state])

  useEffect(() => {
    if (!notice) return
    const t = setTimeout(() => setNotice(null), CAPTURE.noticeMs)
    return () => clearTimeout(t)
  }, [notice])

  return {
    state,
    /** Photo en cours de capture (agrandie, capturée ou de retour à sa place), null sinon. */
    active: state.phase === 'idle' ? null : state.id,
    /** Message court : « Ne bougez plus… » pendant l'agrandissement, ou l'annulation. */
    hint: state.phase === 'growing' ? 'Ne bougez plus…' : notice,
    start,
    release,
    sync,
  }
}
