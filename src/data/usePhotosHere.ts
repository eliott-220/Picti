import { useMemo } from 'react'
import { photoTime } from '../components/arProjection'
import { distanceMeters } from '../geo/geodesy'
import { SAME_SPOT_RADIUS } from '../geo/spots'
import { useStore } from './storeContext'
import { isGeoframed, type GeoPhoto } from './types'

/**
 * Photos géocadrées prises au même endroit qu'une photo (elle comprise), de
 * la plus récente à la plus ancienne. Une seule si elle n'est pas géocadrée.
 */
export function usePhotosHere(photo: GeoPhoto): GeoPhoto[] {
  const { photos } = useStore()
  return useMemo(() => {
    const g = photo.geoframe
    if (!g) return [photo]
    const here = photos.filter(
      (p) => p.id !== photo.id && isGeoframed(p) && distanceMeters(p.geoframe.position, g.position) <= SAME_SPOT_RADIUS,
    )
    return [photo, ...here].sort((a, b) => photoTime(b) - photoTime(a))
  }, [photos, photo])
}
