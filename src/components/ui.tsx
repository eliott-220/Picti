import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { useImageUrl } from '../data/imageUrls'
import { usePhotoInColor } from '../data/photoColor'
import { VISIBLE_BY, type GeoPhoto, type Visibility } from '../data/types'
import { cycle } from '../geo/spots'
import { useGlassButton } from '../glassButtons'
import { navigate } from '../router'
import { Dots } from './Dots'
import { Icon, type IconName } from './Icon'
import { useCardSwipe } from './useCardSwipe'
import { VISIBILITY_ICON } from './visibilityIcon'

export function RoundButton({
  icon,
  label,
  onClick,
  dim = false,
  className = '',
  badge,
  glass = true,
  iconRotation,
  tint,
}: {
  icon: IconName
  label: string
  onClick?: () => void
  dim?: boolean
  className?: string
  /** Pastille de compteur (ex. photos à chasser à proximité). */
  badge?: number
  /** Dans l'app iOS 26+ : remplacé par un vrai bouton Liquid Glass natif (`src/glassButtons.ts`). */
  glass?: boolean
  /** Icône tournée (degrés), ex. le nord de la carte. */
  iconRotation?: number
  /** Couleur de l'icône du bouton natif (celle du web vient du CSS). */
  tint?: string
}) {
  const ref = useRef<HTMLButtonElement>(null)
  const native = useGlassButton(
    ref,
    glass
      ? { icon, label, badge, dim, active: className.split(' ').includes('active'), rotation: iconRotation, color: tint }
      : null,
  )
  return (
    <button
      ref={ref}
      type="button"
      className={`round-btn ${dim ? 'dim' : ''} ${className}${native ? ' glass-native' : ''}`}
      onClick={onClick}
      aria-label={label}
      title={label}
    >
      {iconRotation == null ? (
        <Icon name={icon} />
      ) : (
        <span style={{ transform: `rotate(${iconRotation}deg)` }}>
          <Icon name={icon} />
        </span>
      )}
      {!!badge && <span className="round-badge">{badge > 99 ? '99+' : badge}</span>}
    </button>
  )
}

/**
 * Pastille de choix (filtres, visibilité, tri, onglets) ; dans l'app iOS 26+, vraie pastille en
 * verre (la sélectionnée en rouge).
 */
export function Chip({
  label,
  selected,
  onClick,
  disabled,
  role = 'radio',
}: {
  label: string
  selected: boolean
  onClick?: () => void
  disabled?: boolean
  /** `radio` dans un `radiogroup`, `tab` dans une `tablist`. */
  role?: 'radio' | 'tab'
}) {
  const ref = useRef<HTMLButtonElement>(null)
  const native = useGlassButton(ref, { title: label, label, active: selected, disabled })
  return (
    <button
      ref={ref}
      type="button"
      role={role}
      aria-checked={role === 'radio' ? selected : undefined}
      aria-selected={role === 'tab' ? selected : undefined}
      className={`chip ${selected ? 'selected' : ''}${native ? ' glass-native' : ''}`}
      disabled={disabled}
      onClick={onClick}
    >
      {label}
    </button>
  )
}

/**
 * Bouton icône sans fond (fermer une feuille, QR code, refuser…) ; dans l'app iOS 26+, remplacé
 * par un vrai bouton Liquid Glass natif comme `RoundButton`.
 */
export function IconButton({
  icon,
  label,
  onClick,
  className = '',
  disabled,
  active,
  expanded,
}: {
  icon: IconName
  label: string
  onClick?: () => void
  className?: string
  disabled?: boolean
  /** Bouton enfoncé (ex. QR code affiché). */
  active?: boolean
  /** `aria-expanded` d'un bouton qui déplie un contenu. */
  expanded?: boolean
}) {
  const ref = useRef<HTMLButtonElement>(null)
  const native = useGlassButton(ref, { icon, label, active, disabled })
  return (
    <button
      ref={ref}
      type="button"
      className={`icon-btn ${className}${active ? ' active' : ''}${native ? ' glass-native' : ''}`}
      onClick={onClick}
      aria-label={label}
      aria-expanded={expanded}
      disabled={disabled}
    >
      <Icon name={icon} />
    </button>
  )
}

export function Sheet({ onClose, children, label }: { onClose: () => void; children: ReactNode; label: string }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  return (
    <div className="sheet-layer">
      <button type="button" className="sheet-backdrop" aria-label="Fermer" onClick={onClose} />
      <section className="sheet" role="dialog" aria-modal="true" aria-label={label}>
        {children}
      </section>
    </div>
  )
}

export function PhotoTile({
  id,
  onClick,
  caption,
  badge,
  size = 'grid',
  label,
  stack = 1,
  owner,
  likes,
  version = false,
  visibility,
  stackIndex = 0,
  swipe,
  under,
}: {
  id: string
  /** Auteur, si l'appelant le connaît mieux que le store (carte) : règle de couleur. */
  owner?: string
  /** Nom accessible (sinon la légende). */
  label?: string
  onClick?: () => void
  caption?: ReactNode
  badge?: ReactNode
  size?: 'grid' | 'strip' | 'mini' | 'wide'
  /** Nombre de photos empilées (prises au même endroit) : points en bas. */
  stack?: number
  /** Nombre de likes, affiché en haut à droite (rien sous 1). */
  likes?: number
  /** Reproduction d'une autre photo : symbole ↻. */
  version?: boolean
  /** Visibilité (Mes photos) : symbole du mode, comme au déclencheur, dans le coin. */
  visibility?: Visibility
  /** Pile glissable (`PhotoTilePile`) : rang de la photo affichée (points en bas). */
  stackIndex?: number
  /** Pile glissable : déplacement et gestes de la vignette du dessus (`useCardSwipe`). */
  swipe?: { style: CSSProperties; handlers: ReturnType<typeof useCardSwipe>['handlers'] }
  /** Pile glissable : la photo qui apparaît dessous pendant le glissement. */
  under?: ReactNode
}) {
  const url = useImageUrl(id, 'thumb')
  // Photo d'un autre pas encore capturée : noir et blanc.
  const inColor = usePhotoInColor(id, owner)
  const tile = (
    <button
      type="button"
      className={`tile tile-${size}${swipe ? ' tile-swipe' : ''}`}
      onClick={onClick}
      aria-label={label}
      style={swipe?.style}
      {...swipe?.handlers}
    >
      {url ? <img src={url} alt="" loading="lazy" className={inColor ? undefined : 'mono'} /> : <span className="tile-placeholder" />}
      {badge && <span className="tile-badge">{badge}</span>}
      {visibility && (
        <span className="tile-visibility" role="img" aria-label={`Visible par ${VISIBLE_BY[visibility]}`}>
          <Icon name={VISIBILITY_ICON[visibility]} size={18} />
        </span>
      )}
      {(version || !!likes) && (
        <span className="tile-meta">
          {version && <span aria-label="Reproduction">↻</span>}
          {!!likes && (
            <span aria-label={`${likes} like${likes > 1 ? 's' : ''}`}>
              <Icon name="heart" size={12} /> {likes}
            </span>
          )}
        </span>
      )}
      {caption && <span className="tile-caption">{caption}</span>}
      {stack > 1 && <Dots count={stack} index={stackIndex} className="light tile-dots" />}
    </button>
  )
  // Pile : les autres photos du même endroit dépassent derrière.
  return stack > 1 ? (
    <div className={`tile-stack tile-stack-${size}`}>
      {under}
      {tile}
    </div>
  ) : (
    tile
  )
}

/**
 * Photos d'un même lieu dans une grille (Mes photos, profil public) : une pile qu'on fait glisser
 * pour passer à la photo suivante (vers la gauche) ou précédente (vers la droite), comme les piles
 * du viseur ; la photo suivante apparaît dessous et les points suivent. Appui : la photo affichée.
 */
export function PhotoTilePile({
  photos,
  onOpen,
  showVisibility = false,
}: {
  photos: GeoPhoto[]
  onOpen: (photo: GeoPhoto) => void
  /** Mes photos : symbole de la visibilité de la photo affichée. */
  showVisibility?: boolean
}) {
  const n = photos.length
  const [index, setIndex] = useState(0)
  const i = Math.min(index, n - 1)
  const swipe = useCardSwipe((step) => setIndex(cycle(i, step, n)))
  const p = photos[i]
  // Pendant le glissement : celle qu'on va découvrir, selon le sens du geste.
  const next = n > 1 && swipe.dx !== 0 ? photos[cycle(i, swipe.dx > 0 ? -1 : 1, n)] : null
  return (
    <PhotoTile
      id={p.id}
      owner={p.owner}
      stack={n}
      stackIndex={i}
      likes={p.likesCount}
      version={p.versionOf != null}
      visibility={showVisibility ? p.visibility : undefined}
      label={n > 1 ? `${n} photos au même endroit (${i + 1} sur ${n}), glisser pour passer de l’une à l’autre` : p.title || undefined}
      onClick={() => onOpen(p)}
      swipe={n > 1 ? { style: { transform: swipe.transform, transition: swipe.transition }, handlers: swipe.handlers } : undefined}
      under={
        next && (
          <div className="tile-under" inert>
            <PhotoTile
              id={next.id}
              owner={next.owner}
              likes={next.likesCount}
              version={next.versionOf != null}
              visibility={showVisibility ? next.visibility : undefined}
            />
          </div>
        )
      }
    />
  )
}

export function EmptyState({ icon, children }: { icon: IconName; children: ReactNode }) {
  return (
    <div className="empty">
      <Icon name={icon} size={28} />
      <p>{children}</p>
    </div>
  )
}

/** Petite flèche pointant vers un cap (0° = haut de l'écran). */
export function DirectionArrow({ deg, size = 20 }: { deg: number; size?: number }) {
  return (
    <span className="dir-arrow" style={{ transform: `rotate(${deg}deg)` }}>
      <Icon name="arrow" size={size} />
    </span>
  )
}

/** Pastille d'un utilisateur : initiale du prénom (pas encore de photo de profil). */
export function Avatar({ name, size = 64 }: { name: string; size?: number }) {
  const initial = name.trim().charAt(0).toUpperCase() || '?'
  return (
    <span className="avatar" style={{ width: size, height: size, fontSize: size * 0.42 }} aria-hidden="true">
      {initial}
    </span>
  )
}

/** Rangée de personnes (chasseurs, proies) ; `onOpen` : appui = son profil public. */
export function AvatarRow({
  people,
  onOpen,
}: {
  people: { id: string; name: string; detail?: string }[]
  onOpen?: (id: string) => void
}) {
  return (
    <div className="avatars">
      {people.map((p) => {
        const content = (
          <>
            <Avatar name={p.name} />
            <strong>{p.name || 'Sans nom'}</strong>
            {p.detail && <span>{p.detail}</span>}
          </>
        )
        return onOpen ? (
          <button
            type="button"
            className="avatar-item"
            key={p.id}
            onClick={() => onOpen(p.id)}
            aria-label={`${p.name || 'Sans nom'}${p.detail ? `, ${p.detail}` : ''} : voir son profil`}
          >
            {content}
          </button>
        ) : (
          <div className="avatar-item" key={p.id}>
            {content}
          </div>
        )
      })}
    </div>
  )
}

/** Personne d'une liste (amis, demandes, recherche) : avatar et nom, appui = son profil public. */
export function PersonLink({ id, name, detail }: { id: string; name: string; detail?: string }) {
  return (
    <button
      type="button"
      className="person-link"
      onClick={() => navigate(`/personne/${id}`)}
      aria-label={`${name || 'Sans nom'}${detail ? `, ${detail}` : ''} : voir son profil`}
    >
      <Avatar name={name} size={44} />
      <span className="friend-text">
        <strong>{name || 'Sans nom'}</strong>
        {detail && <span>{detail}</span>}
      </span>
    </button>
  )
}

/** Vignette seule, non cliquable (à placer dans un bouton) ; même règle de couleur que `PhotoTile`. */
export function Thumb({ id, owner, className = '' }: { id: string; owner?: string; className?: string }) {
  const url = useImageUrl(id, 'thumb')
  const inColor = usePhotoInColor(id, owner)
  return (
    <span className={`thumb ${className}`} aria-hidden="true">
      {url ? <img src={url} alt="" className={inColor ? undefined : 'mono'} /> : <span className="tile-placeholder" />}
    </span>
  )
}
