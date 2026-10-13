import { useEffect, useLayoutEffect, useRef, useState, type MouseEvent, type PointerEvent, type RefObject } from 'react'
import { awayOf, neighborPane, paneMove, paneOffset, pushOffsets, tabOf, type Pane, type PaneMove, type SidePane } from './panes'
import {
  flickDirection,
  freeToSwipe,
  inRightEdge,
  opensOnRelease,
  PUSH_EASING,
  PUSH_MS,
  releaseSpeed,
  SLIDE_MS,
  SPEED_WINDOW_MS,
  swipeIntent,
  swipeOffset,
  type SwipeDirection,
} from './swipeOpen'

export type { Pane, PaneMove } from './panes'

interface Drag {
  x: number
  y: number
  width: number
  id: number
  /** Sens permis : ceux qui ont un écran voisin (sur la carte, depuis le bord droit : vers la gauche). */
  allowed: readonly SwipeDirection[]
  dir: SwipeDirection | null
  /**
   * Geste commencé pendant qu'un écran finit d'arriver (0.24.0) : il ne déplace rien, mais un coup de
   * doigt prolonge le mouvement vers l'écran suivant une fois celui-ci arrivé (comme Instagram).
   */
  queued?: boolean
}

/** Fin du mouvement : les styles posés à la main laissent la place à ceux de l'écran affiché. */
function clearPaneStyles(panes: (HTMLElement | null)[], bar: HTMLElement | null) {
  for (const el of panes) {
    if (!el) continue
    el.style.transition = ''
    el.style.visibility = ''
    el.style.transform = ''
    el.style.display = ''
    el.style.zIndex = ''
  }
  if (bar) {
    bar.classList.remove('dragging')
    bar.style.removeProperty('--away')
    bar.style.removeProperty('--tab')
    bar.style.removeProperty('--tab-lag')
  }
}

/** Durée de la course d'un mouvement : poussée entre deux écrans (0.23.3), sinon glissé du viseur. */
const moveMs = (m: PaneMove) => (m.push ? PUSH_MS : SLIDE_MS)

/**
 * Glissés entre les cinq écrans de la barre (0.23.1 ; `panes.ts`) : sur un écran, glisser le doigt fait
 * venir l'écran voisin sous le doigt (vers la gauche celui de droite, vers la droite celui de gauche) ;
 * entre deux écrans qui ne sont pas le viseur, le nouveau pousse l'ancien (0.23.3, les deux sous le doigt) ;
 * sur la carte, le doigt la déplace et seul un glissé partant de la bande du bord droit mène à l'écran
 * voisin. Lâché au-delà d'un tiers de l'écran (ou d'un geste vif), l'écran finit sa course puis `onCommit`
 * change d'adresse ; sinon il repart. Pendant le geste rien n'est redessiné par React : les écrans bougent
 * par leur style, et la barre reçoit `--away` (0 sur le viseur, 1 ailleurs) et `--tab` (place de la bulle
 * de l'onglet actif, 0.24.0). `goTo` fait la même animation sans le doigt (boutons de la barre, bouton
 * rouge réduit, menu).
 *
 * 0.24.0 : un petit coup de doigt rapide suffit (`opensOnRelease`) — l'écran finit seul, doigt levé ; un
 * second doigt (pincement) n'est jamais un glissé ; un coup de doigt donné pendant qu'un écran finit
 * d'arriver le prolonge vers le suivant, une page à la fois.
 */
export function usePanes({
  pane,
  enabled,
  onCommit,
  panes,
  bar,
}: {
  pane: Pane
  /** Glissés permis (pas de prise en cours, de feuille sur le viseur…). */
  enabled: boolean
  onCommit: (target: Pane) => void
  panes: Record<SidePane, RefObject<HTMLElement | null>>
  bar: RefObject<HTMLElement | null>
}) {
  // Mouvement en cours (geste ou animation) : les écrans concernés doivent être montés et visibles.
  const [move, setMove] = useState<PaneMove | null>(null)
  const drag = useRef<Drag | null>(null)
  const samples = useRef<{ x: number; t: number }[]>([])
  const moving = useRef<PaneMove | null>(null)
  // Dernière position posée pendant le geste : reposée si l'écran vient d'être monté.
  const lastShown = useRef(0)
  const swallowClick = useRef(false)
  const timer = useRef(0)
  const onCommitRef = useRef(onCommit)
  useEffect(() => {
    onCommitRef.current = onCommit
  })
  useEffect(() => () => clearTimeout(timer.current), [])

  const all = () => [panes.carte.current, panes.amis.current, panes.photos.current, panes.profil.current]
  const elOf = (p: Pane) => (p === 'viseur' ? null : panes[p].current)

  /**
   * Place l'écran qui glisse (`shown` 0 → 1), l'écran dessous (poussé, s'il y a lieu) et la barre, directement
   * dans leur style.
   */
  function place(m: PaneMove, shown: number, animate: boolean) {
    lastShown.current = shown
    const transition = animate ? (m.push ? `transform ${PUSH_MS}ms ${PUSH_EASING}` : `transform ${SLIDE_MS}ms ease-out`) : 'none'
    const push = m.push && m.under !== 'viseur' ? pushOffsets(m.under, m.pane, shown) : null
    const el = elOf(m.pane)
    if (el) {
      el.style.transition = transition
      el.style.display = 'block'
      el.style.visibility = 'visible'
      el.style.zIndex = m.arriving ? '27' : ''
      el.style.transform = `translateX(${push ? push.to : paneOffset(m.pane, shown)}%)`
    }
    const under = elOf(m.under)
    if (under) {
      under.style.transition = push ? transition : 'none'
      under.style.display = 'block'
      under.style.visibility = 'visible'
      under.style.transform = push ? `translateX(${push.from}%)` : 'none'
    }
    const b = bar.current
    if (b) {
      b.classList.toggle('dragging', !animate)
      b.style.setProperty('--away', String(awayOf(m, shown)))
      // Bulle de l'onglet actif (0.24.0) : elle suit le doigt ; `--tab-lag`, plus lent, l'étire en route.
      const tab = String(tabOf(m, shown))
      b.style.setProperty('--tab', tab)
      b.style.setProperty('--tab-lag', tab)
    }
  }

  const clearStyles = () => clearPaneStyles(all(), bar.current)

  function end() {
    clearStyles()
    // Retour annulé : rien à enchaîner. Course engagée : l'écran suivant attend le changement d'adresse.
    if (!committing.current) queuedTarget.current = null
    moving.current = null
    committing.current = false
    setMove(null)
  }

  // Mouvement en route vers un nouvel écran (course finale engagée) : un nouveau geste peut le prolonger.
  const committing = useRef(false)
  // Écran suivant demandé par un coup de doigt pendant la course : rejoint dès l'arrivée.
  const queuedTarget = useRef<Pane | null>(null)

  /** Finit la course ; `commit` : jusqu'au nouvel écran (puis changement d'adresse), sinon retour. */
  function settle(m: PaneMove, commit: boolean) {
    committing.current = commit
    place(m, commit === m.arriving ? 1 : 0, true)
    clearTimeout(timer.current)
    timer.current = window.setTimeout(() => {
      if (!commit) return end()
      onCommitRef.current(m.to)
      // L'écran affiché change avec l'adresse (effet plus bas) ; sinon, filet de sécurité.
      timer.current = window.setTimeout(end, 600)
    }, moveMs(m))
  }

  // Nouvel écran affiché (adresse changée) : ses styles de classe prennent le relais, avant d'être peints.
  useLayoutEffect(() => {
    // Coup de doigt donné pendant la course : on continue aussitôt vers l'écran suivant.
    const next = queuedTarget.current
    queuedTarget.current = null
    if (next && next !== pane) requestAnimationFrame(() => goToRef.current(next))
    if (!moving.current) return
    clearTimeout(timer.current)
    clearPaneStyles([panes.carte.current, panes.amis.current, panes.photos.current, panes.profil.current], bar.current)
    moving.current = null
    committing.current = false
    setMove(null)
  }, [pane, panes, bar])

  // Écran tout juste monté pendant un geste : posé sous le doigt avant d'être peint (`place` ne lit que
  // des références : celle d'un rendu précédent convient).
  const placeRef = useRef(place)
  useEffect(() => {
    placeRef.current = place
  })
  useLayoutEffect(() => {
    if (move && drag.current?.dir) placeRef.current(move, lastShown.current, false)
  }, [move])

  const goToRef = useRef(goTo)
  useEffect(() => {
    goToRef.current = goTo
  })

  /** Va à un écran de la barre avec la même animation qu'au doigt. */
  function goTo(target: Pane) {
    const m = paneMove(pane, target)
    if (!m || moving.current) return
    moving.current = m
    setMove(m)
    // Un rendu pour monter les écrans, puis la course.
    requestAnimationFrame(() => {
      place(m, m.arriving ? 0 : 1, false)
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
    if (d.queued) {
      if (!d.dir) {
        const intent = swipeIntent(dx, e.clientY - d.y, ['left', 'right'])
        if (intent === 'other') drag.current = null
        else if (intent) d.dir = intent
      }
      return
    }
    if (!d.dir) {
      const intent = swipeIntent(dx, e.clientY - d.y, d.allowed)
      if (!intent) return
      const to = intent === 'other' ? null : neighborPane(pane, intent)
      const m = to && paneMove(pane, to)
      if (!m) {
        drag.current = null
        return
      }
      d.dir = intent as SwipeDirection
      swallowClick.current = true
      try {
        // Le doigt peut passer sur des boutons sans que le geste se perde.
        e.currentTarget.setPointerCapture(e.pointerId)
      } catch {
        // Doigt déjà levé : le relâcher arrive tout de suite.
      }
      moving.current = m
      setMove(m)
    }
    const m = moving.current
    if (!m) return
    const fraction = swipeOffset(dx, d.width, d.dir) / Math.max(1, d.width)
    place(m, m.arriving ? fraction : 1 - fraction, false)
  }

  function release(e: PointerEvent<HTMLElement>, cancelled: boolean) {
    const d = drag.current
    if (!d || e.pointerId !== d.id) return
    drag.current = null
    if (d.queued) {
      // Coup de doigt donné pendant la course vers `to` : il emmène à l'écran voisin de `to` (une page à la
      // fois) — dès l'arrivée si la course n'est pas finie, sinon tout de suite. Sur la carte, seul le bord
      // droit en fait sortir : on n'y enchaîne pas au-delà.
      if (cancelled || !d.dir) return
      samples.current.push({ x: e.clientX, t: e.timeStamp })
      const dx = e.clientX - d.x
      const dir = flickDirection(dx, releaseSpeed(samples.current, dx < 0 ? 'left' : 'right'), [d.dir])
      if (!dir) return
      const m = moving.current
      if (m && committing.current) {
        const next = neighborPane(m.to, dir)
        if (next && m.to !== 'carte') queuedTarget.current = next
      } else if (!m && pane !== 'carte') {
        const next = neighborPane(pane, dir)
        if (next) goTo(next)
      }
      return
    }
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

  const directions = (['left', 'right'] as const).filter((dir) => neighborPane(pane, dir))

  /** Un second doigt (pincement pour zoomer, 0.22.1) : ce n'est jamais un glissé de page. */
  function secondFinger() {
    const d = drag.current
    if (!d) return
    drag.current = null
    const m = moving.current
    if (d.dir && m && !d.queued) settle(m, false)
  }

  /** Gestes sur les écrans (le `<main>` du viseur, qui les contient tous) ; la carte : voir `edgeHandlers`. */
  const handlers = {
    onPointerDown: (e: PointerEvent<HTMLElement>) => {
      swallowClick.current = false
      if (!e.isPrimary) return secondFinger()
      // Écran qui finit d'arriver : un nouveau geste peut prolonger le mouvement (pas depuis la carte).
      if (moving.current && committing.current && !drag.current && enabled && e.button === 0 && freeToSwipe(e.target)) {
        if (moving.current.to === 'carte') return
        drag.current = { x: e.clientX, y: e.clientY, width: 0, id: e.pointerId, allowed: ['left', 'right'], dir: null, queued: true }
        samples.current = [{ x: e.clientX, t: e.timeStamp }]
        swallowClick.current = true
        return
      }
      if (pane === 'carte' || !enabled || moving.current || e.button !== 0 || !freeToSwipe(e.target)) return
      // Depuis le viseur, rien ne part d'un écran voisin préparé caché.
      if (pane === 'viseur' && (e.target as Element).closest?.('.shell-pane')) return
      begin(e, directions)
    },
    onPointerMove: track,
    onPointerUp: (e: PointerEvent<HTMLElement>) => release(e, false),
    onPointerCancel: (e: PointerEvent<HTMLElement>) => release(e, true),
    onClickCapture: swallow,
  }

  /** Bande du bord droit de la carte : seul endroit d'où le doigt mène à l'écran voisin (Amis). */
  const edgeHandlers = {
    onPointerDown: (e: PointerEvent<HTMLElement>) => {
      swallowClick.current = false
      if (!e.isPrimary) return secondFinger()
      if (pane !== 'carte' || moving.current || e.button !== 0) return
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
