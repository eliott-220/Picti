import { useEffect, useLayoutEffect, useRef, useState, type MouseEvent, type PointerEvent, type RefObject } from 'react'
import {
  freeToSwipe,
  inRightEdge,
  opensOnRelease,
  releaseSpeed,
  SLIDE_MS,
  SPEED_WINDOW_MS,
  swipeIntent,
  swipeOffset,
  type SwipeDirection,
} from './swipeOpen'

/** Les trois écrans côte à côte : [ Carte ] ← [ Viseur ] → [ Profil ]. */
export type Pane = 'viseur' | 'carte' | 'profil'

/** Écran qui bouge pendant un geste ou une animation, et vers où. */
export interface PaneMove {
  pane: 'carte' | 'profil'
  /** Vrai : il arrive (ouverture depuis le viseur) ; faux : il repart (retour au viseur). */
  opening: boolean
}

interface Drag {
  x: number
  y: number
  width: number
  id: number
  /** Sens permis : depuis le viseur, les deux ; depuis le bord droit de la carte, vers la gauche. */
  allowed: readonly SwipeDirection[]
  dir: SwipeDirection | null
}

/** Fin du mouvement : les styles posés à la main laissent la place à ceux de l'écran affiché. */
function clearPaneStyles(panes: (HTMLElement | null)[], bar: HTMLElement | null) {
  for (const el of panes) {
    if (!el) continue
    el.style.transition = ''
    el.style.visibility = ''
    el.style.transform = ''
  }
  if (bar) {
    bar.classList.remove('dragging')
    bar.style.removeProperty('--away')
  }
}

/** Position (translateX) d'un écran voisin, `shown` de 0 (caché) à 1 (affiché). */
function paneTransform(pane: 'carte' | 'profil', shown: number): string {
  const hidden = (1 - Math.min(1, Math.max(0, shown))) * 100
  return `translateX(${pane === 'carte' ? -hidden : hidden}%)`
}

/**
 * Glissés entre le viseur et ses voisins (comme Snap, sans le chat) : sur le viseur, glisser vers la
 * gauche fait arriver le profil par la droite, vers la droite la carte par la gauche, sous le doigt ;
 * sur la carte, glisser vers la gauche depuis la bande du bord droit la referme. Lâché au-delà d'un tiers
 * de l'écran (ou d'un geste vif), l'écran finit sa course puis `onCommit` change d'adresse ; sinon il
 * repart. Pendant le geste, rien n'est redessiné par React : les écrans bougent par leur style, et la
 * barre du bas reçoit `--away` (0 sur le viseur, 1 ailleurs) qui réduit le bouton rouge en même temps.
 * `goTo` fait la même animation sans le doigt (bouton rouge, menu, bouton Profil).
 */
export function usePanes({
  pane,
  enabled,
  onCommit,
  map,
  profile,
  bar,
}: {
  pane: Pane
  /** Glissés permis depuis le viseur (pas de feuille, de prise en cours…). */
  enabled: boolean
  onCommit: (target: Pane) => void
  map: RefObject<HTMLElement | null>
  profile: RefObject<HTMLElement | null>
  bar: RefObject<HTMLElement | null>
}) {
  // Écran en mouvement (geste ou animation) : il doit être monté et visible.
  const [move, setMove] = useState<PaneMove | null>(null)
  const drag = useRef<Drag | null>(null)
  const samples = useRef<{ x: number; t: number }[]>([])
  const moving = useRef<PaneMove | null>(null)
  const swallowClick = useRef(false)
  const timer = useRef(0)
  const onCommitRef = useRef(onCommit)
  useEffect(() => {
    onCommitRef.current = onCommit
  })
  useEffect(() => () => clearTimeout(timer.current), [])

  const elOf = (p: 'carte' | 'profil') => (p === 'carte' ? map : profile).current

  /** Place l'écran en mouvement (`shown` 0 → 1) et la barre, directement dans leur style. */
  function place(m: PaneMove, shown: number, animate: boolean) {
    const el = elOf(m.pane)
    const transition = animate ? `transform ${SLIDE_MS}ms ease-out` : 'none'
    if (el) {
      el.style.transition = transition
      el.style.visibility = 'visible'
      el.style.transform = paneTransform(m.pane, shown)
    }
    const b = bar.current
    if (b) {
      b.classList.toggle('dragging', !animate)
      b.style.setProperty('--away', String(Math.min(1, Math.max(0, shown))))
    }
  }

  const clearStyles = () => clearPaneStyles([map.current, profile.current], bar.current)

  /** Finit la course de l'écran en mouvement ; `commit` : vers sa nouvelle place (puis changement d'adresse). */
  function settle(m: PaneMove, commit: boolean) {
    const shownAtEnd = commit === m.opening ? 1 : 0
    place(m, shownAtEnd, true)
    clearTimeout(timer.current)
    timer.current = window.setTimeout(() => {
      if (!commit) {
        clearStyles()
        moving.current = null
        setMove(null)
        return
      }
      onCommitRef.current(m.opening ? m.pane : 'viseur')
      // L'écran affiché change avec l'adresse (effet plus bas) ; sinon, filet de sécurité.
      timer.current = window.setTimeout(() => {
        clearStyles()
        moving.current = null
        setMove(null)
      }, 600)
    }, SLIDE_MS)
  }

  // Nouvel écran affiché (adresse changée) : ses styles de classe prennent le relais, avant d'être peints.
  useLayoutEffect(() => {
    if (!moving.current) return
    clearTimeout(timer.current)
    clearPaneStyles([map.current, profile.current], bar.current)
    moving.current = null
    setMove(null)
  }, [pane, map, profile, bar])

  /** Va à un écran voisin avec la même animation qu'au doigt. */
  function goTo(target: Pane) {
    if (target === pane || moving.current) return
    if (target === 'viseur') {
      const m: PaneMove = { pane: pane as 'carte' | 'profil', opening: false }
      moving.current = m
      setMove(m)
      settle(m, true)
      return
    }
    if (pane !== 'viseur') {
      // Carte ↔ profil : pas de glissé entre eux, l'écran change directement.
      onCommitRef.current(target)
      return
    }
    const m: PaneMove = { pane: target, opening: true }
    moving.current = m
    setMove(m)
    // Un rendu pour monter l'écran, puis la course.
    requestAnimationFrame(() => {
      place(m, 0, false)
      requestAnimationFrame(() => settle(m, true))
    })
  }

  function begin(e: PointerEvent<HTMLElement>, allowed: readonly SwipeDirection[]) {
    const r = e.currentTarget.closest('.screen')?.getBoundingClientRect() ?? e.currentTarget.getBoundingClientRect()
    drag.current = { x: e.clientX, y: e.clientY, width: r.width, id: e.pointerId, allowed, dir: null }
    samples.current = [{ x: e.clientX, t: e.timeStamp }]
  }

  function track(e: PointerEvent<HTMLElement>) {
    const d = drag.current
    if (!d || e.pointerId !== d.id) return
    const dx = e.clientX - d.x
    const t = e.timeStamp
    samples.current = [...samples.current.filter((p) => t - p.t <= SPEED_WINDOW_MS * 2), { x: e.clientX, t }]
    if (!d.dir) {
      const intent = swipeIntent(dx, e.clientY - d.y, d.allowed)
      if (!intent) return
      if (intent === 'other') {
        drag.current = null
        return
      }
      d.dir = intent
      swallowClick.current = true
      try {
        // Le doigt peut passer sur les boutons du rail sans que le geste se perde.
        e.currentTarget.setPointerCapture(e.pointerId)
      } catch {
        // Doigt déjà levé : le relâcher arrive tout de suite.
      }
      // Depuis le viseur : vers la gauche le profil, vers la droite la carte ; depuis la carte : retour.
      const m: PaneMove =
        pane === 'carte' ? { pane: 'carte', opening: false } : { pane: intent === 'left' ? 'profil' : 'carte', opening: true }
      moving.current = m
      setMove(m)
    }
    const m = moving.current
    if (!m) return
    const fraction = swipeOffset(dx, d.width, d.dir) / Math.max(1, d.width)
    place(m, m.opening ? fraction : 1 - fraction, false)
  }

  function release(e: PointerEvent<HTMLElement>, cancelled: boolean) {
    const d = drag.current
    if (!d || e.pointerId !== d.id) return
    drag.current = null
    const m = moving.current
    if (!d.dir || !m) return
    samples.current.push({ x: e.clientX, t: e.timeStamp })
    const commit = !cancelled && opensOnRelease(e.clientX - d.x, releaseSpeed(samples.current, d.dir), d.width, d.dir)
    settle(m, commit)
  }

  const swallow = (e: MouseEvent) => {
    if (!swallowClick.current) return
    swallowClick.current = false
    e.preventDefault()
    e.stopPropagation()
  }

  /** Gestes sur le viseur (son `<main>`). */
  const handlers = {
    onPointerDown: (e: PointerEvent<HTMLElement>) => {
      swallowClick.current = false
      if (pane !== 'viseur' || !enabled || moving.current || !e.isPrimary || e.button !== 0 || !freeToSwipe(e.target)) return
      // Rien depuis un écran voisin en cours de préparation (caché) ni depuis la barre.
      if ((e.target as Element).closest?.('.shell-pane')) return
      begin(e, ['left', 'right'])
    },
    onPointerMove: track,
    onPointerUp: (e: PointerEvent<HTMLElement>) => release(e, false),
    onPointerCancel: (e: PointerEvent<HTMLElement>) => release(e, true),
    onClickCapture: swallow,
  }

  /** Bande du bord droit de la carte : seul endroit d'où le doigt la referme. */
  const edgeHandlers = {
    onPointerDown: (e: PointerEvent<HTMLElement>) => {
      swallowClick.current = false
      if (pane !== 'carte' || moving.current || !e.isPrimary || e.button !== 0) return
      const r = e.currentTarget.closest('.screen')?.getBoundingClientRect()
      if (r && !inRightEdge(e.clientX, r.left, r.width)) return
      e.stopPropagation()
      begin(e, ['left'])
    },
    onPointerMove: track,
    onPointerUp: (e: PointerEvent<HTMLElement>) => release(e, false),
    onPointerCancel: (e: PointerEvent<HTMLElement>) => release(e, true),
    onClickCapture: swallow,
  }

  // Le prochain appui repart de zéro (un glissement sans clic ne doit pas avaler le suivant).
  useEffect(() => {
    if (!move) swallowClick.current = false
  }, [move])

  return { move, handlers, edgeHandlers, goTo }
}
