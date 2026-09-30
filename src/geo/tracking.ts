// Suivi de la position du spectateur à partir du GPS.
//
// Filtre de Kalman « vitesse constante » dans un repère local Est-Nord :
// il lisse les relevés, estime la vitesse de marche pour faire avancer la
// position entre deux relevés (le GPS n'en donne qu'un par seconde) et,
// quand l'accéléromètre ne compte pas de pas, garde la position au lieu de
// suivre la dérive du GPS (quelques mètres, même immobile) : une photo à
// 6 m se décalerait de près de 30° pour 3 m d'erreur. Seul un écart qui
// persiste plusieurs secondes est un vrai déplacement, alors rattrapé.

import { fromENU, toENU, type GeoFix, type GeoPoint } from './geodesy'
import type { MotionState } from './motion'

export const TRACKING = {
  /** Accélérations de la marche : départs, arrêts, virages (m/s²). */
  walkAcceleration: 2,
  /** Vitesse de marche typique (m/s) : incertitude sur la vitesse quand on se met en route. */
  walkSpeed: 1.5,
  /** Juste après l'arrêt (m²/s) : sans élan, la position rejoint encore le GPS, en retard. */
  settleDrift: 10,
  /** Dérive admise à l'arrêt (m²/s) : les écarts du GPS sont presque ignorés. */
  stillDrift: 0.01,
  /**
   * À l'arrêt, un écart moyen du GPS qui persiste au-delà de ce seuil (m, ou de la moitié de
   * la précision) est un vrai déplacement — pas vu par l'accéléromètre, ou GPS en retard :
   * il est rattrapé comme juste après un arrêt, pendant `catchUp` ms.
   */
  persistentShift: 4,
  /** Poids de chaque relevé dans cet écart moyen (≈ 4 s de mémoire à un relevé par seconde). */
  shiftWeight: 0.25,
  catchUp: 4000,
  /**
   * À l'arrêt, la position est tenue : un relevé n'est pris en compte que s'il est bien plus
   * précis que l'estimation (gain au-delà de ce seuil : démarrage, précision qui s'améliore).
   */
  holdGain: 0.3,
  /** Au-delà de cette vitesse GPS (m/s), on se déplace même sans secousse (voiture, tram…). */
  movingSpeed: 0.5,
  /** À l'arrêt, un relevé plus éloigné que ce seuil (m) et que 3 écarts-types est un saut. */
  minJump: 8,
  /** Sans relevé depuis ce délai (ms), on repart du suivant. */
  maxGap: 15_000,
  /** Au-delà de cette distance (m) de l'origine du repère local, on le recentre. */
  maxOffset: 1000,
  /** Durée maximale (s) pendant laquelle on prolonge la marche après un relevé. */
  maxExtrapolation: 1.5,
}

/** Déplacement retenu pour un relevé (voir `MotionState`). */
export type TrackMode = 'moving' | 'settling' | 'still'

/** Relevé GPS, avec la vitesse si l'appareil la fournit. */
export interface GpsFix extends GeoFix {
  /** Vitesse sol (m/s), null si inconnue. */
  speed?: number | null
}

/**
 * Position estimée dans un repère local centré sur `origin` (Est, Nord,
 * en mètres), avec la vitesse et leurs incertitudes.
 */
export interface Track {
  origin: GeoPoint
  e: number
  n: number
  /** Vitesse (m/s). */
  ve: number
  vn: number
  /** Covariance position/vitesse, la même sur chaque axe (m², m²/s, m²/s²). */
  pp: number
  pv: number
  vv: number
  /** Précision annoncée du dernier relevé (m). */
  accuracy: number
  alt: number | null
  /** Instant du dernier relevé (ms). */
  t: number
  /** Déplacement lors du dernier relevé. */
  mode: TrackMode
  /** Relevés consécutifs écartés à l'arrêt (saut suspect). */
  rejected: number
  /** Écart moyen récent du GPS à l'arrêt (m, Est et Nord) : persistant, c'est un déplacement. */
  se: number
  sn: number
  /** Jusqu'à cet instant (ms), un tel écart est en cours de rattrapage. */
  catchUntil: number
}

/** Variance d'un relevé : `accuracy` est un rayon de confiance, plus large qu'un écart-type. */
const measurementVariance = (accuracy: number) => Math.max(1, accuracy / 2) ** 2

function start(fix: GpsFix, mode: TrackMode): Track {
  return {
    origin: { lat: fix.lat, lon: fix.lon },
    e: 0,
    n: 0,
    ve: 0,
    vn: 0,
    pp: measurementVariance(fix.accuracy),
    pv: 0,
    vv: mode === 'moving' ? TRACKING.walkSpeed ** 2 : 0,
    accuracy: fix.accuracy,
    alt: fix.alt ?? null,
    t: fix.timestamp,
    mode,
    rejected: 0,
    se: 0,
    sn: 0,
    catchUntil: 0,
  }
}

/** Intègre un relevé GPS ; `motion` dit si l'on marche (accéléromètre). */
export function updateTrack(prev: Track | null, fix: GpsFix, motion: MotionState): Track {
  // Sans accéléromètre, la vitesse GPS dit si l'on bouge (à défaut, on suit le GPS) ;
  // immobile mais rapide d'après le GPS : en véhicule.
  const speed = fix.speed != null && fix.speed >= 0 ? fix.speed : null
  const mode: TrackMode =
    motion === 'unknown'
      ? speed == null || speed > TRACKING.movingSpeed
        ? 'moving'
        : 'still'
      : motion === 'still' && (speed ?? 0) > TRACKING.movingSpeed
        ? 'moving'
        : motion
  if (!prev || fix.timestamp - prev.t > TRACKING.maxGap) return start(fix, mode)
  const dt = Math.max(0, (fix.timestamp - prev.t) / 1000)
  let { e, n, ve, vn, pp, pv, vv } = prev

  const r = measurementVariance(fix.accuracy)
  const [ze, zn] = toENU(prev.origin, fix)
  // Écart moyen récent à l'arrêt : les allers-retours du GPS s'annulent, un déplacement non.
  const still = mode === 'still'
  const w = TRACKING.shiftWeight
  const se = still ? prev.se + (ze - e - prev.se) * w : 0
  const sn = still ? prev.sn + (zn - n - prev.sn) * w : 0
  const shifted = still && Math.hypot(se, sn) > Math.max(TRACKING.persistentShift, fix.accuracy / 2)
  const catchUntil = shifted ? fix.timestamp + TRACKING.catchUp : prev.catchUntil
  const catching = still && fix.timestamp < catchUntil

  // Prédiction : on avance à la vitesse estimée ; à l'arrêt, on ne bouge pas.
  if (mode === 'moving') {
    // On se remet en route : vitesse inconnue.
    if (prev.mode !== 'moving') vv = Math.max(vv, TRACKING.walkSpeed ** 2)
    const q = TRACKING.walkAcceleration ** 2
    e += ve * dt
    n += vn * dt
    pp += 2 * dt * pv + dt * dt * vv + (q * dt ** 4) / 4
    pv += dt * vv + (q * dt ** 3) / 2
    vv += q * dt * dt
  } else {
    // Arrêté : plus d'élan. Juste après l'arrêt, le GPS peut encore rattraper son retard.
    ve = vn = pv = vv = 0
    pp += (mode === 'settling' || catching ? TRACKING.settleDrift : TRACKING.stillDrift) * dt
  }

  // Correction par le relevé.
  const ye = ze - e
  const yn = zn - n
  const s = pp + r
  if (mode === 'still' && Math.hypot(ye, yn) > Math.max(TRACKING.minJump, 3 * Math.sqrt(s))) {
    // Saut à l'arrêt : isolé (reflet du signal), on l'ignore ; confirmé, on s'y rend.
    if (prev.rejected >= 1) return start(fix, mode)
    return { ...prev, e, n, ve, vn, pp, pv, vv, t: fix.timestamp, mode, rejected: prev.rejected + 1, catchUntil }
  }
  const kp = pp / s
  const kv = pv / s
  if (still && !catching && kp < TRACKING.holdGain) {
    // Immobile : on tient la position ; seul l'écart moyen du GPS est suivi.
    return { ...prev, e, n, ve, vn, pp, pv, vv, accuracy: fix.accuracy, t: fix.timestamp, mode, rejected: 0, se, sn, catchUntil }
  }
  const track: Track = {
    origin: prev.origin,
    e: e + kp * ye,
    n: n + kp * yn,
    ve: ve + kv * ye,
    vn: vn + kv * yn,
    pp: (1 - kp) * pp,
    pv: (1 - kp) * pv,
    vv: vv - kv * pv,
    accuracy: fix.accuracy,
    alt: fix.alt ?? prev.alt,
    t: fix.timestamp,
    mode,
    rejected: 0,
    // Écart en cours de rattrapage : on repart de zéro.
    se: shifted ? 0 : se,
    sn: shifted ? 0 : sn,
    catchUntil,
  }
  return Math.hypot(track.e, track.n) > TRACKING.maxOffset ? recenter(track) : track
}

/** Place l'origine du repère local sur la position estimée. */
function recenter(track: Track): Track {
  const p = fromENU(track.origin, [track.e, track.n, 0])
  return { ...track, origin: { lat: p.lat, lon: p.lon }, e: 0, n: 0 }
}

/**
 * Position estimée à l'instant `now` (ms) : entre deux relevés, on la
 * prolonge à la vitesse de marche, tant qu'on marche.
 */
export function trackPosition(track: Track, now: number, motion: MotionState): [number, number] {
  const dt = (now - track.t) / 1000
  const walking = motion === 'moving' || motion === 'unknown'
  if (!walking || track.mode !== 'moving' || dt <= 0 || dt > 2 * TRACKING.maxExtrapolation) {
    return [track.e, track.n]
  }
  const k = Math.min(dt, TRACKING.maxExtrapolation)
  return [track.e + track.ve * k, track.n + track.vn * k]
}

/** Position estimée (par défaut celle du dernier relevé) sous forme de relevé GPS. */
export function trackFix(track: Track, [e, n]: readonly [number, number] = [track.e, track.n]): GeoFix {
  const p = fromENU(track.origin, [e, n, 0])
  return { lat: p.lat, lon: p.lon, alt: track.alt, accuracy: track.accuracy, timestamp: track.t }
}
