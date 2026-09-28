import { useMemo, useState } from 'react'
import type { GeoPhoto } from '../data/types'
import { distanceMeters, type GeoFix } from '../geo/geodesy'
import type { ViewportCamera } from '../geo/optics'
import type { CameraBasis } from '../geo/orientation'
import { groupBySpot } from '../geo/spots'
import { ArPhoto, SpotTimeline } from './ar'
import { photoTime, projectGeoPhoto, type GeoframedPhoto } from './arProjection'

/** Distance maximale (m) à laquelle les photos apparaissent dans le viseur. */
export const AR_RANGE = 150
/** Nombre maximal de lieux affichés simultanément. */
const MAX_OVERLAYS = 4

/**
 * Viseur augmenté : les photos géocadrées autour de soi flottent à leur
 * place. Pour chaque lieu, la plus récente est devant ; la frise du lieu
 * visé permet de remonter vers les plus anciennes.
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
  const [selection, setSelection] = useState<Record<string, number>>({})

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
      const index = Math.min(selection[key] ?? 0, spot.items.length - 1)
      const photo = spot.items[index]
      return { key, spot, index, photo, ar: projectGeoPhoto(photo, fix, basis, cam) }
    })
    .filter((s) => s.ar.transform && s.ar.projection.onScreen)
    .sort((a, b) => (b.ar.distance ?? 0) - (a.ar.distance ?? 0))
    .slice(-MAX_OVERLAYS)

  // Lieu visé : celui dont la photo est la plus proche du centre de l'écran.
  const focus = projected.reduce<(typeof projected)[number] | null>(
    (best, s) => (!best || s.ar.centerOffset < best.ar.centerOffset ? s : best),
    null,
  )

  return (
    <>
      {projected.map((s) => (
        <ArPhoto
          key={s.key}
          photo={s.photo}
          transform={s.ar.transform!}
          opacity={s === focus ? 1 : 0.8}
          onClick={() => onOpen(s.photo)}
        />
      ))}
      {focus && (
        <div className="home-timeline">
          <SpotTimeline
            items={focus.spot.items}
            index={focus.index}
            onChange={(i) => setSelection((sel) => ({ ...sel, [focus.key]: i }))}
            isMine={isMine}
            action={{ label: 'Chasser', onClick: () => onOpen(focus.photo) }}
          />
        </div>
      )}
    </>
  )
}
