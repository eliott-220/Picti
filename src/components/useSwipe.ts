import { useRef, type PointerEvent as ReactPointerEvent } from 'react'

/** Glissement horizontal : vers la gauche → +1 (plus ancienne), vers la droite → −1. */
export function useSwipe(onStep: (step: 1 | -1) => void) {
  const start = useRef<{ x: number; y: number } | null>(null)
  return {
    onPointerDown: (e: ReactPointerEvent) => {
      start.current = { x: e.clientX, y: e.clientY }
    },
    onPointerUp: (e: ReactPointerEvent) => {
      const s = start.current
      start.current = null
      if (!s) return
      const dx = e.clientX - s.x
      const dy = e.clientY - s.y
      if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) onStep(dx < 0 ? 1 : -1)
    },
  }
}

