import { useRef, type Ref, type RefObject } from 'react'
import type { Visibility } from '../data/types'
import { useGlassButton } from '../glassButtons'
import { haptic } from '../native'
import { readAway } from './awayLook'
import { Icon, type IconName } from './Icon'
import type { Pane } from './panes'
import { Shutter } from './Shutter'

/** Boutons de la barre, de gauche à droite (le bouton rouge est au milieu, entre Amis et Mes photos). */
const TABS: { pane: Exclude<Pane, 'viseur'>; icon: IconName; label: string; symbol: string; activeSymbol: string }[] = [
  { pane: 'carte', icon: 'map', label: 'Carte', symbol: 'map', activeSymbol: 'map.fill' },
  { pane: 'amis', icon: 'friends', label: 'Amis', symbol: 'person.2', activeSymbol: 'person.2.fill' },
  { pane: 'photos', icon: 'image', label: 'Mes photos', symbol: 'photo.on.rectangle', activeSymbol: 'photo.fill.on.rectangle.fill' },
  { pane: 'profil', icon: 'user', label: 'Mon profil', symbol: 'person', activeSymbol: 'person.fill' },
]

/**
 * Barre flottante du bas (0.23.0, cinq boutons depuis 0.23.1, façon Instagram) : pilule décollée des
 * côtés, à la hauteur de celle d'Instagram (0.23.2), sur les cinq écrans qu'elle ouvre — Carte · Amis ·
 * bouton rouge (viseur) · Mes photos · Profil, dans l'ordre où ils sont côte à côte (on passe de l'un au
 * voisin en glissant). Le bouton rouge reste dans la pilule, de la taille des autres boutons (0.23.2) :
 * sur le viseur, rond rouge et symbole du mode, appui = photo (appui long : choix du mode) ; ailleurs
 * (`away`), plus de rond rouge (0.23.3) : un appareil photo seul, comme les autres pictogrammes, appui =
 * retour au viseur — le passage suit `--away` (0 → 1), animé ou posé par le glissé des écrans
 * (`usePanes`). Dans l'app iOS 26+ : vraie pilule Liquid Glass, pictogrammes dessinés dedans (l'écran
 * affiché en plein, en rouge ; l'appareil photo aussi, au rythme de `--away`).
 */
export function BottomBar({
  ref,
  pane,
  away,
  visibility,
  onVisibility,
  onShoot,
  shootDisabled,
  shutterLabel,
  onHome,
  onOpen,
  friendsBadge,
}: {
  ref?: Ref<HTMLElement>
  /** Écran affiché (bouton en plein). */
  pane: Pane
  /** Hors du viseur (ou menu ouvert) : bouton rouge réduit, qui ramène au viseur. */
  away: boolean
  visibility: Visibility
  onVisibility: (v: Visibility) => void
  onShoot: () => void
  shootDisabled: boolean
  shutterLabel: string
  onHome: () => void
  onOpen: (pane: Exclude<Pane, 'viseur'>) => void
  /** Notifications non lues et demandes d'ami reçues (pastille sur Amis). */
  friendsBadge: number
}) {
  const navRef = useRef<HTMLElement | null>(null)
  // Place du bouton rouge : l'appareil photo y est dessiné dans la pilule native hors du viseur (0.23.3).
  const shutterSlot = useRef<HTMLDivElement>(null)
  const tabRefs = {
    carte: useRef<HTMLButtonElement>(null),
    amis: useRef<HTMLButtonElement>(null),
    photos: useRef<HTMLButtonElement>(null),
    profil: useRef<HTMLButtonElement>(null),
  }
  const native = useGlassButton(navRef, {
    label: 'Navigation',
    bar: {
      items: [
        ...TABS.map((t) => ({
          ref: tabRefs[t.pane] as RefObject<HTMLElement | null>,
          symbol: pane === t.pane ? t.activeSymbol : t.symbol,
          active: pane === t.pane,
          badge: t.pane === 'amis' ? friendsBadge : undefined,
        })),
        // Hors du viseur : appareil photo comme les autres pictogrammes (même taille, même couleur).
        { ref: shutterSlot as RefObject<HTMLElement | null>, symbol: 'camera', away: true },
      ],
    },
    away: () => readAway(navRef.current),
  })
  const setRefs = (el: HTMLElement | null) => {
    navRef.current = el
    if (typeof ref === 'function') ref(el)
    else if (ref) ref.current = el
  }
  const tab = (t: (typeof TABS)[number]) => {
    const badge = t.pane === 'amis' ? friendsBadge : 0
    return (
      <button
        key={t.pane}
        ref={tabRefs[t.pane]}
        type="button"
        className={`nav-item nav-${t.pane}${pane === t.pane ? ' active' : ''}`}
        aria-label={badge ? `${t.label} (${badge} nouveauté${badge > 1 ? 's' : ''})` : t.label}
        aria-current={pane === t.pane ? 'page' : undefined}
        onClick={() => {
          haptic('tick')
          onOpen(t.pane)
        }}
      >
        <Icon name={t.icon} size={26} />
        {!!badge && <span className="round-badge">{badge > 99 ? '99+' : badge}</span>}
      </button>
    )
  }
  return (
    <nav ref={setRefs} className={`bottom-nav${away ? ' away' : ''}${native ? ' glass-native' : ''}`} aria-label="Navigation">
      {tab(TABS[0])}
      {tab(TABS[1])}
      <div ref={shutterSlot} className="nav-shutter">
        <Shutter
          visibility={visibility}
          onVisibility={onVisibility}
          onShoot={onShoot}
          disabled={shootDisabled}
          warn={false}
          label={shutterLabel}
          reduced={away}
          iconSize={24}
          awayIcon="camera"
          awayIconSize={26}
          onHome={() => {
            haptic('tick')
            onHome()
          }}
        />
      </div>
      {tab(TABS[2])}
      {tab(TABS[3])}
    </nav>
  )
}
