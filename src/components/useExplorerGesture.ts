import { useEffect, useRef, useState, type CSSProperties, type MouseEvent, type PointerEvent } from 'react'
import { explorerCommits, explorerIntent, explorerProgress, explorerTargetAllowed } from './explorerGesture'
import { releaseSpeed, SLIDE_MS, SPEED_WINDOW_MS } from './swipeOpen'
import { haptic } from '../native'

interface Drag {
  id: number
  x: number
  y: number
  open: boolean
  travel: number
  locked: boolean
  samples: { x: number; t: number }[]
}

/** Explorer suit le doigt. L'appui sur les quatre carrés / la croix utilise la même animation. */
export function useExplorerGesture({ open, enabled, onChange }: {
  open: boolean
  enabled: boolean
  onChange: (open: boolean) => void
}) {
  const [motion, setMotion] = useState<{ progress: number; settling: boolean } | null>(null)
  const drag = useRef<Drag | null>(null)
  const guard = useRef(false)
  const guardUntil = useRef(0)
  const timer = useRef(0)
  const frame = useRef(0)
  const busy = useRef(false)
  const latest = useRef({ onChange })
  useEffect(() => { latest.current = { onChange } })
  useEffect(() => () => { clearTimeout(timer.current); cancelAnimationFrame(frame.current) }, [])

  function settle(to: boolean, changed: boolean) {
    busy.current = true
    setMotion({ progress: to ? 1 : 0, settling: true })
    if (changed) haptic('tick')
    timer.current = window.setTimeout(() => {
      latest.current.onChange(to)
      setMotion(null)
      busy.current = false
    }, SLIDE_MS)
  }

  function toggle(to: boolean) {
    if (busy.current || drag.current || to === open) return
    busy.current = true
    setMotion({ progress: open ? 1 : 0, settling: false })
    frame.current = requestAnimationFrame(() => {
      frame.current = requestAnimationFrame(() => settle(to, true))
    })
  }

  function finish(cancelled: boolean) {
    const d = drag.current
    drag.current = null
    if (!d?.locked) return
    guardUntil.current = performance.now() + 400
    const last = d.samples[d.samples.length - 1]
    const dy = last.x - d.y
    const speed = releaseSpeed(d.samples, 'right')
    const commit = !cancelled && explorerCommits(dy, speed, d.travel, d.open)
    settle(commit ? !d.open : d.open, commit)
  }

  const handlers = {
    onPointerDown: (e: PointerEvent<HTMLElement>) => {
      if (!e.isPrimary) { guard.current = !!drag.current?.locked; finish(true); return }
      guard.current = false
      if (!enabled || busy.current || e.button !== 0 || !explorerTargetAllowed(e.target, open)) return
      const sheet = e.currentTarget.querySelector<HTMLElement>('.explorer .sheet')
      drag.current = {
        id: e.pointerId, x: e.clientX, y: e.clientY, open, locked: false,
        travel: sheet?.getBoundingClientRect().height ?? e.currentTarget.clientHeight * 0.6,
        samples: [{ x: e.clientY, t: e.timeStamp }],
      }
    },
    onPointerMove: (e: PointerEvent<HTMLElement>) => {
      const d = drag.current
      if (!d || e.pointerId !== d.id) return
      const dy = e.clientY - d.y
      if (!d.locked) {
        const intent = explorerIntent(e.clientX - d.x, dy, d.open)
        if (!intent) return
        if (intent === 'other') { drag.current = null; return }
        d.locked = true
        guard.current = true
        try { e.currentTarget.setPointerCapture?.(e.pointerId) } catch { /* Doigt déjà levé. */ }
      }
      d.samples.push({ x: e.clientY, t: e.timeStamp })
      d.samples = d.samples.filter((s) => e.timeStamp - s.t <= SPEED_WINDOW_MS * 2)
      setMotion({ progress: explorerProgress(dy, d.travel, d.open), settling: false })
    },
    onPointerUp: (e: PointerEvent<HTMLElement>) => {
      if (e.pointerId !== drag.current?.id) return
      drag.current.samples.push({ x: e.clientY, t: e.timeStamp })
      finish(false)
    },
    onPointerCancel: (e: PointerEvent<HTMLElement>) => { if (e.pointerId === drag.current?.id) { guard.current = true; finish(true) } },
    onClickCapture: (e: MouseEvent) => {
      if (!guard.current || performance.now() > guardUntil.current) return
      guard.current = false
      e.preventDefault()
      e.stopPropagation()
    },
  }

  return {
    visible: open || motion != null,
    toggle,
    handlers,
    style: {
      '--explorer-progress': motion?.progress ?? (open ? 1 : 0),
      '--explorer-duration': motion?.settling ? `${SLIDE_MS}ms` : '0ms',
    } as CSSProperties,
  }
}
