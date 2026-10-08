// Suivi de la position du spectateur à partir du GPS.
//
// Filtre de Kalman « vitesse constante » dans un repère local Est-Nord :
// il lisse les relevés, estime la vitesse de marche pour faire avancer la
// position entre deux relevés (le GPS n'en donne qu'un par seconde) et,
// quand l'accéléromètre ne compte pas de pas, garde la position au lieu de
// suivre la dérive du GPS (quelques mètres, même immobile) : une photo à
// 6 m se décalerait de près de 30° pour 3 m d'erreur. Seul un écart qui
// persiste plusieurs secondes est un vrai déplacement, alors rattrapé.
//
// Estime à l'aveugle (« dead reckoning ») : quand l'accéléromètre compte les pas et que
// l'orientation est connue, chaque pas fait avancer la position (`walkTrack`) — le GPS
// ne voit pas quelques mètres de marche, noyés dans ses ±5 m. Pendant la marche et juste
// après, il ne la tire alors plus en arrière (il est en retard) ; seul un écart qui
// persiste une fois arrêté la corrige.
//
// Moyenne à l'arrêt (0.15.2) : immobile depuis `averageAfter`, la position est la moyenne
// pondérée (1 / précision²) des relevés depuis l'arrêt, sur au plus `averageWindow` — c'est
// là que l'on prend une photo. Ensuite elle est tenue comme avant (un écart persistant reste
// rattrapé). Pas après une marche comptée pas à pas (`stepped`) : sur quelques mètres, les pas
// sont plus justes que le GPS, qui ne les voit pas.

import { fromENU, toENU, type GeoFix, type GeoPoint } from './geodesy'
import type { MotionState } from './motion'

/**
 * Précision GPS (m) jusqu'à laquelle une photo est bien placée : au-delà, la pastille passe à
 * l'orange et le déclencheur prévient (« Position imprécise »).
 */
export const GPS_GOOD_ACCURACY = 12

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
  /**
   * Même seuil quand les pas font avancer la position (`stepping`) : les vrais déplacements sont
   * déjà comptés, un écart du GPS immobile en deçà de 8 m (ou de sa précision) n'est que sa
   * dérive — la suivre ferait glisser les photos alors qu'on n'a pas bougé.
   */
  steppedShift: 8,
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
  /**
   * Immobile depuis ce délai (ms), la position est la moyenne pondérée des relevés depuis
   * l'arrêt, pris pendant au plus `averageWindow` ms ; ensuite elle est tenue.
   */
  averageAfter: 2000,
  averageWindow: 10_000,
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
  /** Précision de la vitesse (m/s), null si inconnue (navigateur). */
  speedAccuracy?: number | null
  /** Cap du déplacement (degrés depuis le nord), null si inconnu ou à l'arrêt. */
  course?: number | null
  /** Précision de ce cap (degrés), null si inconnue (navigateur). */
  courseAccuracy?: number | null
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
  /** Début de l'arrêt en cours (ms), dont les relevés sont moyennés ; null en mouvement. */
  stillSince: number | null
  /** Relevés moyennés depuis l'arrêt. */
  average: StillAverage | null
  /** La position a avancé pas à pas depuis que le GPS l'a fixée : pas de moyenne à l'arrêt. */
  stepped: boolean
}

/** Sommes pondérées des relevés d'un arrêt (repère local du suivi). */
export interface StillAverage {
  /** Somme des poids 1 / précision². */
  w: number
  /** Sommes pondérées des positions (m). */
  e: number
  n: number
  /** Somme des inverses des variances des relevés : précision de la moyenne. */
  info: number
}

/** Variance d'un relevé : `accuracy` est un rayon de confiance, plus large qu'un écart-type. */
const measurementVariance = (accuracy: number) => Math.max(1, accuracy / 2) ** 2

/** Ajoute un relevé (`e`, `n` dans le repère local) à la moyenne d'un arrêt. */
function addToAverage(average: StillAverage | null, e: number, n: number, accuracy: number): StillAverage {
  const w = 1 / accuracy ** 2
  const a = average ?? { w: 0, e: 0, n: 0, info: 0 }
  return { w: a.w + w, e: a.e + w * e, n: a.n + w * n, info: a.info + 1 / measurementVariance(accuracy) }
}

/** Position moyenne d'un arrêt (Est, Nord). */
export const averagePosition = (a: StillAverage): [number, number] => [a.e / a.w, a.n / a.w]

function start(fix: GpsFix, mode: TrackMode, averaging: boolean): Track {
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
    stillSince: averaging ? fix.timestamp : null,
    average: averaging ? addToAverage(null, 0, 0, fix.accuracy) : null,
    stepped: false,
  }
}

/**
 * Intègre un relevé GPS ; `motion` dit si l'on marche (accéléromètre). `stepping` : les pas
 * font avancer la position (`walkTrack`) ; le GPS, en retard, ne la tire plus pendant la marche.
 */
export function updateTrack(prev: Track | null, fix: GpsFix, motion: MotionState, stepping = false): Track {
  // Sans accéléromètre, la vitesse GPS dit si l'on bouge (à défaut, on suit le GPS) ;
  // immobile mais rapide d'après le GPS : en véhicule.
  const speed = fix.speed != null && fix.speed >= 0 ? fix.speed : null
  // À pied, position avancée pas à pas : pendant la marche et juste après, on tient la position.
  const walking = stepping && (motion === 'moving' || motion === 'settling')
  const mode: TrackMode = walking
    ? 'still'
    : motion === 'unknown'
      ? speed == null || speed > TRACKING.movingSpeed
        ? 'moving'
        : 'still'
      : motion === 'still' && (speed ?? 0) > TRACKING.movingSpeed
        ? 'moving'
        : motion
  const still = mode === 'still'
  if (!prev || fix.timestamp - prev.t > TRACKING.maxGap) return start(fix, mode, still && !walking)
  const dt = Math.max(0, (fix.timestamp - prev.t) / 1000)
  let { e, n, ve, vn, pp, pv, vv } = prev

  const r = measurementVariance(fix.accuracy)
  const [ze, zn] = toENU(prev.origin, fix)
  // Écart moyen récent à l'arrêt : les allers-retours du GPS s'annulent, un déplacement non.
  const w = TRACKING.shiftWeight
  // En marchant, le GPS est en retard sur les pas : son écart ne compte qu'une fois arrêté.
  const se = walking ? prev.se * (1 - w) : still ? prev.se + (ze - e - prev.se) * w : 0
  const sn = walking ? prev.sn * (1 - w) : still ? prev.sn + (zn - n - prev.sn) * w : 0
  const shiftLimit = stepping
    ? Math.max(TRACKING.steppedShift, fix.accuracy)
    : Math.max(TRACKING.persistentShift, fix.accuracy / 2)
  const shifted = still && !walking && Math.hypot(se, sn) > shiftLimit
  const catchUntil = shifted ? fix.timestamp + TRACKING.catchUp : prev.catchUntil
  const catching = still && !walking && fix.timestamp < catchUntil

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
  if (mode === 'still' && !walking && Math.hypot(ye, yn) > Math.max(TRACKING.minJump, 3 * Math.sqrt(s))) {
    // Saut à l'arrêt : isolé (reflet du signal), on l'ignore ; confirmé, on s'y rend.
    if (prev.rejected >= 1) return start(fix, mode, !walking)
    return { ...prev, e, n, ve, vn, pp, pv, vv, t: fix.timestamp, mode, rejected: prev.rejected + 1, catchUntil }
  }

  // Arrêt : relevés moyennés (pondérés par 1 / précision²) depuis le début de l'arrêt, pendant
  // au plus `averageWindow` ; au-delà de `averageAfter`, la position est leur moyenne. Une marche
  // (même non détectée : écart persistant rattrapé) met fin à l'arrêt.
  const averaging = still && !walking && !catching && !prev.stepped
  const stillSince = averaging ? (prev.stillSince ?? fix.timestamp) : null
  const sinceStop = stillSince == null ? 0 : fix.timestamp - stillSince
  const inWindow = averaging && sinceStop < TRACKING.averageWindow
  const average = !averaging
    ? null
    : inWindow
      ? addToAverage(prev.stillSince == null ? null : prev.average, ze, zn, fix.accuracy)
      : prev.average
  const stop = { stillSince, average }
  if (inWindow && average && sinceStop >= TRACKING.averageAfter) {
    const [ae, an] = averagePosition(average)
    return {
      ...prev,
      e: ae,
      n: an,
      ve: 0,
      vn: 0,
      pp: 1 / average.info,
      pv: 0,
      vv: 0,
      accuracy: fix.accuracy,
      alt: fix.alt ?? prev.alt,
      t: fix.timestamp,
      mode,
      rejected: 0,
      se,
      sn,
      catchUntil,
      ...stop,
    }
  }

  const kp = pp / s
  const kv = pv / s
  if (walking || (still && !catching && kp < TRACKING.holdGain)) {
    // Immobile : on tient la position ; seul l'écart moyen du GPS est suivi. En marchant
    // pas à pas, la position avance avec les pas, pas avec le GPS (en retard).
    return { ...prev, e, n, ve, vn, pp, pv, vv, accuracy: fix.accuracy, t: fix.timestamp, mode, rejected: 0, se, sn, catchUntil, ...stop }
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
    ...stop,
    // Le GPS fixe de nouveau la position (en mouvement, ou écart rattrapé) : les pas sont oubliés.
    stepped: still && !catching ? prev.stepped : false,
  }
  return Math.hypot(track.e, track.n) > TRACKING.maxOffset ? recenter(track) : track
}

/** Fait avancer la position de `de`, `dn` m (Est, Nord) : pas comptés par l'accéléromètre. */
export function walkTrack(track: Track, de: number, dn: number): Track {
  // Sur quelques dizaines de mètres, les pas sont bien plus justes que le GPS : l'incertitude
  // ne change pas ; une erreur (mauvais sens, pas plus courts) est rattrapée une fois arrêté,
  // quand l'écart au GPS persiste.
  const moved: Track = {
    ...track,
    e: track.e + de,
    n: track.n + dn,
    // L'écart moyen du GPS était mesuré depuis l'ancienne position.
    se: track.se - de,
    sn: track.sn - dn,
    // On a bougé : l'arrêt en cours est terminé ; la position vient désormais des pas.
    stillSince: null,
    average: null,
    stepped: track.stepped || de !== 0 || dn !== 0,
  }
  return Math.hypot(moved.e, moved.n) > TRACKING.maxOffset ? recenter(moved) : moved
}

/** Place l'origine du repère local sur la position estimée. */
function recenter(track: Track): Track {
  const p = fromENU(track.origin, [track.e, track.n, 0])
  const a = track.average
  const average = a && { ...a, e: a.e - a.w * track.e, n: a.n - a.w * track.n }
  return { ...track, origin: { lat: p.lat, lon: p.lon }, e: 0, n: 0, average }
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
