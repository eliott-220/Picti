// Géodésie : distances, caps et repère local ENU (Est, Nord, Haut).

import { DEG, normalizeDeg, type Vec3 } from './math'

/** Rayon terrestre moyen (m). */
export const EARTH_RADIUS = 6_371_008.8

export interface GeoPoint {
  lat: number
  lon: number
  /** Altitude (m), souvent absente ou imprécise sur mobile. */
  alt?: number | null
}

export interface GeoFix extends GeoPoint {
  /** Rayon de confiance horizontal (m). */
  accuracy: number
  timestamp: number
}

/** Distance orthodromique (formule de haversine), en mètres. */
export function distanceMeters(a: GeoPoint, b: GeoPoint): number {
  const dLat = (b.lat - a.lat) * DEG
  const dLon = (b.lon - a.lon) * DEG
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * DEG) * Math.cos(b.lat * DEG) * Math.sin(dLon / 2) ** 2
  return 2 * EARTH_RADIUS * Math.asin(Math.min(1, Math.sqrt(h)))
}

/** Cap initial de `a` vers `b`, en degrés depuis le nord, sens horaire. */
export function bearingDeg(a: GeoPoint, b: GeoPoint): number {
  const φ1 = a.lat * DEG
  const φ2 = b.lat * DEG
  const Δλ = (b.lon - a.lon) * DEG
  const y = Math.sin(Δλ) * Math.cos(φ2)
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ)
  return normalizeDeg(Math.atan2(y, x) / DEG)
}

/**
 * Coordonnées de `p` dans le plan tangent local centré sur `origin`
 * (x = Est, y = Nord, z = Haut). Approximation équirectangulaire,
 * largement suffisante à l'échelle d'une scène (< quelques km).
 */
export function toENU(origin: GeoPoint, p: GeoPoint): Vec3 {
  const east = (p.lon - origin.lon) * DEG * EARTH_RADIUS * Math.cos(origin.lat * DEG)
  const north = (p.lat - origin.lat) * DEG * EARTH_RADIUS
  const up = p.alt != null && origin.alt != null ? p.alt - origin.alt : 0
  return [east, north, up]
}

/** Inverse de `toENU`. */
export function fromENU(origin: GeoPoint, enu: Vec3): GeoPoint {
  return {
    lat: origin.lat + enu[1] / EARTH_RADIUS / DEG,
    lon: origin.lon + enu[0] / (EARTH_RADIUS * Math.cos(origin.lat * DEG)) / DEG,
    alt: origin.alt != null ? origin.alt + enu[2] : null,
  }
}

const COMPASS_POINTS = ['N', 'NE', 'E', 'SE', 'S', 'SO', 'O', 'NO'] as const

/** Point cardinal (rose à 8 directions, en français). */
export function compassPoint(deg: number): string {
  return COMPASS_POINTS[Math.round(normalizeDeg(deg) / 45) % 8]
}

/** Distance lisible : « 8 m », « 350 m », « 1,2 km ». */
export function formatDistance(m: number): string {
  if (m < 1000) return `${Math.round(m)} m`
  return `${(m / 1000).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} km`
}
