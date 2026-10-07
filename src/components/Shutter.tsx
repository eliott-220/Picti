import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react'
import { VISIBILITIES, VISIBILITY_SHORT, VISIBLE_BY, type Visibility } from '../data/types'
import { Icon } from './Icon'
import {
  labelOpacity,
  LONG_PRESS_MS,
  MODE_STEP,
  modeLook,
  modePosition,
  neighborVisibility,
  offsetFor,
  SLIDE_START_PX,
  stripOffset,
  visibilityAtOffset,
} from './shutterModes'
import { VISIBILITY_ICON } from './visibilityIcon'

/** Retour du carrousel en place au relâchement (ms), aligné sur la transition CSS. */
const SNAP_MS = 180

interface Press {
  pointer: number
  x: number
  from: Visibility
  /** Carrousel ouvert (appui long ou glissement) : relâcher ne prend pas de photo. */
  open: boolean
  timer: ReturnType<typeof setTimeout> | undefined
}

/** Carrousel affiché : mode de départ, décalage suivi (px), retour en place après le relâchement. */
interface Pick {
  from: Visibility
  offset: number
  closing: boolean
}

/**
 * Déclencheur rouge du viseur. Un appui prend la photo. Un appui long (ou un glissement) fait du
 * bouton un carrousel : il grossit, les symboles des autres modes apparaissent, flous, à gauche et à
 * droite ; ils suivent le doigt et celui qui entre dans le cercle devient net, son nom (Public,
 * Amis, Privé) au-dessus. Relâcher garde ce mode sans prendre de photo. Au clavier : flèches.
 */
export function Shutter({
  visibility,
  onVisibility,
  onShoot,
  disabled,
  warn,
  label,
}: {
  visibility: Visibility
  /** Mode choisi, une fois le doigt relâché (seulement s'il a changé). */
  onVisibility: (v: Visibility) => void
  onShoot: () => void
  disabled: boolean
  /** Reproduire, hors de la vue de l'originale. */
  warn: boolean
  label: string
}) {
  const press = useRef<Press | null>(null)
  const [pick, setPick] = useState<Pick | null>(null)
  const pickRef = useRef<Pick | null>(null)
  const snapTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  // Après un choix de mode, le « click » qui suit le relâchement ne déclenche pas.
  const swallowClick = useRef(false)

  function update(next: Pick | null) {
    pickRef.current = next
    setPick(next)
  }

  useEffect(
    () => () => {
      clearTimeout(press.current?.timer)
      clearTimeout(snapTimer.current)
    },
    [],
  )
  // Bouton désactivé en plein appui (prise de vue en cours) : il ne reçoit plus le relâchement.
  useEffect(() => {
    if (!disabled || !press.current) return
    clearTimeout(press.current.timer)
    press.current = null
    pickRef.current = null
    setPick(null)
  }, [disabled])

  function open(p: Press, offset = 0) {
    if (p.open || press.current !== p) return
    p.open = true
    clearTimeout(p.timer)
    swallowClick.current = true
    update({ from: p.from, offset: stripOffset(p.from, offset), closing: false })
    navigator.vibrate?.(10)
  }

  function onPointerDown(e: PointerEvent<HTMLButtonElement>) {
    swallowClick.current = false
    if (disabled || e.button !== 0 || press.current) return
    // Un carrousel qui finissait de se refermer laisse la place au nouvel appui.
    clearTimeout(snapTimer.current)
    if (pickRef.current) update(null)
    try {
      e.currentTarget.setPointerCapture(e.pointerId)
    } catch {
      // Pointeur déjà relâché : le glissement ne sera pas suivi hors du bouton.
    }
    const p: Press = { pointer: e.pointerId, x: e.clientX, from: visibility, open: false, timer: undefined }
    p.timer = setTimeout(() => open(p), LONG_PRESS_MS)
    press.current = p
  }

  function onPointerMove(e: PointerEvent<HTMLButtonElement>) {
    const p = press.current
    if (!p || e.pointerId !== p.pointer) return
    const dx = e.clientX - p.x
    if (!p.open) {
      if (Math.abs(dx) >= SLIDE_START_PX) open(p, dx)
      return
    }
    const current = pickRef.current
    if (!current) return
    const offset = stripOffset(p.from, dx)
    if (visibilityAtOffset(p.from, offset) !== visibilityAtOffset(p.from, current.offset)) navigator.vibrate?.(10)
    update({ ...current, offset })
  }

  function end(e: PointerEvent<HTMLButtonElement>) {
    const p = press.current
    if (!p || e.pointerId !== p.pointer) return
    clearTimeout(p.timer)
    press.current = null
    const current = pickRef.current
    if (!p.open || !current) return
    // Le symbole le plus proche du centre s'y range, les autres s'effacent, le nom disparaît.
    const chosen = visibilityAtOffset(p.from, current.offset)
    update({ ...current, offset: offsetFor(chosen, p.from), closing: true })
    snapTimer.current = setTimeout(() => update(null), SNAP_MS)
    if (chosen !== visibility) onVisibility(chosen)
  }

  function onKeyDown(e: KeyboardEvent<HTMLButtonElement>) {
    swallowClick.current = false
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
    e.preventDefault()
    const v = neighborVisibility(visibility, e.key === 'ArrowRight' ? 1 : -1)
    if (v !== visibility) onVisibility(v)
  }

  const centered = pick ? visibilityAtOffset(pick.from, pick.offset) : visibility
  return (
    <div className="shutter-group">
      <button
        type="button"
        className={`shutter ${warn ? 'warn' : ''} ${pick && !pick.closing ? 'picking' : ''}`}
        onClick={() => {
          if (swallowClick.current) {
            swallowClick.current = false
            return
          }
          onShoot()
        }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={end}
        onPointerCancel={end}
        onKeyDown={onKeyDown}
        onContextMenu={(e) => e.preventDefault()}
        disabled={disabled}
        aria-label={`${label} · visible par ${VISIBLE_BY[centered]}`}
        aria-description="Restez appuyé puis glissez à gauche ou à droite (ou flèches du clavier) pour choisir Public, Amis ou Privé"
      >
        {/* Pendant le choix, le symbole du cercle est celui du carrousel. */}
        {!pick && <Icon name={VISIBILITY_ICON[visibility]} size={36} />}
        {warn && (
          <span className="shutter-warn" aria-hidden="true">
            <Icon name="warning" size={16} />
          </span>
        )}
      </button>
      {pick && (
        <div className={`shutter-strip ${pick.closing ? 'closing' : ''}`} aria-hidden="true">
          {VISIBILITIES.map((v) => {
            const distance = modePosition(v, pick.from, pick.offset) / MODE_STEP
            const look = modeLook(distance)
            return (
              <span
                key={v}
                className={`shutter-strip-item ${v === centered ? 'centered' : ''}`}
                style={{
                  transform: `translate(-50%, -50%) translateX(${distance * MODE_STEP}px) scale(${look.scale})`,
                  opacity: pick.closing && v !== centered ? 0 : look.opacity,
                  filter: `blur(${look.blur}px) drop-shadow(0 1px 4px rgb(0 0 0 / 0.7))`,
                }}
              >
                <Icon name={VISIBILITY_ICON[v]} size={36} />
              </span>
            )
          })}
          {!pick.closing && (
            <span
              className="shutter-label"
              style={{ opacity: labelOpacity(modePosition(centered, pick.from, pick.offset) / MODE_STEP) }}
            >
              {VISIBILITY_SHORT[centered]}
            </span>
          )}
        </div>
      )}
    </div>
  )
}
