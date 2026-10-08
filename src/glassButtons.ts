// Vrais boutons Liquid Glass dans l'app iOS 26+ (plugin natif `GlassButtons`, depuis 0.19.0).
// Un `RoundButton glass` reste à sa place dans la page mais devient transparent ; à chaque image,
// sa position est recopiée vers un bouton natif posé au-dessus de la page, et un appui sur ce
// bouton déclenche le `click()` du bouton web. Ailleurs (site, Android, iOS < 26) : rien ne change.

import { useEffect, useRef, useState, useSyncExternalStore, type RefObject } from 'react'
import type { IconName } from './components/Icon'
import { GlassButtons, platform, type GlassButtonSpec } from './native'

/** Symbole SF de chaque icône proposée en verre (les autres restent des boutons web). */
const SYMBOLS: Partial<Record<IconName, string>> = {
  bell: 'bell',
  pin: 'mappin.and.ellipse',
  filter: 'line.3.horizontal.decrease',
  search: 'magnifyingglass',
  flipCamera: 'arrow.triangle.2.circlepath.camera',
  plus: 'plus',
  grid: 'square.grid.2x2',
  close: 'xmark',
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
  icon: IconName
  label: string
  badge?: number
  dim?: boolean
  active?: boolean
}

type Rect = { x: number; y: number; width: number; height: number }

/**
 * Description envoyée au natif ; cadre arrondi au demi-point pour ne renvoyer que les vrais
 * déplacements. Null pour une icône sans symbole.
 */
export function toSpec(id: string, rect: Rect, options: GlassOptions, onTop: boolean): GlassButtonSpec | null {
  const symbol = glassSymbol(options.icon)
  if (!symbol) return null
  const half = (v: number) => Math.round(v * 2) / 2
  return {
    id,
    symbol,
    label: options.label,
    x: half(rect.x),
    y: half(rect.y),
    width: half(rect.width),
    height: half(rect.height),
    badge: badgeText(options.badge),
    dim: !!options.dim,
    active: !!options.active,
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
      void GlassButtons.addListener('tap', ({ id }) => entries.get(id)?.el.click())
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

// ---------- Boutons affichés et recopie à chaque image ----------

/** `options` : dernières options du bouton (elles changent à chaque rendu). */
type Entry = { el: HTMLElement; options: () => GlassOptions | null }
const entries = new Map<string, Entry>()
let lastId = 0
let frame = 0
let sent = ''

/** Le bouton web est-il au premier plan (pas sous une feuille, une fiche, un toast…) ? */
function onTop(el: HTMLElement, rect: Rect): boolean {
  const hit = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2)
  return !!hit && (hit === el || el.contains(hit))
}

function tick() {
  frame = 0
  const pageVisible = document.visibilityState === 'visible'
  const specs: GlassButtonSpec[] = []
  for (const [id, { el, options }] of entries) {
    const current = options()
    if (!current) continue
    const rect = el.getBoundingClientRect()
    const spec = toSpec(id, rect, current, pageVisible && onTop(el, rect))
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
 * bouton web ordinaire). Renvoie vrai quand le bouton natif le remplace (le web devient transparent).
 */
export function useGlassButton(ref: RefObject<HTMLElement | null>, options: GlassOptions | null): boolean {
  const ready = useSyncExternalStore(subscribe, () => available, () => false)
  const enabled = ready && !!options && !!glassSymbol(options.icon)
  const [id] = useState(() => `glass-${++lastId}`)
  const latest = useRef(options)

  useEffect(() => {
    latest.current = options
  })

  useEffect(() => {
    const el = ref.current
    if (!enabled || !el) return
    entries.set(id, { el, options: () => latest.current })
    schedule()
    return () => {
      entries.delete(id)
      schedule()
    }
  }, [enabled, id, ref])

  return enabled
}
