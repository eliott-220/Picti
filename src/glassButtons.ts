// Vrais boutons Liquid Glass dans l'app iOS 26+ (plugin natif `GlassButtons`, depuis 0.19.0).
// Un `RoundButton`, un `IconButton`, une `Chip` ou un sélecteur segmenté reste à sa place dans la
// page, transparent mais toujours actif : c'est lui qui reçoit les touches (appuis, défilement,
// VoiceOver). Le natif ne fait que l'affichage : à chaque image, la position du bouton web lui est
// envoyée ; dans une zone qui défile, le bouton natif est posé dans la vue de défilement d'iOS qui
// la porte et défile avec le texte sans attendre le JS. Ailleurs (site, Android, iOS < 26) : rien.

import { useEffect, useRef, useState, useSyncExternalStore, type RefObject } from 'react'
import { awayLook, type Look } from './components/awayLook'
import type { IconName } from './components/Icon'
import { bubbleAlpha, tabTint } from './components/panes'
import { GlassButtons, platform, type GlassBarItemSpec, type GlassBubbleSpec, type GlassButtonSpec } from './native'

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
  map: 'map',
  camera: 'camera.fill',
  /** Modes du bouton rouge (Public · Amis · Privé). */
  globe: 'globe',
  friends: 'person.2.fill',
  lock: 'lock.fill',
  /** « À chasser » du viseur. */
  flag: 'flag',
  settings: 'gearshape',
  more: 'ellipsis',
  share: 'square.and.arrow.up',
}

export function glassSymbol(icon: IconName): string | null {
  return SYMBOLS[icon] ?? null
}

/** Texte de la pastille, comme `.round-badge` (« 99+ » au-delà). */
export function badgeText(count?: number): string | null {
  if (!count) return null
  return count > 99 ? '99+' : String(count)
}

/** Élément de la barre du bas (Menu, avatar) : dessiné par le natif dans la pilule de verre. */
export interface GlassBarItem {
  ref: RefObject<HTMLElement | null>
  icon?: IconName
  /** Symbole SF donné directement (ex. « map.fill » pour l'écran affiché), sinon celui de `icon`. */
  symbol?: string
  /** Avatar : initiale du prénom. */
  initial?: string
  badge?: number
  active?: boolean
  /** Appareil photo du bouton rouge (0.23.3) : n'apparaît que hors du viseur, au rythme de `away`. */
  away?: boolean
  /** Place de l'onglet dans la barre (0.24.0) : sa teinte rouge suit la bulle (`tab`). */
  slot?: number
}

export interface GlassOptions {
  /** Bouton rond : son icône (traduite en symbole SF) ; bouton rouge : le symbole du mode. */
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
  /** Barre du bas (0.23.0) : pilule de verre et ses éléments ; `bubble` : bulle de l'onglet actif (0.24.0). */
  bar?: { items: GlassBarItem[]; bubble?: RefObject<HTMLElement | null> }
  /** Bouton rouge (0.23.0) : cercle rouge et symbole du mode ; `warn` : pastille ⚠. */
  shutter?: { warn?: boolean }
  /**
   * Barre du bas (0.23.3) : éloignement du viseur (`--away`, 0 → 1), lu à chaque image pour suivre
   * l'animation ou le doigt — le rond rouge s'efface, l'appareil photo de la pilule arrive.
   */
  away?: () => number
  /** Barre du bas (0.24.0) : place de la bulle de l'onglet actif (`--tab`), lue à chaque image. */
  tab?: () => number
  /** Opacité du bouton (0.24.0 : fondu de la rangée du zoom), lue à chaque image ; 1 par défaut. */
  fade?: () => number
}

/** Éloignement du viseur, place de la bulle (0.24.0) et « Réduire les animations », lus à chaque image. */
export interface GlassMotion {
  away: number
  reduce: boolean
  tab?: number
}

type Rect = { x: number; y: number; width: number; height: number }

/** Élément de barre et son cadre à l'écran (null : pas encore affiché). */
export type MeasuredBarItem = Omit<GlassBarItem, 'ref'> & { rect: Rect | null }

/** Zone qui défile autour d'un bouton : sa clé, sa partie visible à l'écran et son défilement. */
export interface ScrollerPort {
  key: number
  port: Rect
  left: number
  top: number
}

/** Ce bouton a-t-il un équivalent natif (icône connue, texte ou choix) ? */
export function glassable(options: GlassOptions): boolean {
  if (options.bar) return true
  return !!options.segments?.length || !!options.title || (!!options.icon && !!glassSymbol(options.icon))
}

/** Aspect envoyé au natif : au centième (opacité, échelle) et au demi-degré. */
function roundLook(look: Look): Look {
  const cent = (v: number) => Math.round(v * 100) / 100
  return { alpha: cent(look.alpha), scale: cent(look.scale), angle: Math.round(look.angle * 2) / 2 + 0 }
}

/** Éléments de la barre, cadres relatifs à la pilule (au demi-point) ; ceux sans cadre sont omis. */
export function barItemSpecs(
  bar: Rect,
  items: readonly MeasuredBarItem[],
  motion: GlassMotion = { away: 0, reduce: false },
): GlassBarItemSpec[] {
  const half = (v: number) => Math.round(v * 2) / 2
  const camera = roundLook(awayLook(motion.away, motion.reduce).camera)
  // Teinte de chaque onglet d'après la bulle ; sans elle, celle de l'écran affiché.
  const tint = (it: MeasuredBarItem) =>
    it.slot != null && motion.tab != null ? Math.round(tabTint(it.slot, motion.tab) * 100) / 100 : it.active ? 1 : 0
  return items.flatMap((it) =>
    it.rect && it.rect.width > 0 && it.rect.height > 0
      ? [
          {
            x: half(it.rect.x - bar.x),
            y: half(it.rect.y - bar.y),
            width: half(it.rect.width),
            height: half(it.rect.height),
            symbol: it.symbol ?? (it.icon ? glassSymbol(it.icon) : null),
            initial: it.symbol || it.icon ? null : (it.initial ?? '?'),
            badge: badgeText(it.badge),
            active: !!it.active,
            ...(it.away ? camera : { alpha: 1, scale: 1, angle: 0 }),
            tint: tint(it),
          },
        ]
      : [],
  )
}

/**
 * Bulle de l'onglet actif (0.24.0) : cadre relatif à la pilule (au demi-point) et opacité (au centième,
 * nulle au bouton rouge et sur le viseur). Null si elle n'est pas affichée.
 */
export function bubbleSpec(bar: Rect, bubble: Rect | null, motion: GlassMotion): GlassBubbleSpec | null {
  if (!bubble || bubble.width <= 0 || bubble.height <= 0 || motion.tab == null) return null
  const alpha = Math.round(bubbleAlpha(motion.tab, motion.away) * 100) / 100
  if (alpha <= 0) return null
  const half = (v: number) => Math.round(v * 2) / 2
  return { x: half(bubble.x - bar.x), y: half(bubble.y - bar.y), width: half(bubble.width), height: half(bubble.height), alpha }
}

/** Opacité calculée d'un élément (fondu en cours compris), 1 sans élément. */
export function readOpacity(el: Element | null): number {
  if (!el) return 1
  const v = parseFloat(getComputedStyle(el).opacity)
  return Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 1
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
  items: readonly MeasuredBarItem[] = [],
  motion: GlassMotion = { away: 0, reduce: false },
  bubble: Rect | null = null,
  opacity = 1,
): GlassButtonSpec | null {
  if (!glassable(options)) return null
  const half = (v: number) => Math.round(v * 2) / 2
  const segments = options.segments?.length ? options.segments : null
  const kind = options.bar ? 'bar' : options.shutter ? 'shutter' : segments ? 'segmented' : 'button'
  // Bouton rouge de la barre : rond et symbole du mode selon l'éloignement du viseur.
  const look = options.shutter && options.away ? awayLook(motion.away, motion.reduce) : null
  return {
    id,
    kind,
    items: options.bar ? barItemSpecs(rect, items, motion) : null,
    bubble: options.bar ? bubbleSpec(rect, bubble, motion) : null,
    warn: !!options.shutter?.warn,
    disc: look && roundLook(look.disc),
    look: look && roundLook(look.mode),
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
    visible: onTop && rect.width > 0 && rect.height > 0 && opacity > 0.01,
    opacity: Math.round(Math.min(1, Math.max(0, opacity)) * 100) / 100,
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
/** « Réduire les animations » (iOS le transmet à la page). */
const reducedMotion = typeof window !== 'undefined' ? window.matchMedia?.('(prefers-reduced-motion: reduce)') : undefined

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
    const items = (current.bar?.items ?? []).map(({ ref, ...item }) => ({
      ...item,
      rect: ref.current?.getBoundingClientRect() ?? null,
    }))
    const motion = { away: current.away?.() ?? 0, reduce: !!reducedMotion?.matches, tab: current.tab?.() }
    const bubble = current.bar?.bubble?.current?.getBoundingClientRect() ?? null
    const opacity = current.fade?.() ?? 1
    // Le fondu ne dispense pas du contrôle d'occlusion : une feuille ou un écran caché
    // doit toujours recouvrir le verre natif.
    const top = pageVisible && !el.closest('[inert]') && onTop(el, rect)
    const spec = toSpec(id, rect, current, top, activeScroller(parents), items, motion, bubble, opacity)
    if (spec) specs.push(spec)
  }
  // La pilule de la barre sous ses boutons : le natif empile dans l'ordre reçu.
  specs.sort((a, b) => Number(b.kind === 'bar') - Number(a.kind === 'bar'))
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
