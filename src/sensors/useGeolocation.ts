import { useEffect, useState } from 'react'
import { fuseFix, type GeoFix } from '../geo/geodesy'

export interface GeolocationState {
  fix: GeoFix | null
  error: string | null
}

function describe(err: GeolocationPositionError): string {
  switch (err.code) {
    case err.PERMISSION_DENIED:
      return 'Accès à la position refusé'
    case err.POSITION_UNAVAILABLE:
      return 'Position indisponible'
    default:
      return 'Position introuvable pour le moment'
  }
}

const UNSUPPORTED: GeolocationState = { fix: null, error: 'Géolocalisation non prise en charge' }

/** Suit la position GPS en continu, lissée par fusion des mesures. */
export function useGeolocation(enabled = true): GeolocationState {
  const [supported] = useState(() => 'geolocation' in navigator)
  const [state, setState] = useState<GeolocationState>({ fix: null, error: null })

  useEffect(() => {
    if (!enabled || !supported) return
    let fused: GeoFix | null = null
    const id = navigator.geolocation.watchPosition(
      (pos) => {
        fused = fuseFix(fused, {
          lat: pos.coords.latitude,
          lon: pos.coords.longitude,
          alt: pos.coords.altitude,
          accuracy: Math.max(1, pos.coords.accuracy),
          timestamp: pos.timestamp,
        })
        setState({ fix: fused, error: null })
      },
      (err) => setState((s) => ({ ...s, error: describe(err) })),
      { enableHighAccuracy: true, maximumAge: 0, timeout: 30_000 },
    )
    return () => navigator.geolocation.clearWatch(id)
  }, [enabled, supported])

  return supported ? state : UNSUPPORTED
}
