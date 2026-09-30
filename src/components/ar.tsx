// Composants de réalité augmentée partagés par l'accueil (photos du lieu)
// et la chasse : photo superposée, frise des photos prises au même endroit.

import type { CSSProperties, HTMLAttributes } from 'react'
import { useImageUrl } from '../data/imageUrls'
import { formatDayTime, type GeoPhoto } from '../data/types'
import { formatDistance } from '../geo/geodesy'
import { OVERLAY_W, overlayHeight, photoTime } from './arProjection'
import { Dots } from './Dots'
import { Icon } from './Icon'
import { PhotoTile } from './ui'
import { useSwipe } from './useSwipe'

/** Opacité d'une photo vue de dos : imprimée sur une vitre dépolie. */
export const GLASS_OPACITY = 0.45

/** Saturation d'une photo vue de dos, rapportée à celle de la photo (vitre un peu délavée). */
const GLASS_SATURATION = 0.55

/**
 * Photo superposée au décor réel.
 * - `saturation` : 0 = noir et blanc (photo d'un autre pas encore capturée), 1 = couleur ;
 * - `reveal` : capture en cours, la couleur envahit la photo depuis son centre (≈ 600 ms) ;
 * - `glass` : vue de dos (on l'a dépassée), comme imprimée sur une vitre dépolie — floue,
 *   pâlie, avec un reflet ; l'image est déjà en miroir.
 */
export function ArPhoto({
  photo,
  transform,
  opacity,
  saturation = 1,
  reveal = false,
  glass = false,
  onClick,
  handlers,
}: {
  photo: GeoPhoto
  transform: string
  opacity: number
  saturation?: number
  reveal?: boolean
  glass?: boolean
  onClick?: () => void
  /** Gestes sur la photo (ex. glissement pour passer à la suivante). */
  handlers?: HTMLAttributes<HTMLImageElement>
}) {
  const url = useImageUrl(photo.id, 'full')
  if (!url) return null
  const shown = glass ? opacity * GLASS_OPACITY : opacity
  const tinted = saturation < 1
  const size = { width: OVERLAY_W, height: overlayHeight(photo) }
  // Filtre réglé par variables CSS : un seul filtre, combiné à celui de la vitre.
  const filter = { '--sat': saturation, '--glass-sat': saturation * GLASS_SATURATION } as CSSProperties
  return (
    <>
      <img
        className={`overlay-photo ${tinted ? 'tinted' : ''} ${glass ? 'glass' : ''} ${onClick ? 'clickable' : ''}`}
        src={url}
        alt=""
        {...size}
        style={{ transform, opacity: shown, ...filter }}
        draggable={false}
        onClick={onClick}
        {...handlers}
      />
      {/* Capture : copie en couleur révélée depuis le centre, par-dessus la photo en noir et blanc. */}
      {reveal && (
        <img
          className="overlay-photo overlay-reveal"
          src={url}
          alt=""
          aria-hidden
          {...size}
          style={{ transform, opacity: shown }}
          draggable={false}
        />
      )}
      {/* Reflet de la vitre, par-dessus la photo. */}
      {glass && <div className="overlay-glass" aria-hidden style={{ ...size, transform, opacity }} />}
    </>
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
  distance,
}: {
  items: GeoPhoto[]
  index: number
  onChange: (index: number) => void
  isMine: (p: GeoPhoto) => boolean
  action?: { label: string; onClick: () => void }
  /** Points du nombre de photos (sauf s'ils sont déjà affichés sous la photo). */
  dots?: boolean
  /** Distance au point de vue (m), si connue. */
  distance?: number | null
}) {
  const photo = items[index]
  const step = (s: 1 | -1) => onChange(Math.min(items.length - 1, Math.max(0, index + s)))
  const swipe = useSwipe(step)
  const author = isMine(photo) ? 'Moi' : photo.ownerName || 'Quelqu’un'
  const where = distance != null ? ` · à ${formatDistance(distance)}` : ''
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
        <strong>{formatDayTime(photoTime(photo))}</strong>
        <span>{(index === 0 && items.length > 1 ? `${author} · la plus récente` : author) + where}</span>
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
