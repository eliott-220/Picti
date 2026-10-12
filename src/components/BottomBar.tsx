import { useRef, type Ref } from 'react'
import type { Visibility } from '../data/types'
import { useGlassButton } from '../glassButtons'
import { haptic } from '../native'
import { Icon } from './Icon'
import { Shutter } from './Shutter'

/**
 * Barre flottante du bas (0.23.0, façon Instagram) : pilule décollée des bords, visible sur le viseur,
 * la carte et Mon profil. Gauche : Menu (feuille Explorer) ; centre : le bouton rouge — sur le viseur,
 * grand, il déborde au-dessus de la pilule et prend la photo (appui long : choix du mode) ; ailleurs
 * (`away`), réduit à la taille des icônes voisines, il ramène au viseur ; droite : avatar → Mon profil.
 * Le passage grand ↔ réduit suit `--away` (0 → 1), animé (léger ressort) ou posé par le glissé des
 * écrans (`usePanes`). Dans l'app iOS 26+ : vraie pilule Liquid Glass, Menu et avatar dessinés dedans.
 */
export function BottomBar({
  ref,
  away,
  visibility,
  onVisibility,
  onShoot,
  shootDisabled,
  shutterLabel,
  onHome,
  onMenu,
  menuOpen,
  menuBadge,
  onProfile,
  profileActive,
  profileName,
}: {
  ref?: Ref<HTMLElement>
  /** Hors du viseur (carte, profil, menu ouvert) : bouton rouge réduit, qui ramène au viseur. */
  away: boolean
  visibility: Visibility
  onVisibility: (v: Visibility) => void
  onShoot: () => void
  shootDisabled: boolean
  shutterLabel: string
  onHome: () => void
  onMenu: () => void
  menuOpen: boolean
  /** Demandes d'ami reçues. */
  menuBadge: number
  onProfile: () => void
  profileActive: boolean
  profileName: string
}) {
  const navRef = useRef<HTMLElement | null>(null)
  const menuRef = useRef<HTMLButtonElement>(null)
  const profileRef = useRef<HTMLButtonElement>(null)
  const initial = profileName.trim().charAt(0).toUpperCase() || '?'
  const native = useGlassButton(navRef, {
    label: 'Navigation',
    bar: {
      items: [
        { ref: menuRef, icon: 'grid', badge: menuBadge, active: menuOpen },
        { ref: profileRef, initial, active: profileActive },
      ],
    },
  })
  const setRefs = (el: HTMLElement | null) => {
    navRef.current = el
    if (typeof ref === 'function') ref(el)
    else if (ref) ref.current = el
  }
  return (
    <nav ref={setRefs} className={`bottom-nav${away ? ' away' : ''}${native ? ' glass-native' : ''}`} aria-label="Navigation">
      <button
        ref={menuRef}
        type="button"
        className={`nav-item nav-menu${menuOpen ? ' active' : ''}`}
        aria-label={menuBadge ? `Menu (${menuBadge} demande${menuBadge > 1 ? 's' : ''} d’ami)` : 'Menu'}
        aria-expanded={menuOpen}
        onClick={() => {
          haptic('tick')
          onMenu()
        }}
      >
        <Icon name="grid" size={26} />
        {!!menuBadge && <span className="round-badge">{menuBadge > 99 ? '99+' : menuBadge}</span>}
      </button>
      <div className="nav-shutter">
        <Shutter
          visibility={visibility}
          onVisibility={onVisibility}
          onShoot={onShoot}
          disabled={shootDisabled}
          warn={false}
          label={shutterLabel}
          reduced={away}
          onHome={() => {
            haptic('tick')
            onHome()
          }}
        />
      </div>
      <button
        ref={profileRef}
        type="button"
        className={`nav-item nav-profile${profileActive ? ' active' : ''}`}
        aria-label="Mon profil"
        aria-current={profileActive ? 'page' : undefined}
        onClick={() => {
          haptic('tick')
          onProfile()
        }}
      >
        <span className="nav-avatar" aria-hidden="true">
          {initial}
        </span>
      </button>
    </nav>
  )
}
