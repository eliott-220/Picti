import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react'
import { VISIBILITY_SHORT, VISIBLE_BY, type Visibility } from '../data/types'
import { useGlassButton } from '../glassButtons'
import { haptic } from '../native'
import { readAway } from './awayLook'
import { Icon, type IconName } from './Icon'
import {
  columnLift,
  columnOrder,
  columnPosition,
  labelOpacity,
  liftFor,
  LONG_PRESS_MS,
  MODE_STEP,
  modeLook,
  neighborVisibility,
  SLIDE_START_PX,
  visibilityAtLift,
} from './shutterModes'
import { VISIBILITY_ICON } from './visibilityIcon'

/** Retour de la colonne en place au relâchement (ms), aligné sur la transition CSS. */
const SNAP_MS = 180

interface Press {
  pointer: number
  y: number
  from: Visibility
  /** Choix du mode ouvert (appui long ou glissement vers le haut) : relâcher ne prend pas de photo. */
  open: boolean
  timer: ReturnType<typeof setTimeout> | undefined
}

/** Colonne affichée : mode de départ, montée suivie (px), retour en place après le relâchement. */
interface Pick {
  from: Visibility
  lift: number
  closing: boolean
}

/**
 * Bouton rouge de la barre du bas. Sur le viseur, un appui prend la photo ; un appui long (ou un
 * glissement vers le haut) fait grossir le bouton et montre, flous, les deux autres modes en colonne
 * au-dessus de lui : glisser vers le haut fait descendre dans le cercle le mode du dessus, redescendre le
 * fait repartir, son nom (Public, Amis, Privé) à côté du cercle. Relâcher garde ce mode sans prendre de
 * photo. Au clavier : flèches. `reduced` (carte, profil, menu ouvert) : réduit à la taille des icônes
 * voisines, un appui ramène au viseur (`onHome`), sans photo ni choix du mode. Dans l'app iOS 26+, un
 * vrai bouton natif l'affiche (le bouton web, transparent, reste celui qu'on touche).
 */
export function Shutter({
  visibility,
  onVisibility,
  onShoot,
  disabled,
  warn,
  label,
  reduced = false,
  onHome,
  iconSize = 36,
  awayIcon,
  awayIconSize = iconSize,
}: {
  visibility: Visibility
  /** Mode choisi, une fois le doigt relâché (seulement s'il a changé). */
  onVisibility: (v: Visibility) => void
  onShoot: () => void
  disabled: boolean
  /** Reproduire, hors de la vue de l'originale. */
  warn: boolean
  label: string
  reduced?: boolean
  onHome?: () => void
  /** Taille du symbole dans le cercle (px). */
  iconSize?: number
  /**
   * Barre du bas (0.23.2) : symbole du bouton hors du viseur (appareil photo) ; il remplace celui du mode
   * au rythme de `--away` (posé par la barre, et par le glissé des écrans) — depuis 0.23.3 sans rond
   * rouge, de la taille des autres pictogrammes (`awayIconSize`). Dans l'app iOS 26+, il est dessiné dans
   * la pilule (`BottomBar`) ; le natif du bouton n'y garde que le rond et le symbole du mode, qui s'effacent.
   */
  awayIcon?: IconName
  awayIconSize?: number
}) {
  const ref = useRef<HTMLButtonElement>(null)
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
  // Bouton désactivé ou réduit en plein appui (prise de vue en cours, carte qui s'ouvre) : il ne
  // reçoit plus le relâchement.
  const idle = disabled || reduced
  useEffect(() => {
    if (!idle || !press.current) return
    clearTimeout(press.current.timer)
    press.current = null
    pickRef.current = null
    setPick(null)
  }, [idle])

  const centered = pick ? visibilityAtLift(pick.from, pick.lift) : visibility
  const fullLabel = reduced ? 'Revenir au viseur' : `${label} · visible par ${VISIBLE_BY[centered]}`
  const native = useGlassButton(ref, {
    icon: VISIBILITY_ICON[centered],
    label: fullLabel,
    disabled: disabled && !reduced,
    shutter: { warn: warn && !reduced },
    away: awayIcon ? () => readAway(ref.current) : undefined,
  })

  function open(p: Press, lift = 0) {
    if (p.open || press.current !== p) return
    p.open = true
    clearTimeout(p.timer)
    swallowClick.current = true
    update({ from: p.from, lift, closing: false })
    haptic('tick')
  }

  function onPointerDown(e: PointerEvent<HTMLButtonElement>) {
    swallowClick.current = false
    if (idle || e.button !== 0 || press.current) return
    // Une colonne qui finissait de se refermer laisse la place au nouvel appui.
    clearTimeout(snapTimer.current)
    if (pickRef.current) update(null)
    try {
      e.currentTarget.setPointerCapture(e.pointerId)
    } catch {
      // Pointeur déjà relâché : le glissement ne sera pas suivi hors du bouton.
    }
    const p: Press = { pointer: e.pointerId, y: e.clientY, from: visibility, open: false, timer: undefined }
    p.timer = setTimeout(() => open(p), LONG_PRESS_MS)
    press.current = p
  }

  function onPointerMove(e: PointerEvent<HTMLButtonElement>) {
    const p = press.current
    if (!p || e.pointerId !== p.pointer) return
    const dy = e.clientY - p.y
    if (!p.open) {
      if (-dy >= SLIDE_START_PX) open(p, columnLift(dy))
      return
    }
    const current = pickRef.current
    if (!current) return
    const lift = columnLift(dy)
    if (visibilityAtLift(p.from, lift) !== visibilityAtLift(p.from, current.lift)) haptic('tick')
    update({ ...current, lift })
  }

  function end(e: PointerEvent<HTMLButtonElement>) {
    const p = press.current
    if (!p || e.pointerId !== p.pointer) return
    clearTimeout(p.timer)
    press.current = null
    const current = pickRef.current
    if (!p.open || !current) return
    // Le symbole le plus proche du centre s'y range, les autres s'effacent, le nom disparaît.
    const chosen = visibilityAtLift(p.from, current.lift)
    update({ ...current, lift: liftFor(chosen, p.from), closing: true })
    snapTimer.current = setTimeout(() => update(null), SNAP_MS)
    if (chosen !== visibility) onVisibility(chosen)
  }

  function onKeyDown(e: KeyboardEvent<HTMLButtonElement>) {
    swallowClick.current = false
    if (reduced) return
    const dir = e.key === 'ArrowUp' || e.key === 'ArrowRight' ? 1 : e.key === 'ArrowDown' || e.key === 'ArrowLeft' ? -1 : 0
    if (!dir) return
    e.preventDefault()
    const v = neighborVisibility(visibility, dir)
    if (v !== visibility) onVisibility(v)
  }

  return (
    <div className="shutter-group">
      <button
        ref={ref}
        type="button"
        className={`shutter ${warn && !reduced ? 'warn' : ''} ${pick && !pick.closing ? 'picking' : ''}${native ? ' glass-native' : ''}`}
        onClick={() => {
          if (swallowClick.current) {
            swallowClick.current = false
            return
          }
          if (reduced) onHome?.()
          else onShoot()
        }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={end}
        onPointerCancel={end}
        onKeyDown={onKeyDown}
        onContextMenu={(e) => e.preventDefault()}
        disabled={disabled && !reduced}
        aria-label={fullLabel}
        aria-description={
          reduced ? undefined : 'Restez appuyé puis glissez vers le haut (ou flèches du clavier) pour choisir Public, Amis ou Privé'
        }
      >
        {/* Pendant le choix, le symbole du cercle est celui de la colonne. */}
        {awayIcon ? (
          <>
            <span className="shutter-icon mode">{!pick && <Icon name={VISIBILITY_ICON[visibility]} size={iconSize} />}</span>
            <span className="shutter-icon away">
              <Icon name={awayIcon} size={awayIconSize} />
            </span>
          </>
        ) : (
          !pick && <Icon name={VISIBILITY_ICON[visibility]} size={iconSize} />
        )}
        {warn && !reduced && (
          <span className="shutter-warn" aria-hidden="true">
            <Icon name="warning" size={16} />
          </span>
        )}
      </button>
      {pick && (
        <div className={`shutter-strip ${pick.closing ? 'closing' : ''}`} aria-hidden="true">
          {columnOrder(pick.from).map((v) => {
            const distance = columnPosition(v, pick.from, pick.lift) / MODE_STEP
            const look = modeLook(distance)
            return (
              <span
                key={v}
                className={`shutter-strip-item ${v === centered ? 'centered' : ''}`}
                style={{
                  transform: `translate(-50%, -50%) translateY(${distance * MODE_STEP}px) scale(${look.scale})`,
                  opacity: pick.closing && v !== centered ? 0 : look.opacity,
                  filter: `blur(${look.blur}px) drop-shadow(0 1px 4px rgb(0 0 0 / 0.7))`,
                }}
              >
                <Icon name={VISIBILITY_ICON[v]} size={Math.round(iconSize * 1.25)} />
              </span>
            )
          })}
          {!pick.closing && (
            <span
              className="shutter-label"
              style={{ opacity: labelOpacity(columnPosition(centered, pick.from, pick.lift) / MODE_STEP) }}
            >
              {VISIBILITY_SHORT[centered]}
            </span>
          )}
        </div>
      )}
    </div>
  )
}
