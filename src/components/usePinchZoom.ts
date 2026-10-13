import { useEffect, useRef, type MouseEvent, type PointerEvent } from 'react'
import { OWN_GESTURES } from './swipeOpen'

/** Un pincement ne part pas des éléments qui ont leurs propres gestes, ni des boutons du zoom. */
const NO_PINCH = `${OWN_GESTURES}, .zoom-lenses`
/** Après un pincement, l'appui qui suit le lever des doigts n'ouvre rien (ms). */
const CLICK_GUARD_MS = 400

/** Le pincement peut partir de cet élément (décor, photos, rail). */
export function freeToPinch(target: EventTarget | null): boolean {
  const el = target as { closest?: (selectors: string) => unknown } | null
  return !el?.closest?.(NO_PINCH)
}

/**
 * Pincer à deux doigts sur le viseur pour zoomer, comme dans l'appareil photo : `onChange` reçoit le
 * zoom de départ multiplié par l'écartement des doigts (non borné : le viseur le borne), `onStart` et
 * `onEnd` encadrent le geste. Écoute en phase de capture (les photos et les piles arrêtent leurs
 * événements) ; les autres gestes s'effacent dès que le second doigt se pose (`useSwipeOpen`,
 * `useCardSwipe`).
 */
export function usePinchZoom({
  enabled,
  zoom,
  onStart,
  onChange,
  onEnd,
}: {
  enabled: boolean
  zoom: number
  onStart: () => void
  onChange: (zoom: number) => void
  /** `raw` : dernier zoom demandé par les doigts, avant d'être borné. */
  onEnd: (raw: number) => void
}) {
  const pointers = useRef(new Map<number, { x: number; y: number }>())
  const pinch = useRef<{ dist: number; zoom: number; raw: number } | null>(null)
  const endedAt = useRef(-Infinity)
  const latest = useRef({ zoom, onStart, onChange, onEnd })
  useEffect(() => {
    latest.current = { zoom, onStart, onChange, onEnd }
  })

  const spread = () => {
    const [a, b] = [...pointers.current.values()]
    return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0
  }

  const end = () => {
    const p = pinch.current
    if (!p) return
    pinch.current = null
    endedAt.current = performance.now()
    latest.current.onEnd(p.raw)
  }

  // Viseur couvert (feuille, prise figée) en plein geste : le pincement s'arrête là.
  useEffect(() => {
    if (enabled) return
    pointers.current.clear()
    end()
  }, [enabled])

  return {
    onPointerDownCapture: (e: PointerEvent<HTMLElement>) => {
      if (!enabled || e.pointerType === 'mouse' || !freeToPinch(e.target)) return
      pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
      if (pointers.current.size !== 2 || pinch.current) return
      const dist = spread()
      if (dist < 10) return
      pinch.current = { dist, zoom: latest.current.zoom, raw: latest.current.zoom }
      latest.current.onStart()
    },
    onPointerMoveCapture: (e: PointerEvent<HTMLElement>) => {
      if (!pointers.current.has(e.pointerId)) return
      pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
      const p = pinch.current
      if (!p) return
      p.raw = p.zoom * (spread() / p.dist)
      latest.current.onChange(p.raw)
    },
    onPointerUpCapture: (e: PointerEvent<HTMLElement>) => {
      if (!pointers.current.delete(e.pointerId)) return
      if (pointers.current.size < 2) end()
    },
    onPointerCancelCapture: (e: PointerEvent<HTMLElement>) => {
      if (!pointers.current.delete(e.pointerId)) return
      if (pointers.current.size < 2) end()
    },
    /** Lever les doigts après un pincement n'est pas un appui sur la photo dessous. */
    onClickCapture: (e: MouseEvent) => {
      if (pinch.current || performance.now() - endedAt.current < CLICK_GUARD_MS) {
        e.preventDefault()
        e.stopPropagation()
      }
    },
  }
}
