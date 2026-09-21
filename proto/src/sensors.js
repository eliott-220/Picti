/**
 * sensors.js — acquisition GPS + orientation, filtrée.
 *
 * Contrairement à geocadrage.js, ce module touche aux API du navigateur. Il
 * s'occupe de tout ce qui est pénible dans la vraie vie :
 *   - les permissions iOS (DeviceOrientationEvent.requestPermission)
 *   - les trois façons incompatibles d'obtenir un cap absolu
 *   - le bruit du GPS (filtre de Kalman 1D pondéré par la précision annoncée)
 *   - le tremblement de la boussole (passe-bas circulaire)
 *
 * Chaque capteur expose la même API : start() / stop() / subscribe(fn) / get().
 */

import { angleDelta, normalizeDeg } from './geocadrage.js';

// ─────────────────────────────────────────────────────────────────────────────
// Petit émetteur d'événements
// ─────────────────────────────────────────────────────────────────────────────

function emitter() {
  const listeners = new Set();
  return {
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    emit(value) {
      for (const fn of listeners) fn(value);
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Permissions
// ─────────────────────────────────────────────────────────────────────────────

/** iOS 13+ exige un appel explicite depuis un geste utilisateur. */
export function needsMotionPermission() {
  return (
    typeof DeviceOrientationEvent !== 'undefined' &&
    typeof DeviceOrientationEvent.requestPermission === 'function'
  );
}

/** @returns {Promise<'granted'|'denied'|'unsupported'>} */
export async function requestMotionPermission() {
  if (!needsMotionPermission()) {
    return typeof DeviceOrientationEvent === 'undefined' ? 'unsupported' : 'granted';
  }
  try {
    return await DeviceOrientationEvent.requestPermission();
  } catch {
    return 'denied';
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Position
// ─────────────────────────────────────────────────────────────────────────────

const POSITION_DEFAULTS = {
  /** Vitesse de dérive supposée (m/s) : gonfle l'incertitude entre deux fixes. */
  processNoise: 1.2,
  /** Un fix s'écartant de plus de N sigmas de l'estimation est rejeté. */
  rejectSigma: 6,
  /** Nombre de rejets consécutifs au-delà duquel on se recale sur le GPS. */
  maxConsecutiveRejections: 3,
  /** Au-delà, on repart de zéro plutôt que de s'accrocher à un état périmé. */
  staleMs: 30_000,
};

/**
 * Suivi de position avec lissage.
 *
 * Le filtre est un Kalman scalaire sur la position : l'incertitude grandit avec
 * le temps écoulé, et chaque nouveau fix est intégré avec un poids inversement
 * proportionnel à son `accuracy`. Résultat : un point stable quand on ne bouge
 * pas, réactif quand on marche, et immunisé aux sauts de 200 m du GPS urbain.
 */
export function createPositionTracker(options = {}) {
  const opt = { ...POSITION_DEFAULTS, ...options };
  const bus = emitter();

  let watchId = null;
  let raw = null;      // dernier fix brut du navigateur
  let filtered = null; // estimation lissée
  let variance = -1;   // m², -1 = pas encore initialisé
  let lastAt = 0;
  let error = null;
  let rejected = 0;
  let consecutive = 0;

  function reset() {
    filtered = null;
    variance = -1;
    lastAt = 0;
    consecutive = 0;
  }

  /** Repart de ce fix, en oubliant l'historique. */
  function adopt(fix, measured) {
    filtered = { ...fix };
    variance = measured;
    lastAt = fix.timestamp;
    consecutive = 0;
  }

  function integrate(fix) {
    const accuracy = Math.max(fix.accuracy ?? 25, 1);
    const measured = accuracy * accuracy;

    if (variance < 0 || fix.timestamp - lastAt > opt.staleMs) {
      adopt(fix, measured);
      return true;
    }

    const dt = Math.max((fix.timestamp - lastAt) / 1000, 0);
    variance += (dt * opt.processNoise) ** 2;

    // Rejet des sauts aberrants : on compare l'écart au budget d'incertitude.
    const sigma = Math.sqrt(variance + measured);
    const jump = metersBetween(filtered, fix);
    if (jump > opt.rejectSigma * sigma) {
      consecutive++;
      // Un « aberrant » qui se répète n'en est pas un : c'est un vrai
      // déplacement (sortie de tunnel, reprise de signal, trajet rapide).
      // Sans cette porte de sortie, le filtre reste accroché à une position
      // périmée pendant des dizaines de fixes.
      if (consecutive < opt.maxConsecutiveRejections) {
        rejected++; // ne compte que les fixes réellement jetés
        return false;
      }
      adopt(fix, measured);
      return true;
    }
    consecutive = 0;

    const k = variance / (variance + measured);
    filtered = {
      lat: filtered.lat + k * (fix.lat - filtered.lat),
      lon: filtered.lon + k * (fix.lon - filtered.lon),
      alt: Number.isFinite(fix.alt)
        ? Number.isFinite(filtered.alt) ? filtered.alt + k * (fix.alt - filtered.alt) : fix.alt
        : filtered.alt ?? null,
      accuracy: Math.sqrt((1 - k) * variance),
      timestamp: fix.timestamp,
    };
    variance = (1 - k) * variance;
    lastAt = fix.timestamp;
    return true;
  }

  function onPosition(pos) {
    error = null;
    raw = {
      lat: pos.coords.latitude,
      lon: pos.coords.longitude,
      alt: Number.isFinite(pos.coords.altitude) ? pos.coords.altitude : null,
      accuracy: pos.coords.accuracy,
      speed: Number.isFinite(pos.coords.speed) ? pos.coords.speed : null,
      timestamp: pos.timestamp,
    };
    if (integrate(raw)) bus.emit(snapshot());
  }

  function onError(err) {
    error = { code: err.code, message: err.message };
    bus.emit(snapshot());
  }

  const snapshot = () => ({ raw, filtered, error, rejected, active: watchId !== null });

  return {
    subscribe: bus.subscribe,
    get: snapshot,
    /** Injecte un fix sans passer par le GPS (mode simulation, tests). */
    push(fix) {
      raw = { timestamp: Date.now(), accuracy: 5, alt: null, ...fix };
      if (integrate(raw)) bus.emit(snapshot());
    },
    reset,
    start() {
      if (watchId !== null) return true;
      if (!('geolocation' in navigator)) {
        error = { code: -1, message: 'Géolocalisation non supportée' };
        return false;
      }
      watchId = navigator.geolocation.watchPosition(onPosition, onError, {
        enableHighAccuracy: true,
        maximumAge: 0,
        timeout: 20_000,
      });
      return true;
    },
    stop() {
      if (watchId !== null) navigator.geolocation.clearWatch(watchId);
      watchId = null;
    },
  };
}

/** Distance plane rapide, suffisante pour juger d'un saut GPS. */
function metersBetween(a, b) {
  const R = 6371008.8;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLon = ((b.lon - a.lon) * Math.PI) / 180;
  const lat = ((a.lat + b.lat) / 2) * (Math.PI / 180);
  return Math.hypot(dLat, dLon * Math.cos(lat)) * R;
}

// ─────────────────────────────────────────────────────────────────────────────
// Orientation
// ─────────────────────────────────────────────────────────────────────────────

const ORIENTATION_DEFAULTS = {
  /** Constante de temps du passe-bas, en ms. Plus grand = plus stable, plus mou. */
  timeConstantMs: 120,
  /** Horloge injectable : rend le filtre déterministe en test. */
  now: () => performance.now(),
};

/**
 * Suivi de l'orientation, normalisé en angles d'Euler absolus (référence nord).
 *
 * Trois sources possibles, par ordre de préférence :
 *   1. `webkitCompassHeading` (Safari iOS)  → cap vrai, converti en alpha absolu
 *   2. `deviceorientationabsolute`          → alpha déjà absolu (Chrome Android)
 *   3. `deviceorientation` relatif          → INUTILISABLE pour le géocadrage,
 *      signalé comme tel plutôt que d'afficher un cap faux
 */
export function createOrientationTracker(options = {}) {
  const opt = { ...ORIENTATION_DEFAULTS, ...options };
  const bus = emitter();

  let running = false;
  let smoothed = null;   // { alpha, beta, gamma }
  let source = 'none';   // 'ios-compass' | 'absolute' | 'relative' | 'none'
  let accuracy = null;   // degrés, quand l'appareil le dit
  let lastAt = 0;
  /** Décalage manuel (déclinaison magnétique, calibration à vue). */
  let offsetDeg = 0;

  function screenAngle() {
    if (typeof screen !== 'undefined' && screen.orientation) return screen.orientation.angle || 0;
    return typeof window !== 'undefined' && Number.isFinite(window.orientation)
      ? normalizeDeg(window.orientation)
      : 0;
  }

  function ingest(alpha, beta, gamma, nextSource, nextAccuracy) {
    // Une source moins fiable ne doit pas écraser une source absolue déjà en place.
    if (rank(nextSource) < rank(source)) return;
    source = nextSource;
    accuracy = nextAccuracy;

    const now = opt.now();
    if (!smoothed) {
      smoothed = { alpha, beta, gamma };
    } else {
      // Poids dépendant du temps écoulé : le lissage ne dépend pas de la
      // fréquence du capteur (qui varie de 10 à 60 Hz selon l'appareil).
      const t = 1 - Math.exp(-Math.max(now - lastAt, 0) / opt.timeConstantMs);
      smoothed = {
        alpha: smoothed.alpha + angleDelta(smoothed.alpha, alpha) * t,
        beta: smoothed.beta + angleDelta(smoothed.beta, beta) * t,
        gamma: smoothed.gamma + angleDelta(smoothed.gamma, gamma) * t,
      };
    }
    lastAt = now;
    bus.emit(snapshot());
  }

  function handle(event) {
    if (event.alpha == null && event.webkitCompassHeading == null) return;

    if (Number.isFinite(event.webkitCompassHeading)) {
      // iOS donne un cap vrai ; alpha absolu = 360 − cap.
      ingest(
        360 - event.webkitCompassHeading,
        event.beta ?? 0,
        event.gamma ?? 0,
        'ios-compass',
        event.webkitCompassAccuracy >= 0 ? event.webkitCompassAccuracy : null,
      );
      return;
    }

    const isAbsolute = event.absolute === true || event.type === 'deviceorientationabsolute';
    ingest(event.alpha ?? 0, event.beta ?? 0, event.gamma ?? 0, isAbsolute ? 'absolute' : 'relative', null);
  }

  function snapshot() {
    if (!smoothed) {
      return { orientation: null, source, accuracy, absolute: false, screenAngle: screenAngle(), offsetDeg, active: running };
    }
    return {
      orientation: {
        alpha: normalizeDeg(smoothed.alpha + offsetDeg),
        beta: smoothed.beta,
        gamma: smoothed.gamma,
        screenAngle: screenAngle(),
      },
      source,
      accuracy,
      absolute: source === 'ios-compass' || source === 'absolute',
      screenAngle: screenAngle(),
      offsetDeg,
      active: running,
    };
  }

  const rank = (s) => ({ none: 0, relative: 1, absolute: 2, 'ios-compass': 3 }[s] ?? 0);

  return {
    subscribe: bus.subscribe,
    get: snapshot,
    /** Correction manuelle du nord (déclinaison magnétique ou calibration à vue). */
    setOffset(deg) {
      offsetDeg = deg;
      if (smoothed) bus.emit(snapshot());
    },
    /** Injecte une orientation sans capteur (mode simulation, tests). */
    push(alpha, beta, gamma) {
      ingest(alpha, beta, gamma, 'absolute', null);
    },
    start() {
      if (running || typeof window === 'undefined') return running;
      window.addEventListener('deviceorientationabsolute', handle, true);
      window.addEventListener('deviceorientation', handle, true);
      running = true;
      return true;
    },
    stop() {
      if (typeof window === 'undefined') return;
      window.removeEventListener('deviceorientationabsolute', handle, true);
      window.removeEventListener('deviceorientation', handle, true);
      running = false;
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Caméra
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Ouvre le flux de la caméra arrière.
 * @returns {Promise<{stream:MediaStream, settings:MediaTrackSettings}>}
 */
export async function openRearCamera(constraints = {}) {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error("La caméra n'est pas accessible sur ce navigateur.");
  }
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: false,
    video: {
      facingMode: { ideal: 'environment' },
      width: { ideal: 1280 },
      height: { ideal: 720 },
      ...constraints,
    },
  });
  const track = stream.getVideoTracks()[0];
  return { stream, track, settings: track?.getSettings?.() ?? {} };
}

/**
 * Tente de déduire le champ horizontal du capteur.
 * Aucun navigateur n'expose la focale : on retombe sur une valeur typique de
 * grand-angle de smartphone, que l'utilisateur peut corriger à la main.
 */
export function estimateHorizontalFov(track, fallbackDeg = 66) {
  const caps = track?.getCapabilities?.();
  if (caps && Number.isFinite(caps.focalLength) && Number.isFinite(caps.width?.max)) {
    // Chemin rare (quelques Android) : FOV = 2·atan(capteur / 2f).
    const sensorMm = 5.6;
    return (2 * Math.atan(sensorMm / (2 * caps.focalLength)) * 180) / Math.PI;
  }
  return fallbackDeg;
}
