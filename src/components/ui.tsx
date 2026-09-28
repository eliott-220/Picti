import { useEffect, type ReactNode } from 'react'
import { useImageUrl } from '../data/imageUrls'
import { Icon, type IconName } from './Icon'

export function RoundButton({
  icon,
  label,
  onClick,
  dim = false,
  className = '',
}: {
  icon: IconName
  label: string
  onClick?: () => void
  dim?: boolean
  className?: string
}) {
  return (
    <button type="button" className={`round-btn ${dim ? 'dim' : ''} ${className}`} onClick={onClick} aria-label={label} title={label}>
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
}: {
  id: string
  onClick?: () => void
  caption?: ReactNode
  badge?: ReactNode
  size?: 'grid' | 'strip'
}) {
  const url = useImageUrl(id, 'thumb')
  return (
    <button type="button" className={`tile tile-${size}`} onClick={onClick}>
      {url ? <img src={url} alt="" loading="lazy" /> : <span className="tile-placeholder" />}
      {badge && <span className="tile-badge">{badge}</span>}
      {caption && <span className="tile-caption">{caption}</span>}
    </button>
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
