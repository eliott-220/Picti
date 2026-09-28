// Composants de réalité augmentée partagés par l'accueil (photos du lieu)
// et la chasse : photo superposée, frise des photos prises au même endroit.

import type { HTMLAttributes } from 'react'
import { useImageUrl } from '../data/imageUrls'
import { formatDate, type GeoPhoto } from '../data/types'
import { OVERLAY_W, overlayHeight, photoTime } from './arProjection'
import { Dots } from './Dots'
import { Icon } from './Icon'
import { PhotoTile } from './ui'
import { useSwipe } from './useSwipe'

/** Photo superposée au décor réel. */
export function ArPhoto({
  photo,
  transform,
  opacity,
  onClick,
  handlers,
}: {
  photo: GeoPhoto
  transform: string
  opacity: number
  onClick?: () => void
  /** Gestes sur la photo (ex. glissement pour passer à la suivante). */
  handlers?: HTMLAttributes<HTMLImageElement>
}) {
  const url = useImageUrl(photo.id, 'full')
  if (!url) return null
  return (
    <img
      className={`overlay-photo ${onClick ? 'clickable' : ''}`}
      src={url}
      alt=""
      width={OVERLAY_W}
      height={overlayHeight(photo)}
      style={{ transform, opacity }}
      draggable={false}
      onClick={onClick}
      {...handlers}
    />
  )
}

/**
 * Frise des photos prises au même endroit : la plus récente d'abord,
 * flèches (ou glissement) pour remonter le temps, points pour le nombre.
 */
export function SpotTimeline({
  items,
  index,
  onChange,
  isMine,
  action,
  dots = true,
}: {
  items: GeoPhoto[]
  index: number
  onChange: (index: number) => void
  isMine: (p: GeoPhoto) => boolean
  action?: { label: string; onClick: () => void }
  /** Points du nombre de photos (sauf s'ils sont déjà affichés sous la photo). */
  dots?: boolean
}) {
  const photo = items[index]
  const step = (s: 1 | -1) => onChange(Math.min(items.length - 1, Math.max(0, index + s)))
  const swipe = useSwipe(step)
  const author = isMine(photo) ? 'Moi' : photo.ownerName || 'Quelqu’un'
  return (
    <div
      className="timeline"
      onPointerDown={(e) => {
        // La frise gère son propre glissement (pas celui du mode démo de la chasse).
        e.stopPropagation()
        swipe.onPointerDown(e)
      }}
      onPointerUp={swipe.onPointerUp}
      role="group"
      aria-label="Photos prises à cet endroit"
    >
      <button
        type="button"
        className="timeline-step"
        onClick={() => step(-1)}
        disabled={index === 0}
        aria-label="Photo plus récente"
      >
        <Icon name="back" size={20} />
      </button>
      <PhotoTile id={photo.id} size="mini" />
      <div className="timeline-text">
        <strong>{formatDate(photoTime(photo))}</strong>
        <span>{index === 0 && items.length > 1 ? `${author} · la plus récente` : author}</span>
        {dots && <Dots count={items.length} index={index} className="light" />}
      </div>
      {action && (
        <button type="button" className="btn small" onClick={action.onClick}>
          {action.label}
        </button>
      )}
      <button
        type="button"
        className="timeline-step next"
        onClick={() => step(1)}
        disabled={index >= items.length - 1}
        aria-label="Photo plus ancienne"
      >
        <Icon name="back" size={20} />
      </button>
    </div>
  )
}
