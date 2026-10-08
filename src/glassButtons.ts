// Vrais boutons Liquid Glass dans l'app iOS 26+ (plugin natif `GlassButtons`, depuis 0.19.0).
// Un `RoundButton`, un `IconButton`, une `Chip` ou un sélecteur segmenté reste à sa place dans la
// page, transparent mais toujours actif : c'est lui qui reçoit les touches (appuis, défilement,
// VoiceOver). Le natif ne fait que l'affichage : à chaque image, la position du bouton web lui est
// envoyée ; dans une zone qui défile, le bouton natif est posé dans la vue de défilement d'iOS qui
// la porte et défile avec le texte sans attendre le JS. Ailleurs (site, Android, iOS < 26) : rien.

import { useEffect, useRef, useState, useSyncExternalStore, type RefObject } from 'react'
import type { IconName } from './components/Icon'
import { GlassButtons, platform, type GlassButtonSpec } from './native'

/** Symbole SF de chaque icône proposée en verre (les autres restent des boutons web). */
const SYMBOLS: Partial<Record<IconName, string>> = {
  back: 'chevron.left',
  bell: 'bell',
  pin: 'mappin.and.ellipse',
  filter: 'line.3.horizontal.decrease',
  search: 'magnifyingglass',
  flipCamera: 'arrow.triangle.2.circlepath.camera',
  plus: 'plus',
  grid: 'square.grid.2x2',
  close: 'xmark',
  pencil: 'pencil',
  /** « Ma position » sur la carte : la flèche de localisation d'iOS. */
  compass: 'location',
  /** Nord de la carte (tourné avec elle). */
  arrow: 'location.north.fill',
  qr: 'qrcode',
}

export function glassSymbol(icon: IconName): string | null {
  return SYMBOLS[icon] ?? null
}

/** Texte de la pastille, comme `.round-badge` (« 99+ » au-delà). */
export function badgeText(count?: number): string | null {
  if (!count) return null
  return count > 99 ? '99+' : String(count)
}

export interface GlassOptions {
  /** Bouton rond : son icône (traduite en symbole SF). */
  icon?: IconName
  /** Pastille : son texte. */
  title?: string
  /** Sélecteur segmenté : ses choix, et celui qui est sélectionné. */
  segments?: string[]
  selected?: number
  /** Libellé lu par VoiceOver. */
  label: string
  badge?: number
  dim?: boolean
  active?: boolean
  disabled?: boolean
  rotation?: number
  color?: string
}

type Rect = { x: number; y: number; width: number; height: number }

/** Zone qui défile autour d'un bouton : sa clé, sa partie visible à l'écran et son défilement. */
export interface ScrollerPort {
  key: number
  port: Rect
  left: number
  top: number
}

/** Ce bouton a-t-il un équivalent natif (icône connue, texte ou choix) ? */
export function glassable(options: GlassOptions): boolean {
  return !!options.segments?.length || !!options.title || (!!options.icon && !!glassSymbol(options.icon))
}

/**
 * Description envoyée au natif ; cadre arrondi au demi-point pour ne renvoyer que les vrais
 * déplacements. Null pour une icône sans symbole.
 */
export function toSpec(
  id: string,
  rect: Rect,
  options: GlassOptions,
  onTop: boolean,
  scroller: ScrollerPort | null = null,
): GlassButtonSpec | null {
  if (!glassable(options)) return null
  const half = (v: number) => Math.round(v * 2) / 2
  const segments = options.segments?.length ? options.segments : null
  return {
    id,
    kind: segments ? 'segmented' : 'button',
    symbol: !segments && options.icon ? glassSymbol(options.icon) : null,
    title: !segments ? (options.title ?? null) : null,
    segments,
    selected: segments ? (options.selected ?? -1) : -1,
    label: options.label,
    x: half(rect.x),
    y: half(rect.y),
    width: half(rect.width),
    height: half(rect.height),
    scroller: scroller
      ? {
          key: scroller.key,
          x: half(scroller.port.x),
          y: half(scroller.port.y),
          width: half(scroller.port.width),
          height: half(scroller.port.height),
        }
      : null,
    // Position dans le contenu de la zone qui défile (fixe pendant le défilement).
    cx: half(scroller ? rect.x - scroller.port.x + scroller.left : rect.x),
    cy: half(scroller ? rect.y - scroller.port.y + scroller.top : rect.y),
    badge: badgeText(options.badge),
    dim: !!options.dim,
    active: !!options.active,
    disabled: !!options.disabled,
    rotation: half(options.rotation ?? 0),
    color: options.color ?? null,
    visible: onTop && rect.width > 0 && rect.height > 0,
  }
}

// ---------- Disponibilité (une seule question au natif) ----------

let available = false
let asked = false
const subscribers = new Set<() => void>()

function ask() {
  if (asked) return
  asked = true
  if (platform() !== 'ios') return
  GlassButtons.isAvailable()
    .then(({ available: yes }) => {
      if (!yes) return
      available = true
      subscribers.forEach((notify) => notify())
    })
    .catch(() => {})
}

function subscribe(notify: () => void) {
  subscribers.add(notify)
  ask()
  return () => subscribers.delete(notify)
}

// ---------- Zones qui défilent ----------

const scrollerKeys = new WeakMap<HTMLElement, number>()
let lastScrollerKey = 0

function scrollerKey(el: HTMLElement): number {
  let key = scrollerKeys.get(el)
  if (!key) {
    key = ++lastScrollerKey
    scrollerKeys.set(el, key)
  }
  return key
}

/** Ancêtres qui peuvent défiler (`overflow` auto ou scroll), du plus proche au plus lointain. */
function scrollParents(el: HTMLElement): HTMLElement[] {
  const list: HTMLElement[] = []
  for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
    const style = getComputedStyle(p)
    if (/auto|scroll/.test(style.overflowX + style.overflowY)) list.push(p)
  }
  return list
}

/**
 * La plus proche qui défile vraiment (contenu plus grand qu'elle) : iOS ne crée une vue de
 * défilement que pour celles-là.
 */
function activeScroller(parents: HTMLElement[]): ScrollerPort | null {
  const el = parents.find((p) => p.scrollHeight > p.clientHeight + 1 || p.scrollWidth > p.clientWidth + 1)
  if (!el) return null
  const r = el.getBoundingClientRect()
  return {
    key: scrollerKey(el),
    port: { x: r.left + el.clientLeft, y: r.top + el.clientTop, width: el.clientWidth, height: el.clientHeight },
    left: el.scrollLeft,
    top: el.scrollTop,
  }
}

// ---------- Boutons affichés et recopie à chaque image ----------

/** `options` : dernières options du bouton (elles changent à chaque rendu). */
type Entry = { el: HTMLElement; options: () => GlassOptions | null; parents: HTMLElement[] }
const entries = new Map<string, Entry>()
let lastId = 0
let frame = 0
let sent = ''

/**
 * Le bouton web est-il à l'écran et au premier plan (pas sous une feuille, une fiche, un toast…) ?
 * Testé en son centre, ramené dans l'écran : une pastille à moitié sortie de l'écran reste affichée.
 * (Un bouton posé dans une vue de défilement d'iOS est, lui, recouvert et coupé comme la page.)
 */
function onTop(el: HTMLElement, rect: Rect): boolean {
  const w = window.innerWidth
  const h = window.innerHeight
  if (rect.x + rect.width <= 0 || rect.y + rect.height <= 0 || rect.x >= w || rect.y >= h) return false
  const x = Math.min(Math.max(rect.x + rect.width / 2, 1), w - 1)
  const y = Math.min(Math.max(rect.y + rect.height / 2, 1), h - 1)
  const hit = document.elementFromPoint(x, y)
  return !!hit && (hit === el || el.contains(hit))
}

function tick() {
  frame = 0
  const pageVisible = document.visibilityState === 'visible'
  const specs: GlassButtonSpec[] = []
  for (const [id, { el, options, parents }] of entries) {
    const current = options()
    if (!current) continue
    const rect = el.getBoundingClientRect()
    const spec = toSpec(id, rect, current, pageVisible && onTop(el, rect), activeScroller(parents))
    if (spec) specs.push(spec)
  }
  const json = JSON.stringify(specs)
  if (json !== sent) {
    sent = json
    GlassButtons.set({ buttons: specs }).catch(() => {})
  }
  if (entries.size) frame = requestAnimationFrame(tick)
}

function schedule() {
  if (!frame) frame = requestAnimationFrame(tick)
}

/**
 * Double le bouton web `ref` d'un vrai bouton Liquid Glass dans l'app iOS 26+ (options null :
 * bouton web ordinaire). Renvoie vrai quand le natif l'affiche (le web devient transparent, mais
 * reste celui qu'on touche).
 */
export function useGlassButton(ref: RefObject<HTMLElement | null>, options: GlassOptions | null): boolean {
  const ready = useSyncExternalStore(subscribe, () => available, () => false)
  const enabled = ready && !!options && glassable(options)
  const [id] = useState(() => `glass-${++lastId}`)
  const latest = useRef(options)

  useEffect(() => {
    latest.current = options
  })

  useEffect(() => {
    const el = ref.current
    if (!enabled || !el) return
    entries.set(id, { el, options: () => latest.current, parents: scrollParents(el) })
    schedule()
    return () => {
      entries.delete(id)
      schedule()
    }
  }, [enabled, id, ref])

  return enabled
}
