// Composants de réalité augmentée partagés par l'accueil (photos du lieu)
// et la chasse : photo superposée, capture par agrandissement, frise des
// photos prises au même endroit.

import { useEffect, useState, type CSSProperties, type HTMLAttributes } from 'react'
import { useImageUrl } from '../data/imageUrls'
import { formatDayTime, type GeoPhoto } from '../data/types'
import { CAPTURE } from '../geo/capture'
import { formatDistance } from '../geo/geodesy'
import { OVERLAY_W, overlayHeight, photoTime } from './arProjection'
import { Dots } from './Dots'
import { Icon } from './Icon'
import { PhotoTile } from './ui'
import type { CaptureState } from './useCapture'
import { useSwipe } from './useSwipe'

/** Opacité d'une photo vue de dos : imprimée sur une vitre dépolie. */
export const GLASS_OPACITY = 0.45

/** Épaisseur de la surbrillance à l'écran (px), quelle que soit la distance. */
const SHINE_PX = 4

/** Saturation d'une photo vue de dos, rapportée à celle de la photo (vitre un peu délavée). */
const GLASS_SATURATION = 0.55

/** Arrondi des coins de la carte à l'écran (px), sans dépasser cette part de sa largeur. */
const CARD_RADIUS = { px: 12, max: 0.06 }

/**
 * Variables CSS d'une carte affichée à l'échelle `scale` (`overlayScale`, px d'écran par px de
 * rendu) : cadre, arrondi et flou gardent la même taille à l'écran quelle que soit la distance.
 */
function cardVars(scale: number, blur = 0): CSSProperties {
  const px = 1 / Math.max(scale, 0.05)
  return {
    '--px': px,
    '--radius': `${Math.min(CARD_RADIUS.px * px, CARD_RADIUS.max * OVERLAY_W)}px`,
    '--near-blur': `${Math.min(blur * px, 160)}px`,
  } as CSSProperties
}

/**
 * Photo superposée au décor réel, comme une carte (cadre blanc, coins arrondis, ombre légère).
 * - `saturation` : 0 = noir et blanc (photo d'un autre pas encore capturée), 1 = couleur ;
 * - en couleur (la mienne ou capturée), de face : surbrillance animée autour de la photo ;
 * - `glass` : vue de dos (on l'a dépassée), comme imprimée sur une vitre dépolie — floue,
 *   pâlie, avec un reflet ; l'image est déjà en miroir ;
 * - `blur` : à moins de 2 m de son plan, elle se floute en s'effaçant (px à l'écran).
 */
export function ArPhoto({
  photo,
  transform,
  opacity,
  saturation = 1,
  glass = false,
  blur = 0,
  scale = 1,
  onClick,
  handlers,
}: {
  photo: GeoPhoto
  transform: string
  opacity: number
  saturation?: number
  glass?: boolean
  blur?: number
  /** Échelle d'affichage (`overlayScale`) : cadre et surbrillance gardent la même épaisseur à l'écran. */
  scale?: number
  onClick?: () => void
  /** Gestes sur la photo (ex. glissement pour passer à la suivante). */
  handlers?: HTMLAttributes<HTMLImageElement>
}) {
  const url = useImageUrl(photo.id, 'full')
  if (!url) return null
  const shown = glass ? opacity * GLASS_OPACITY : opacity
  const tinted = saturation < 1
  const near = blur > 0.05
  const size = { width: OVERLAY_W, height: overlayHeight(photo) }
  const vars = cardVars(scale, blur)
  // Filtre réglé par variables CSS : un seul filtre, combiné à celui de la vitre.
  const filter = { '--sat': saturation, '--glass-sat': saturation * GLASS_SATURATION } as CSSProperties
  const classes = ['overlay-photo', tinted && 'tinted', near && 'near', glass && 'glass', onClick && 'clickable']
  return (
    <>
      <img
        className={classes.filter(Boolean).join(' ')}
        src={url}
        alt=""
        {...size}
        style={{ transform, opacity: shown, ...vars, ...filter }}
        draggable={false}
        onClick={onClick}
        {...handlers}
      />
      {/* Photo en couleur (la mienne ou capturée) : surbrillance animée. */}
      {saturation >= 1 && !glass && (
        <div
          className="overlay-shine"
          aria-hidden
          style={
            {
              ...size,
              ...vars,
              transform,
              opacity: shown,
              '--shine': `${Math.min(40, SHINE_PX / Math.max(scale, 0.01))}px`,
            } as CSSProperties
          }
        />
      )}
      {/* Reflet de la vitre, par-dessus la photo. */}
      {glass && <div className="overlay-glass" aria-hidden style={{ ...size, ...vars, transform, opacity }} />}
    </>
  )
}

/**
 * Capture : la carte quitte sa place (`state.from`) et s'agrandit jusqu'à couvrir tout l'écran
 * (`cover`, mode « cover »), pendant que la couleur l'envahit depuis son centre (révélation de
 * la 0.013.0, étalée sur l'agrandissement). Annulée, elle revient à sa place en rétrécissant,
 * couleur retirée ; capturée, elle y revient en couleur. Transitions CSS sur la transformation
 * seulement : animées par la carte graphique, sans recalcul de la page à chaque image ; une
 * annulation repart de là où en était l'agrandissement.
 */
export function CaptureCard({
  photo,
  state,
  cover,
  saturation,
  scale = 1,
}: {
  photo: GeoPhoto
  state: Exclude<CaptureState, { phase: 'idle' }>
  /** Transformation couvrant l'écran (`coverTransform`). */
  cover: string
  /** Saturation de la photo au départ (noir et blanc, couleur partielle en chasse, 1 si capturée). */
  saturation: number
  /** Échelle de la carte au départ (`overlayScale`), pour son cadre. */
  scale?: number
}) {
  const url = useImageUrl(photo.id, 'full')
  // Première image à sa place, puis l'agrandissement (transition CSS).
  const [grown, setGrown] = useState(false)
  useEffect(() => {
    const frame = requestAnimationFrame(() => setGrown(true))
    return () => cancelAnimationFrame(frame)
  }, [])
  if (!url) return null
  const transform = state.phase === 'back' ? state.to : state.phase === 'captured' || grown ? cover : state.from
  const tinted = saturation < 1
  const size = { width: OVERLAY_W, height: overlayHeight(photo) }
  const cancelled = state.phase === 'back' && state.cancelled
  return (
    <div
      className={`capture-card ${state.phase} ${cancelled ? 'cancelled' : ''}`}
      aria-hidden
      style={
        {
          ...size,
          transform,
          '--grow-ms': `${CAPTURE.growMs}ms`,
          '--back-ms': `${CAPTURE.backMs}ms`,
        } as CSSProperties
      }
    >
      <img
        className={`overlay-photo ${tinted ? 'tinted' : ''}`}
        src={url}
        alt=""
        {...size}
        style={{ ...cardVars(scale), '--sat': saturation } as CSSProperties}
        draggable={false}
      />
      {tinted && (
        <img className="overlay-photo overlay-reveal" src={url} alt="" {...size} style={cardVars(scale)} draggable={false} />
      )}
    </div>
  )
}

/** Message court de la capture (« Ne bougez plus… », « Capture interrompue : restez immobile »). */
export function CaptureHint({ text }: { text: string | null }) {
  return (
    <p className={`capture-hint ${text ? '' : 'hidden'}`} role="status" aria-live="polite">
      {text}
    </p>
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
  action?: { label: string; onClick: () => void; disabled?: boolean }
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
        <button type="button" className="btn small" onClick={action.onClick} disabled={action.disabled}>
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
