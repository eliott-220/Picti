import { useEffect, useMemo, useState } from 'react'
import { useColorRule } from '../data/photoColor'
import { withinCaptureRadius } from '../geo/alignment'
import type { GeoPhoto } from '../data/types'
import { distanceMeters, type GeoFix } from '../geo/geodesy'
import type { ViewportCamera } from '../geo/optics'
import { anglesFromBasis, type CameraBasis } from '../geo/orientation'
import { cycle, groupBySpot } from '../geo/spots'
import { photoPileOrder, spotPointOf } from '../data/photoSpots'
import { ArPhoto, CaptureCard, CaptureHint, SpotTimeline } from './ar'
import {
  coverTransform,
  overlayScale,
  photoTime,
  projectGeoPhoto,
  type ArProjection,
  type GeoframedPhoto,
} from './arProjection'
import { Dots } from './Dots'
import { useCapture } from './useCapture'
import { useCardSwipe } from './useCardSwipe'

/** Distance maximale (m) à laquelle les photos apparaissent dans le viseur. */
export const AR_RANGE = 150
/** Nombre maximal de lieux affichés simultanément. */
const MAX_OVERLAYS = 4
/** Nombre maximal de photos d'un même lieu prises en compte. */
const MAX_PER_SPOT = 30
/** Une fois capturée, la photo reste un instant en plein écran avant de revenir à sa place (ms). */
const CAPTURED_HOLD_MS = 600

interface Card {
  photo: GeoframedPhoto
  ar: ArProjection
}

/**
 * Viseur augmenté : les photos géocadrées autour de soi flottent à leur
 * place, comme des cartes. Les photos d'un même lieu sont empilées, les plus
 * aimées devant : on fait glisser celle du dessus (comme sur Tinder) pour voir
 * les autres ; les points sous la photo disent combien il y en a et ouvrent la
 * galerie du lieu.
 * « Capturer » : la photo visée s'agrandit jusqu'à couvrir l'écran (voir `useCapture`).
 */
export function ArSpotsLayer({
  photos,
  fix,
  basis,
  cam,
  isMine,
  onOpen,
  onGallery,
  onCapture,
}: {
  photos: GeoframedPhoto[]
  fix: GeoFix | null
  basis: CameraBasis | null
  cam: ViewportCamera | null
  isMine: (p: GeoPhoto) => boolean
  onOpen: (p: GeoPhoto) => void
  /** Galerie de toutes les photos du lieu (appui sur les points). */
  onGallery?: (p: GeoPhoto) => void
  /**
   * Enregistre la capture d'une photo d'un autre, pas encore capturée, une fois l'agrandissement
   * achevé (bouton « Capturer ») ; résout `true` si elle est enregistrée.
   */
  onCapture?: (p: GeoPhoto) => Promise<boolean>
}) {
  // Photo du dessus choisie pour chaque lieu.
  const [selection, setSelection] = useState<Record<string, string>>({})
  // Photos des autres pas encore capturées : noir et blanc.
  const inColor = useColorRule()
  // Photos qu'on vient de capturer : en couleur sans attendre l'enregistrement.
  const [justCaptured, setJustCaptured] = useState<ReadonlySet<string>>(() => new Set())
  const capture = useCapture((id) => {
    const p = photos.find((photo) => photo.id === id)
    if (!p || !onCapture) return
    navigator.vibrate?.([60, 40, 120])
    setJustCaptured((done) => new Set(done).add(id))
    void onCapture(p).then((saved) => {
      if (saved) return
      setJustCaptured((done) => {
        const next = new Set(done)
        next.delete(id)
        return next
      })
    })
  })
  /** Saturation d'une photo du viseur. */
  const color = (p: GeoPhoto) => ({ saturation: inColor(p) || justCaptured.has(p.id) ? 1 : 0 })

  const spots = useMemo(() => {
    if (!fix) return []
    const around = photos.filter((p) => distanceMeters(fix, p.geoframe.position) <= AR_RANGE)
    return groupBySpot(around, spotPointOf, photoTime, photoPileOrder())
  }, [photos, fix])

  const projected =
    basis && cam
      ? spots
          .map((spot) => {
            // Clé stable : la plus ancienne photo du lieu (ni une nouvelle photo ni un like ne la changent).
            const key = spot.items.reduce((a, b) => (photoTime(b) < photoTime(a) ? b : a)).id
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
      : []
  const cardOf = (id: string) => projected.flatMap((s) => s.cards).find((c) => c.photo.id === id) ?? null

  // Capture en cours : orientation et place de la photo à l'écran, vérifiées à chaque image.
  useEffect(() => {
    capture.sync({ angles: basis ? anglesFromBasis(basis) : null, place: (id) => cardOf(id)?.ar.transform ?? null })
  })
  // Capturée : un instant en plein écran, puis retour à sa place, en couleur.
  const { state, release } = capture
  useEffect(() => {
    if (state.phase !== 'captured') return
    const t = setTimeout(release, CAPTURED_HOLD_MS)
    return () => clearTimeout(t)
  }, [state, release])

  if (!basis || !cam) return null

  // Lieu visé : celui dont la photo est la plus proche du centre de l'écran.
  const focus = projected.reduce<(typeof projected)[number] | null>(
    (best, s) => (!best || s.cards[s.index].ar.centerOffset < best.cards[best.index].ar.centerOffset ? s : best),
    null,
  )
  const select = (key: string, photo: GeoPhoto) => setSelection((sel) => ({ ...sel, [key]: photo.id }))
  // La photo en cours de capture a quitté sa place : la carte d'agrandissement la remplace.
  const captured = capture.active ? photos.find((p) => p.id === capture.active) ?? null : null
  const capturedCard = captured && cardOf(captured.id)
  const focusTop = focus && focus.cards[focus.index]

  return (
    <>
      {projected.map((s) =>
        s.cards[s.index].photo.id === capture.active ? null : s === focus ? (
          <ArDeck
            key={s.key}
            cards={s.cards}
            index={s.index}
            cam={cam}
            color={color}
            onSelect={(photo) => select(s.key, photo)}
            onOpen={onOpen}
            onGallery={onGallery}
          />
        ) : (
          <ArPhoto
            key={s.key}
            photo={s.cards[s.index].photo}
            transform={s.cards[s.index].ar.transform!}
            opacity={0.8 * s.cards[s.index].ar.fade}
            {...color(s.cards[s.index].photo)}
            blur={s.cards[s.index].ar.blur}
            scale={overlayScale(s.cards[s.index].ar)}
            glass={!s.cards[s.index].ar.facing}
            version={s.cards[s.index].photo.versionOf != null}
            onClick={() => onOpen(s.cards[s.index].photo)}
          />
        ),
      )}
      {captured && capture.state.phase !== 'idle' && (
        <CaptureCard
          key={captured.id}
          photo={captured}
          state={capture.state}
          cover={coverTransform(captured, cam)}
          {...color(captured)}
          scale={capturedCard ? overlayScale(capturedCard.ar) : undefined}
        />
      )}
      <CaptureHint text={capture.hint} />
      {focus && focusTop && (
        <div className="home-timeline">
          <SpotTimeline
            items={focus.cards.map((c) => c.photo)}
            index={focus.index}
            onChange={(i) => select(focus.key, focus.cards[i].photo)}
            isMine={isMine}
            action={
              // Photo d'un autre pas encore capturée, à moins de 5 m de son point de vue : on la
              // capture sur place (elle s'agrandit jusqu'à couvrir l'écran). Plus loin : « Chasser »
              // guide jusqu'au point de vue.
              onCapture &&
              !inColor(focusTop.photo) &&
              !justCaptured.has(focusTop.photo.id) &&
              withinCaptureRadius(focusTop.ar.distance)
                ? {
                    label: 'Capturer',
                    onClick: () => capture.start(focusTop.photo.id, focusTop.ar.transform!),
                    disabled: capture.active != null,
                  }
                : { label: 'Chasser', onClick: () => onOpen(focusTop.photo) }
            }
            dots={false}
            distance={focusTop.ar.distance}
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
  color,
  onSelect,
  onOpen,
  onGallery,
}: {
  cards: Card[]
  index: number
  cam: ViewportCamera
  color: (p: GeoPhoto) => { saturation: number }
  onSelect: (photo: GeoPhoto) => void
  onOpen: (photo: GeoPhoto) => void
  onGallery?: (photo: GeoPhoto) => void
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
            {...color(below.photo)}
            blur={below.ar.blur}
            scale={overlayScale(below.ar)}
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
          {...color(top.photo)}
          blur={top.ar.blur}
          scale={overlayScale(top.ar)}
          glass={!top.ar.facing}
          version={top.photo.versionOf != null}
          onClick={() => onOpen(top.photo)}
          handlers={n > 1 ? swipe.handlers : undefined}
        />
      </div>
      {n > 1 && (
        <Dots
          count={n}
          index={index}
          rings={cards.map((c) => c.photo.versionOf != null)}
          onOpen={onGallery && (() => onGallery(top.photo))}
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
