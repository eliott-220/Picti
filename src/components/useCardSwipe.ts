import { useEffect, useRef, useState, type MouseEvent, type PointerEvent } from 'react'

/** Distance (px) à partir de laquelle une carte lâchée s'envole. */
const SWIPE_DISTANCE = 80
/** Vitesse (px/ms) suffisante pour faire s'envoler une carte, même lâchée tôt. */
const SWIPE_SPEED = 0.5
/** Durée de l'envol ou du retour en place (ms). */
export const SWIPE_MS = 220

type Phase = 'idle' | 'drag' | 'settle' | 'leave'

/**
 * Carte à faire glisser du doigt, comme sur Tinder : elle suit le doigt en
 * s'inclinant, puis s'envole si on la lâche assez loin (ou assez vite),
 * sinon elle revient en place. Vers la gauche → +1 (suivante), vers la
 * droite → −1 (précédente).
 */
export function useCardSwipe(onSwipe: (step: 1 | -1) => void) {
  const [state, setState] = useState<{ dx: number; phase: Phase }>({ dx: 0, phase: 'idle' })
  const start = useRef<{ x: number; y: number; t: number } | null>(null)
  const moved = useRef(false)
  const timer = useRef(0)
  const onSwipeRef = useRef(onSwipe)
  useEffect(() => {
    onSwipeRef.current = onSwipe
  })
  useEffect(() => () => clearTimeout(timer.current), [])

  const settle = () => {
    setState({ dx: 0, phase: 'settle' })
    clearTimeout(timer.current)
    timer.current = window.setTimeout(() => setState({ dx: 0, phase: 'idle' }), SWIPE_MS)
  }

  const handlers = {
    onPointerDown: (e: PointerEvent<HTMLElement>) => {
      if (state.phase === 'leave') return
      e.stopPropagation()
      start.current = { x: e.clientX, y: e.clientY, t: e.timeStamp }
      moved.current = false
    },
    onPointerMove: (e: PointerEvent<HTMLElement>) => {
      const s = start.current
      if (!s) return
      const dx = e.clientX - s.x
      const dy = e.clientY - s.y
      if (!moved.current) {
        if (Math.hypot(dx, dy) < 8) return
        // Geste vertical : on laisse défiler la page.
        if (Math.abs(dy) > Math.abs(dx)) {
          start.current = null
          return
        }
        moved.current = true
        e.currentTarget.setPointerCapture?.(e.pointerId)
      }
      setState({ dx, phase: 'drag' })
    },
    onPointerUp: (e: PointerEvent<HTMLElement>) => {
      const s = start.current
      start.current = null
      if (!s || !moved.current) return
      const dx = e.clientX - s.x
      const speed = Math.abs(dx) / Math.max(1, e.timeStamp - s.t)
      if (Math.abs(dx) < SWIPE_DISTANCE && !(speed > SWIPE_SPEED && Math.abs(dx) > 30)) {
        settle()
        return
      }
      const step = dx < 0 ? 1 : -1
      setState({ dx: Math.sign(dx) * Math.max(window.innerWidth, 400) * 1.2, phase: 'leave' })
      clearTimeout(timer.current)
      timer.current = window.setTimeout(() => {
        onSwipeRef.current(step)
        setState({ dx: 0, phase: 'idle' })
      }, SWIPE_MS)
    },
    onPointerCancel: () => {
      start.current = null
      if (moved.current) settle()
    },
    // Un glissement n'est pas un appui : pas d'ouverture de la photo.
    onClickCapture: (e: MouseEvent) => {
      if (moved.current) {
        e.preventDefault()
        e.stopPropagation()
        moved.current = false
      }
    },
  }

  /** Avancement du glissement (0 → 1) : la carte suivante grandit en dessous. */
  const progress = Math.min(1, Math.abs(state.dx) / SWIPE_DISTANCE)
  return {
    dx: state.dx,
    progress,
    /** Transformation CSS de la carte du dessus (déplacement + inclinaison). */
    transform: `translateX(${state.dx}px) rotate(${state.dx * 0.05}deg)`,
    transition: state.phase === 'settle' || state.phase === 'leave' ? `transform ${SWIPE_MS}ms ease-out` : 'none',
    handlers,
  }
}
