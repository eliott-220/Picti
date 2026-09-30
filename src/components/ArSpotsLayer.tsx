import { useMemo, useState } from 'react'
import type { GeoPhoto } from '../data/types'
import { distanceMeters, type GeoFix } from '../geo/geodesy'
import type { ViewportCamera } from '../geo/optics'
import type { CameraBasis } from '../geo/orientation'
import { cycle, groupBySpot } from '../geo/spots'
import { ArPhoto, SpotTimeline } from './ar'
import { photoTime, projectGeoPhoto, type ArProjection, type GeoframedPhoto } from './arProjection'
import { Dots } from './Dots'
import { useCardSwipe } from './useCardSwipe'

/** Distance maximale (m) à laquelle les photos apparaissent dans le viseur. */
export const AR_RANGE = 150
/** Nombre maximal de lieux affichés simultanément. */
const MAX_OVERLAYS = 4
/** Nombre maximal de photos d'un même lieu prises en compte. */
const MAX_PER_SPOT = 30

interface Card {
  photo: GeoframedPhoto
  ar: ArProjection
}

/**
 * Viseur augmenté : les photos géocadrées autour de soi flottent à leur
 * place. Les photos d'un même endroit sont empilées, la plus récente
 * devant : on fait glisser celle du dessus (comme sur Tinder) pour voir les
 * autres, les points sous la photo indiquant combien il y en a.
 */
export function ArSpotsLayer({
  photos,
  fix,
  basis,
  cam,
  isMine,
  onOpen,
}: {
  photos: GeoframedPhoto[]
  fix: GeoFix | null
  basis: CameraBasis | null
  cam: ViewportCamera | null
  isMine: (p: GeoPhoto) => boolean
  onOpen: (p: GeoPhoto) => void
}) {
  // Photo du dessus choisie pour chaque lieu.
  const [selection, setSelection] = useState<Record<string, string>>({})

  const spots = useMemo(() => {
    if (!fix) return []
    const around = photos.filter((p) => distanceMeters(fix, p.geoframe.position) <= AR_RANGE)
    return groupBySpot(around, (p) => p.geoframe.position, photoTime)
  }, [photos, fix])

  if (!basis || !cam || !spots.length) return null

  const projected = spots
    .map((spot) => {
      // Clé stable : la plus ancienne photo du lieu (une nouvelle photo ne la change pas).
      const key = spot.items[spot.items.length - 1].id
      // Pile : les photos du lieu visibles dans cette direction.
      const cards: Card[] = spot.items
        .slice(0, MAX_PER_SPOT)
        .map((photo) => ({ photo, ar: projectGeoPhoto(photo, fix, basis, cam) }))
        .filter((c) => c.ar.transform && c.ar.projection.onScreen)
      const index = Math.max(0, cards.findIndex((c) => c.photo.id === selection[key]))
      return { key, cards, index }
    })
    .filter((s) => s.cards.length)
    .sort((a, b) => (b.cards[b.index].ar.distance ?? 0) - (a.cards[a.index].ar.distance ?? 0))
    .slice(-MAX_OVERLAYS)

  // Lieu visé : celui dont la photo est la plus proche du centre de l'écran.
  const focus = projected.reduce<(typeof projected)[number] | null>(
    (best, s) => (!best || s.cards[s.index].ar.centerOffset < best.cards[best.index].ar.centerOffset ? s : best),
    null,
  )
  const select = (key: string, photo: GeoPhoto) => setSelection((sel) => ({ ...sel, [key]: photo.id }))

  return (
    <>
      {projected.map((s) =>
        s === focus ? (
          <ArDeck
            key={s.key}
            cards={s.cards}
            index={s.index}
            cam={cam}
            onSelect={(photo) => select(s.key, photo)}
            onOpen={onOpen}
          />
        ) : (
          <ArPhoto
            key={s.key}
            photo={s.cards[s.index].photo}
            transform={s.cards[s.index].ar.transform!}
            opacity={0.8 * s.cards[s.index].ar.fade}
            glass={!s.cards[s.index].ar.facing}
            onClick={() => onOpen(s.cards[s.index].photo)}
          />
        ),
      )}
      {focus && (
        <div className="home-timeline">
          <SpotTimeline
            items={focus.cards.map((c) => c.photo)}
            index={focus.index}
            onChange={(i) => select(focus.key, focus.cards[i].photo)}
            isMine={isMine}
            action={{ label: 'Chasser', onClick: () => onOpen(focus.cards[focus.index].photo) }}
            dots={false}
            distance={focus.cards[focus.index].ar.distance}
          />
        </div>
      )}
    </>
  )
}

/** Centre et bas de la photo projetée à l'écran (px). */
function screenBox(ar: ArProjection) {
  const c = ar.projection.corners
  return {
    x: c.reduce((s, p) => s + p.x, 0) / 4,
    y: c.reduce((s, p) => s + p.y, 0) / 4,
    bottom: Math.max(...c.map((p) => p.y)),
  }
}

/**
 * Pile de photos d'un même endroit, chacune à sa place dans le décor.
 * La photo du dessus suit le doigt et s'envole ; la suivante apparaît
 * dessous. Les points indiquent le nombre de photos.
 */
function ArDeck({
  cards,
  index,
  cam,
  onSelect,
  onOpen,
}: {
  cards: Card[]
  index: number
  cam: ViewportCamera
  onSelect: (photo: GeoPhoto) => void
  onOpen: (photo: GeoPhoto) => void
}) {
  const n = cards.length
  const swipe = useCardSwipe((step) => onSelect(cards[cycle(index, step, n)].photo))
  const top = cards[index]
  const box = screenBox(top.ar)
  // Sous la photo du dessus : celle qu'on va découvrir, selon le sens du geste.
  const below = n > 1 ? cards[cycle(index, swipe.dx > 0 ? -1 : 1, n)] : null
  const depth = 1 - swipe.progress
  const belowBox = below && screenBox(below.ar)

  return (
    <>
      {below && belowBox && (
        <div
          className="ar-card"
          style={{
            transform: `translateY(${depth * 12}px) scale(${1 - depth * 0.05})`,
            transformOrigin: `${belowBox.x}px ${belowBox.y}px`,
            transition: swipe.transition,
          }}
        >
          <ArPhoto
            photo={below.photo}
            transform={below.ar.transform!}
            opacity={0.9 * below.ar.fade}
            glass={!below.ar.facing}
          />
        </div>
      )}
      <div
        className="ar-card"
        style={n > 1 ? { transform: swipe.transform, transformOrigin: `${box.x}px ${box.y}px`, transition: swipe.transition } : undefined}
      >
        <ArPhoto
          key={top.photo.id}
          photo={top.photo}
          transform={top.ar.transform!}
          opacity={top.ar.fade}
          glass={!top.ar.facing}
          onClick={() => onOpen(top.photo)}
          handlers={n > 1 ? swipe.handlers : undefined}
        />
      </div>
      {n > 1 && (
        <Dots
          count={n}
          index={index}
          className="light ar-dots"
          style={{
            left: Math.min(cam.width - 40, Math.max(40, box.x)),
            top: Math.min(cam.height - 220, Math.max(80, box.bottom + 14)),
          }}
        />
      )}
    </>
  )
}
