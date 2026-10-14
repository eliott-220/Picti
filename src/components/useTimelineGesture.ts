import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type MouseEvent,
  type PointerEvent,
  type RefObject,
} from 'react'
import { haptic } from '../native'
import {
  canStepTo,
  collapseFrame,
  collapseProgress,
  collapseTravel,
  lockAxis,
  releaseCollapse,
  releaseStep,
  slideOffset,
  slideOpacity,
  speedOf,
  SPEED_WINDOW_MS,
  type Box,
  type CollapseFrame,
  type TimelineAxis,
} from './timelineGesture'

/** Le contenu part (ms), puis celui de la photo suivante arrive du bon côté (ms). */
const LEAVE_MS = 110
const ENTER_MS = 200
/** Glissé trop court : retour en place (ms). */
const SETTLE_MS = 180
/** Réduction lâchée : course jusqu'à la vignette, ou retour (ms, pour tout le trajet). */
const FOLD_MS = 220
/** Réouverture depuis la vignette (ms). */
const OPEN_MS = 250

/** Réduction de la frise en vignette (viseur seulement). */
export interface TimelineCollapse {
  /** Place de la vignette à l'écran (emplacement caché de même style). */
  target: () => Box | null
  /** La frise a fini de se ranger : la vignette la remplace. */
  onCollapse: () => void
  /** Montée depuis la vignette (appui dessus) : elle grandit jusqu'à sa place. */
  opening?: boolean
  onOpened?: () => void
}

interface Drag {
  id: number
  x: number
  y: number
  axis: TimelineAxis | null
  samples: { x: number; y: number; t: number }[]
  fold?: { from: Box; to: Box; travel: number; reduce: boolean }
}

interface Fold {
  p: number
  from: Box
  to: Box
  reduce: boolean
}

const reducedMotion = () => !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
const boxOf = (el: Element | null): Box | null => {
  const r = el?.getBoundingClientRect()
  return r ? { left: r.left, top: r.top, width: r.width, height: r.height } : null
}
const easeOut = (t: number) => 1 - (1 - t) ** 3

/**
 * Gestes de la frise (0.24.2) : glisser à gauche / à droite change de photo (le contenu suit le doigt en
 * s'effaçant un peu, puis la photo suivante arrive du bon côté ; résistance aux extrémités, pas de boucle) ;
 * avec `collapse` (viseur), glisser vers le bas la range en vignette — elle suit le doigt, puis finit sa course
 * ou remonte. Le sens est décidé dès les premiers pixels (`lockAxis`) ; ensuite la frise tient le doigt
 * (`setPointerCapture`) et arrête l'événement : ni glissé d'écran, ni pincement, ni geste de la chasse. Un
 * glissement n'est pas un appui (clic avalé). Clavier : flèches gauche / droite.
 */
export function useTimelineGesture({
  root,
  index,
  count,
  onStep,
  collapse,
}: {
  /** La frise (mesurée au début d'une réduction ou d'une réouverture). */
  root: RefObject<HTMLDivElement | null>
  index: number
  count: number
  onStep: (step: 1 | -1) => void
  collapse?: TimelineCollapse
}) {
  // Contenu (miniature, texte, bouton) : déplacement, opacité, durée de la transition (0 : sous le doigt).
  const [slide, setSlide] = useState({ offset: 0, opacity: 1, ms: 0 })
  // Réduction en cours (doigt, course finale, réouverture).
  const [fold, setFold] = useState<Fold | null>(null)
  const drag = useRef<Drag | null>(null)
  const moved = useRef(false)
  // Animation en cours (changement de photo, course de la réduction) : pas de nouveau geste.
  const busy = useRef(false)
  const timers = useRef<number[]>([])
  const frame = useRef(0)
  const latest = useRef({ index, count, onStep, collapse })
  useEffect(() => {
    latest.current = { index, count, onStep, collapse }
  })
  useEffect(
    () => () => {
      timers.current.forEach(clearTimeout)
      cancelAnimationFrame(frame.current)
    },
    [],
  )
  const later = (fn: () => void, ms: number) => timers.current.push(window.setTimeout(fn, ms))

  /** Avancement de la réduction animé jusqu'à `to`, puis `done`. */
  function tween(from: Fold, to: number, ms: number, done: () => void) {
    busy.current = true
    cancelAnimationFrame(frame.current)
    const start = performance.now()
    const p0 = from.p
    const step = (now: number) => {
      const t = ms > 0 ? Math.min(1, (now - start) / ms) : 1
      setFold({ ...from, p: p0 + (to - p0) * easeOut(t) })
      if (t < 1) frame.current = requestAnimationFrame(step)
      else {
        busy.current = false
        done()
      }
    }
    frame.current = requestAnimationFrame(step)
  }

  // Réouverture : la frise part de la vignette (mesurée avant d'être peinte) et grandit jusqu'à sa place.
  const opening = !!collapse?.opening
  useLayoutEffect(() => {
    if (!opening) return
    const from = boxOf(root.current)
    const to = latest.current.collapse?.target()
    if (!from || !to) {
      latest.current.collapse?.onOpened?.()
      return
    }
    const start = { p: 1, from, to, reduce: reducedMotion() }
    setFold(start)
    tween(start, 0, OPEN_MS, () => {
      setFold(null)
      latest.current.collapse?.onOpened?.()
    })
    // Au montage seulement : `opening` ne repasse à vrai que sur une nouvelle frise.
  }, [opening, root])

  /** Change de photo : le contenu part dans le sens du geste, la photo suivante arrive de l'autre côté. */
  function leave(step: 1 | -1, dir: number) {
    busy.current = true
    const reduce = reducedMotion()
    setSlide({ offset: reduce ? 0 : dir * 72, opacity: 0, ms: LEAVE_MS })
    later(() => {
      latest.current.onStep(step)
      haptic('tick')
      setSlide({ offset: reduce ? 0 : -dir * 56, opacity: 0, ms: 0 })
      // Deux images : la position de départ est peinte avant la transition d'arrivée.
      frame.current = requestAnimationFrame(() => {
        frame.current = requestAnimationFrame(() => {
          setSlide({ offset: 0, opacity: 1, ms: ENTER_MS })
          later(() => {
            busy.current = false
          }, ENTER_MS)
        })
      })
    }, LEAVE_MS)
  }

  /** Flèches du clavier et boutons pour les lecteurs d'écran : même animation qu'au doigt. */
  function go(step: 1 | -1) {
    const { index: i, count: n } = latest.current
    if (busy.current || drag.current || !canStepTo(i, n, step)) return
    leave(step, -step)
  }

  /** Fin du geste (lâché, ou annulé : appel, second doigt…). */
  function finish(cancelled: boolean) {
    const d = drag.current
    drag.current = null
    if (!d) return
    const last = d.samples[d.samples.length - 1]
    const dx = last.x - d.x
    const dy = last.y - d.y
    if (d.axis === 'x') {
      const speed = speedOf(d.samples.map((s) => ({ v: s.x, t: s.t })))
      const step = cancelled ? null : releaseStep(dx, speed, latest.current.index, latest.current.count)
      if (step != null) leave(step, Math.sign(dx))
      else setSlide({ offset: 0, opacity: 1, ms: SETTLE_MS })
    } else if (d.axis === 'down' && d.fold) {
      const p = collapseProgress(dy, d.fold.travel)
      const current = { p, ...d.fold }
      const speed = speedOf(d.samples.map((s) => ({ v: s.y, t: s.t })))
      if (!cancelled && releaseCollapse(p, speed, dy)) {
        tween(current, 1, Math.max(80, FOLD_MS * (1 - p)), () => latest.current.collapse?.onCollapse())
      } else {
        tween(current, 0, Math.max(80, FOLD_MS * p), () => setFold(null))
      }
    }
  }

  const handlers = {
    onPointerDown: (e: PointerEvent<HTMLDivElement>) => {
      // Un second doigt (pincement) : le geste en cours s'arrête là.
      if (!e.isPrimary) {
        finish(true)
        return
      }
      // La frise garde ses gestes : ni glissé d'écran, ni geste de la chasse (mode démo).
      e.stopPropagation()
      if (busy.current) return
      drag.current = { id: e.pointerId, x: e.clientX, y: e.clientY, axis: null, samples: [{ x: e.clientX, y: e.clientY, t: e.timeStamp }] }
      moved.current = false
    },
    onPointerMove: (e: PointerEvent<HTMLDivElement>) => {
      const d = drag.current
      if (!d || e.pointerId !== d.id) return
      d.samples.push({ x: e.clientX, y: e.clientY, t: e.timeStamp })
      while (d.samples.length > 2 && e.timeStamp - d.samples[0].t > SPEED_WINDOW_MS * 2) d.samples.shift()
      const dx = e.clientX - d.x
      const dy = e.clientY - d.y
      const { index: i, count: n, collapse: c } = latest.current
      if (!d.axis) {
        const axis = lockAxis(dx, dy, { canStep: n > 1, canCollapse: !!c })
        if (!axis) return
        d.axis = axis
        // Plus un appui : le clic qui suit est avalé.
        moved.current = true
        if (axis === 'none') return
        if (axis === 'down') {
          const from = boxOf(root.current)
          const to = c?.target()
          if (!from || !to) {
            d.axis = 'none'
            return
          }
          d.fold = { from, to, travel: collapseTravel(from, to), reduce: reducedMotion() }
        }
        e.currentTarget.setPointerCapture?.(e.pointerId)
      }
      if (d.axis === 'x') {
        const offset = slideOffset(dx, i, n)
        setSlide({ offset: reducedMotion() ? 0 : offset, opacity: slideOpacity(offset), ms: 0 })
      } else if (d.axis === 'down' && d.fold) {
        setFold({ p: collapseProgress(dy, d.fold.travel), ...d.fold })
      }
    },
    onPointerUp: (e: PointerEvent<HTMLDivElement>) => {
      if (e.pointerId === drag.current?.id) finish(false)
    },
    onPointerCancel: (e: PointerEvent<HTMLDivElement>) => {
      if (e.pointerId === drag.current?.id) finish(true)
    },
    // Un glissement n'est pas un appui (bouton « Chasser », like…).
    onClickCapture: (e: MouseEvent) => {
      if (!moved.current) return
      moved.current = false
      e.preventDefault()
      e.stopPropagation()
    },
    onKeyDown: (e: KeyboardEvent) => {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
      e.preventDefault()
      go(e.key === 'ArrowRight' ? 1 : -1)
    },
  }

  const f: CollapseFrame | null = fold && collapseFrame(fold.p, fold.from, fold.to, fold.reduce)
  // Réouverture pas encore mesurée : rien de peint.
  const hidden = opening && !fold
  const rootStyle: CSSProperties | undefined = hidden
    ? { visibility: 'hidden' }
    : f
      ? {
          transform: f.y ? `translateY(${f.y}px)` : undefined,
          clipPath: f.inset.some(Boolean)
            ? `inset(${f.inset.map((v) => `${v}px`).join(' ')} round ${f.radius}px)`
            : undefined,
          opacity: f.opacity,
        }
      : undefined
  const slideStyle: CSSProperties = {
    transform: slide.offset ? `translateX(${slide.offset}px)` : undefined,
    opacity: slide.opacity * (f?.info ?? 1),
    transition: slide.ms ? `transform ${slide.ms}ms ease-out, opacity ${slide.ms}ms ease-out` : undefined,
  }
  // Image de la photo visée qui remplit la partie visible pendant la réduction.
  const shrink: CSSProperties | null =
    f && fold && f.image > 0
      ? ({
          left: f.inset[3],
          top: f.inset[0],
          width: fold.from.width - f.inset[1] - f.inset[3],
          height: fold.from.height - f.inset[0] - f.inset[2],
          borderRadius: f.radius,
          opacity: f.image,
          '--edge': f.edge,
        } as CSSProperties)
      : null

  return { handlers, rootStyle, slideStyle, shrink, go }
}
