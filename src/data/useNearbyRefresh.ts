import { useEffect, useRef } from 'react'
import { distanceMeters, type GeoFix } from '../geo/geodesy'
import { useStore } from './storeContext'

/** Recherche les photos à proximité quand on s'est déplacé (50 m) ou toutes les minutes. */
export function useNearbyRefresh(fix: GeoFix | null) {
  const { refreshNearby } = useStore()
  const last = useRef<{ lat: number; lon: number; at: number } | null>(null)
  useEffect(() => {
    if (!fix) return
    const l = last.current
    if (l && distanceMeters(l, fix) < 50 && Date.now() - l.at < 60_000) return
    last.current = { lat: fix.lat, lon: fix.lon, at: Date.now() }
    void refreshNearby(fix)
  }, [fix, refreshNearby])
}
