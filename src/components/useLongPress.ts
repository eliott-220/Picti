import { useEffect, useRef, type MouseEvent, type PointerEvent } from 'react'

/** Appui maintenu sur une vignette de capture avant le choix « Retirer de mes captures » (ms). */
export const LONG_PRESS_MS = 500
/** Le doigt a bougé de plus de … px : c'est un défilement, pas un appui long. */
const LONG_PRESS_SLOP = 10

/**
 * Appui long sur un élément : `onLong` au bout de `LONG_PRESS_MS` sans bouger ; le clic qui suit le
 * relâchement est avalé (l'appui long n'ouvre pas la fiche).
 */
export function useLongPress(onLong: (() => void) | null) {
  const start = useRef<{ x: number; y: number; timer: number } | null>(null)
  const fired = useRef(false)
  useEffect(() => () => clearTimeout(start.current?.timer), [])
  const cancel = () => {
    clearTimeout(start.current?.timer)
    start.current = null
  }
  if (!onLong) return {}
  return {
    onPointerDown: (e: PointerEvent<HTMLElement>) => {
      fired.current = false
      if (!e.isPrimary || e.button !== 0) return
      cancel()
      start.current = {
        x: e.clientX,
        y: e.clientY,
        timer: window.setTimeout(() => {
          fired.current = true
          start.current = null
          navigator.vibrate?.(12)
          onLong()
        }, LONG_PRESS_MS),
      }
    },
    onPointerMove: (e: PointerEvent<HTMLElement>) => {
      const s = start.current
      if (s && Math.hypot(e.clientX - s.x, e.clientY - s.y) > LONG_PRESS_SLOP) cancel()
    },
    onPointerUp: cancel,
    onPointerCancel: cancel,
    onContextMenu: (e: MouseEvent) => e.preventDefault(),
    onClickCapture: (e: MouseEvent) => {
      if (!fired.current) return
      fired.current = false
      e.preventDefault()
      e.stopPropagation()
    },
  }
}
