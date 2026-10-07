import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react'
import { VISIBILITIES, VISIBILITY_SHORT, VISIBLE_BY, type Visibility } from '../data/types'
import { Icon } from './Icon'
import { LONG_PRESS_MS, MODE_STEP, modesLeft, SLIDE_START_PX, visibilityAtOffset } from './shutterModes'
import { VISIBILITY_ICON } from './visibilityIcon'

interface Press {
  pointer: number
  x: number
  from: Visibility
  /** Choix du mode ouvert (appui long ou glissement) : relâcher ne prend pas de photo. */
  open: boolean
  timer: ReturnType<typeof setTimeout> | undefined
}

/** Choix en cours : mode de départ, mode visé, bord gauche de la réglette (dans `.shutter-group`). */
interface Pick {
  from: Visibility
  value: Visibility
  left: number
}

/**
 * Déclencheur rouge du viseur. Un appui prend la photo. Un appui long (ou un glissement) ouvre la
 * réglette des modes Public · Amis · Privé : on fait glisser le doigt vers la gauche ou la droite,
 * le symbole du bouton suit, et relâcher garde le mode sans prendre de photo. Au clavier : flèches.
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
  const group = useRef<HTMLDivElement>(null)
  const press = useRef<Press | null>(null)
  const [pick, setPick] = useState<Pick | null>(null)
  const pickRef = useRef<Pick | null>(null)
  // Après un choix de mode, le « click » qui suit le relâchement ne déclenche pas.
  const swallowClick = useRef(false)

  useEffect(() => () => clearTimeout(press.current?.timer), [])
  // Bouton désactivé en plein appui (prise de vue en cours) : il ne reçoit plus le relâchement.
  useEffect(() => {
    if (!disabled || !press.current) return
    clearTimeout(press.current.timer)
    press.current = null
    pickRef.current = null
    setPick(null)
  }, [disabled])

  function update(next: Pick | null) {
    pickRef.current = next
    setPick(next)
  }

  function open(p: Press) {
    if (p.open || press.current !== p) return
    p.open = true
    clearTimeout(p.timer)
    swallowClick.current = true
    const g = group.current?.getBoundingClientRect()
    const centerX = g ? g.left + g.width / 2 : window.innerWidth / 2
    const left = modesLeft(p.from, centerX, window.innerWidth) - (g?.left ?? 0)
    update({ from: p.from, value: p.from, left })
    navigator.vibrate?.(10)
  }

  function onPointerDown(e: PointerEvent<HTMLButtonElement>) {
    swallowClick.current = false
    if (disabled || e.button !== 0 || press.current) return
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
      if (Math.abs(dx) < SLIDE_START_PX) return
      open(p)
    }
    const current = pickRef.current
    if (!current) return
    const value = visibilityAtOffset(p.from, dx)
    if (value === current.value) return
    update({ ...current, value })
    navigator.vibrate?.(10)
  }

  function end(e: PointerEvent<HTMLButtonElement>) {
    const p = press.current
    if (!p || e.pointerId !== p.pointer) return
    clearTimeout(p.timer)
    press.current = null
    const chosen = pickRef.current
    update(null)
    if (p.open && chosen && chosen.value !== visibility) onVisibility(chosen.value)
  }

  function onKeyDown(e: KeyboardEvent<HTMLButtonElement>) {
    swallowClick.current = false
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
    e.preventDefault()
    const v = visibilityAtOffset(visibility, e.key === 'ArrowRight' ? MODE_STEP : -MODE_STEP)
    if (v !== visibility) onVisibility(v)
  }

  const shown = pick?.value ?? visibility
  return (
    <div className="shutter-group" ref={group}>
      {pick && (
        <div className="shutter-picker" style={{ left: pick.left }} aria-hidden="true">
          <p className="shutter-picker-caption">Visible par {VISIBLE_BY[pick.value]}</p>
          <div className="shutter-modes">
            {VISIBILITIES.map((v) => (
              <span key={v} className={`shutter-mode ${v} ${v === pick.value ? 'selected' : ''}`} style={{ width: MODE_STEP }}>
                <Icon name={VISIBILITY_ICON[v]} size={22} />
                {VISIBILITY_SHORT[v]}
              </span>
            ))}
          </div>
        </div>
      )}
      <button
        type="button"
        className={`shutter ${warn ? 'warn' : ''} ${pick ? 'picking' : ''}`}
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
        aria-label={`${label} · visible par ${VISIBLE_BY[shown]}`}
        aria-description="Restez appuyé puis glissez à gauche ou à droite (ou flèches du clavier) pour choisir Public, Amis ou Privé"
      >
        <Icon name={VISIBILITY_ICON[shown]} size={36} />
        {warn && (
          <span className="shutter-warn" aria-hidden="true">
            <Icon name="warning" size={16} />
          </span>
        )}
      </button>
    </div>
  )
}
