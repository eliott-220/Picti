import { useEffect, type ReactNode } from 'react'
import { useImageUrl } from '../data/imageUrls'
import { usePhotoInColor } from '../data/photoColor'
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
}: {
  id: string
  /** Auteur, si l'appelant le connaît mieux que le store (carte) : règle de couleur. */
  owner?: string
  /** Nom accessible (sinon la légende). */
  label?: string
  onClick?: () => void
  caption?: ReactNode
  badge?: ReactNode
  size?: 'grid' | 'strip' | 'mini'
  /** Nombre de photos empilées (prises au même endroit) : points en bas. */
  stack?: number
}) {
  const url = useImageUrl(id, 'thumb')
  // Photo d'un autre pas encore capturée : noir et blanc.
  const inColor = usePhotoInColor(id, owner)
  const tile = (
    <button type="button" className={`tile tile-${size}`} onClick={onClick} aria-label={label}>
      {url ? <img src={url} alt="" loading="lazy" className={inColor ? undefined : 'mono'} /> : <span className="tile-placeholder" />}
      {badge && <span className="tile-badge">{badge}</span>}
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

export function AvatarRow({ people }: { people: { id: string; name: string; detail?: string }[] }) {
  return (
    <div className="avatars">
      {people.map((p) => (
        <div className="avatar-item" key={p.id}>
          <Avatar name={p.name} />
          <strong>{p.name || 'Sans nom'}</strong>
          {p.detail && <span>{p.detail}</span>}
        </div>
      ))}
    </div>
  )
}
