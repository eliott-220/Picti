import { useMemo } from 'react'
import { sameSpot } from '../geo/spots'
import { photoPileOrder, spotPointOf } from './photoSpots'
import { useStore } from './storeContext'
import { isGeoframed, type GeoPhoto } from './types'

/**
 * Photos géocadrées du même lieu qu'une photo (elle comprise, `sameSpot`), dans l'ordre de la
 * pile (les plus aimées devant). Une seule si elle n'est pas géocadrée.
 */
export function usePhotosHere(photo: GeoPhoto): GeoPhoto[] {
  const { photos } = useStore()
  return useMemo(() => {
    if (!isGeoframed(photo)) return [photo]
    const here = spotPointOf(photo)
    const others = photos.filter((p) => p.id !== photo.id && isGeoframed(p) && sameSpot(here, spotPointOf(p)))
    return [photo, ...others].sort(photoPileOrder())
  }, [photos, photo])
}
