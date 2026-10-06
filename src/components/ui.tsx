import { useEffect, type ReactNode } from 'react'
import { useImageUrl } from '../data/imageUrls'
import { usePhotoInColor } from '../data/photoColor'
import { navigate } from '../router'
import { Dots } from './Dots'
import { Icon, type IconName } from './Icon'

export function RoundButton({
  icon,
  label,
  onClick,
  dim = false,
  className = '',
  badge,
}: {
  icon: IconName
  label: string
  onClick?: () => void
  dim?: boolean
  className?: string
  /** Pastille de compteur (ex. photos à chasser à proximité). */
  badge?: number
}) {
  return (
    <button type="button" className={`round-btn ${dim ? 'dim' : ''} ${className}`} onClick={onClick} aria-label={label} title={label}>
      <Icon name={icon} />
      {!!badge && <span className="round-badge">{badge > 99 ? '99+' : badge}</span>}
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
}) {
  const url = useImageUrl(id, 'thumb')
  // Photo d'un autre pas encore capturée : noir et blanc.
  const inColor = usePhotoInColor(id, owner)
  const tile = (
    <button type="button" className={`tile tile-${size}`} onClick={onClick} aria-label={label}>
      {url ? <img src={url} alt="" loading="lazy" className={inColor ? undefined : 'mono'} /> : <span className="tile-placeholder" />}
      {badge && <span className="tile-badge">{badge}</span>}
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
      {stack > 1 && <Dots count={stack} index={0} className="light tile-dots" />}
    </button>
  )
  // Pile : les autres photos du même endroit dépassent derrière.
  return stack > 1 ? <div className={`tile-stack tile-stack-${size}`}>{tile}</div> : tile
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
