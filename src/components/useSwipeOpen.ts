import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type MouseEvent, type PointerEvent } from 'react'
import { freeToSwipe, opensOnRelease, PREPARE_MS, releaseSpeed, SLIDE_MS, SPEED_WINDOW_MS, swipeIntent, swipeOffset } from './swipeOpen'

type Phase = 'idle' | 'drag' | 'open' | 'close'

/**
 * Glisser le doigt de droite à gauche sur l'écran ouvre `onOpen` : un panneau (l'écran à ouvrir)
 * arrive par la droite en suivant le doigt ; lâché assez loin ou assez vite, il finit sa course
 * puis `onOpen` est appelé, sinon il repart à droite. Le panneau suit le doigt sans rendu React
 * (`panelRef`) : l'écran derrière (le viseur) n'est pas redessiné à chaque mouvement.
 *
 * `mounted` : le panneau est à afficher (caché tant qu'on ne glisse pas, `phase` « idle ») ; il est
 * préparé peu après l'ouverture de l'écran, pour que même le premier glissement suive le doigt.
 */
export function useSwipeOpen(onOpen: () => void, enabled: boolean) {
  const [phase, setPhase] = useState<Phase>('idle')
  const [prepared, setPrepared] = useState(false)
  useEffect(() => {
    if (!enabled || prepared) return
    const t = window.setTimeout(() => setPrepared(true), PREPARE_MS)
    return () => clearTimeout(t)
  }, [enabled, prepared])
  const panelRef = useRef<HTMLDivElement>(null)
  const start = useRef<{ x: number; y: number; width: number; id: number } | null>(null)
  // Dernières positions du doigt (vitesse au lâcher).
  const samples = useRef<{ x: number; t: number }[]>([])
  const dragging = useRef(false)
  const offset = useRef(0)
  // Un glissement n'est pas un appui : la photo sous le doigt ne s'ouvre pas.
  const swallowClick = useRef(false)
  const timer = useRef(0)
  const onOpenRef = useRef(onOpen)
  useEffect(() => {
    onOpenRef.current = onOpen
  })
  useEffect(() => () => clearTimeout(timer.current), [])

  const finish = (open: boolean) => {
    setPhase(open ? 'open' : 'close')
    clearTimeout(timer.current)
    timer.current = window.setTimeout(() => {
      offset.current = 0
      if (open) onOpenRef.current()
      else setPhase('idle')
    }, SLIDE_MS)
  }

  const handlers = {
    onPointerDown: (e: PointerEvent<HTMLElement>) => {
      // Un second doigt (pincement pour zoomer) : ce n'est plus un glissement.
      if (!e.isPrimary) {
        if (!start.current) return
        start.current = null
        if (dragging.current) {
          dragging.current = false
          finish(false)
        }
        return
      }
      if (!enabled || phase !== 'idle' || e.button !== 0 || !freeToSwipe(e.target)) return
      start.current = {
        x: e.clientX,
        y: e.clientY,
        width: e.currentTarget.getBoundingClientRect().width,
        id: e.pointerId,
      }
      dragging.current = false
      samples.current = [{ x: e.clientX, t: e.timeStamp }]
    },
    onPointerMove: (e: PointerEvent<HTMLElement>) => {
      const s = start.current
      if (!s || e.pointerId !== s.id) return
      const dx = e.clientX - s.x
      const t = e.timeStamp
      samples.current = [...samples.current.filter((p) => t - p.t <= SPEED_WINDOW_MS * 2), { x: e.clientX, t }]
      if (!dragging.current) {
        const intent = swipeIntent(dx, e.clientY - s.y)
        if (!intent) return
        if (intent === 'other') {
          start.current = null
          return
        }
        dragging.current = true
        swallowClick.current = true
        try {
          // Le doigt peut sortir de l'écran (rail, boutons) sans que le geste se perde.
          e.currentTarget.setPointerCapture(e.pointerId)
        } catch {
          // Doigt déjà levé : le relâcher arrive tout de suite.
        }
        offset.current = swipeOffset(dx, s.width)
        setPhase('drag')
        return
      }
      offset.current = swipeOffset(dx, s.width)
      const panel = panelRef.current
      if (panel) panel.style.transform = `translateX(calc(100% - ${offset.current}px))`
    },
    onPointerUp: (e: PointerEvent<HTMLElement>) => {
      const s = start.current
      if (!s || e.pointerId !== s.id) return
      start.current = null
      if (!dragging.current) return
      dragging.current = false
      samples.current.push({ x: e.clientX, t: e.timeStamp })
      finish(opensOnRelease(e.clientX - s.x, releaseSpeed(samples.current), s.width))
    },
    onPointerCancel: (e: PointerEvent<HTMLElement>) => {
      const s = start.current
      if (!s || e.pointerId !== s.id) return
      start.current = null
      if (!dragging.current) return
      dragging.current = false
      finish(false)
    },
    onClickCapture: (e: MouseEvent) => {
      if (!swallowClick.current) return
      swallowClick.current = false
      e.preventDefault()
      e.stopPropagation()
    },
  }

  // Panneau tout juste affiché : placé sous le doigt avant d'être peint.
  useLayoutEffect(() => {
    const panel = panelRef.current
    if (phase === 'drag' && panel) panel.style.transform = `translateX(calc(100% - ${offset.current}px))`
  }, [phase])

  // Le prochain appui repart de zéro (un glissement sans clic ne doit pas avaler le suivant).
  useEffect(() => {
    if (phase === 'idle') swallowClick.current = false
  }, [phase])

  // Pendant le glissement, la position n'est pas dans le rendu (posée directement sur le panneau) :
  // un nouveau rendu du viseur ne la touche pas.
  const panelStyle: CSSProperties | undefined =
    phase === 'open'
      ? { transform: 'translateX(0)', transition: `transform ${SLIDE_MS}ms ease-out` }
      : phase === 'close'
        ? { transform: 'translateX(100%)', transition: `transform ${SLIDE_MS}ms ease-out` }
        : undefined

  return { phase, mounted: prepared || phase !== 'idle', panelRef, panelStyle, handlers }
}
