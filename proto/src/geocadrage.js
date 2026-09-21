/**
 * geocadrage.js — noyau géométrique du « géocadrage » PICTI.
 *
 * Module PUR : aucune dépendance, aucun DOM, aucun capteur. Il ne fait que de la
 * géométrie, ce qui le rend testable en Node (`npm test`) autant qu'utilisable
 * dans le navigateur. Toute la partie « sale » (permissions, GPS, caméra) vit
 * dans sensors.js.
 *
 * Idée centrale : une photo n'est pas géolocalisée par un simple point GPS, mais
 * par une POSE complète — d'où on regardait ET dans quelle direction. C'est cette
 * pose qu'on appelle ici une « GeoFrame », et c'est elle qui permet de revenir
 * superposer la photo dans son cadre d'origine.
 *
 * Repère monde utilisé partout : ENU (East-North-Up), tangent à la Terre au point
 * courant.
 *   x = est (+)   y = nord (+)   z = zénith (+)
 * Tous les angles publics sont en DEGRÉS.
 *
 * Convention de visée (yaw/pitch/roll) :
 *   yaw   = cap boussole de l'axe optique, 0 = nord, 90 = est   → [0, 360)
 *   pitch = élévation, 0 = horizon, +90 = zénith, -90 = nadir
 *   roll  = rotation autour de l'axe optique, 0 = horizon horizontal
 */

// ─────────────────────────────────────────────────────────────────────────────
// Constantes & scalaires
// ─────────────────────────────────────────────────────────────────────────────

/** Rayon terrestre moyen IUGG, en mètres. */
export const EARTH_RADIUS_M = 6371008.8;

const D2R = Math.PI / 180;
const R2D = 180 / Math.PI;

export const toRad = (deg) => deg * D2R;
export const toDeg = (rad) => rad * R2D;
export const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

/** Ramène un angle dans [0, 360). */
export function normalizeDeg(deg) {
  const a = deg % 360;
  return a < 0 ? a + 360 : a;
}

/** Plus petite rotation signée de `from` vers `to`, dans (-180, 180]. */
export function angleDelta(from, to) {
  const d = normalizeDeg(to - from);
  return d > 180 ? d - 360 : d;
}

/** Interpolation circulaire : avance de `t` (0..1) depuis `from` vers `to`. */
export function lerpAngle(from, to, t) {
  return from + angleDelta(from, to) * t;
}

/** Rampe douce : 0 sous `edge0`, 1 au-dessus de `edge1`, lissée entre les deux. */
export function smoothstep(edge0, edge1, x) {
  if (edge1 === edge0) return x < edge0 ? 0 : 1;
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

/** Point cardinal français le plus proche d'un cap. */
export function cardinal(deg) {
  const names = ['N', 'NE', 'E', 'SE', 'S', 'SO', 'O', 'NO'];
  return names[Math.round(normalizeDeg(deg) / 45) % 8];
}

// ─────────────────────────────────────────────────────────────────────────────
// Algèbre vectorielle 3D (vecteurs = [x, y, z])
// ─────────────────────────────────────────────────────────────────────────────

export const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const scale = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
export const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const len = (a) => Math.hypot(a[0], a[1], a[2]);

export const cross = (a, b) => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];

export function normalize(a) {
  const l = len(a);
  return l < 1e-12 ? [0, 0, 0] : [a[0] / l, a[1] / l, a[2] / l];
}

/** Angle non signé entre deux vecteurs, en degrés. */
export function angleBetween(a, b) {
  return toDeg(Math.acos(clamp(dot(normalize(a), normalize(b)), -1, 1)));
}

// ─────────────────────────────────────────────────────────────────────────────
// Géodésie
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Distance orthodromique (haversine) entre deux points, en mètres.
 * @param {{lat:number, lon:number}} a
 * @param {{lat:number, lon:number}} b
 */
export function distance(a, b) {
  const la1 = toRad(a.lat);
  const la2 = toRad(b.lat);
  const dLat = la2 - la1;
  const dLon = toRad(b.lon - a.lon);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(la1) * Math.cos(la2) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * Décalage local en mètres (approximation plan tangent, exacte à ~1 cm sous 1 km).
 * C'est ce qu'on utilise pour l'AR : à cette échelle, la Terre est plate.
 * @returns {{east:number, north:number, up:number}}
 */
export function enuOffset(from, to) {
  const midLat = toRad((from.lat + to.lat) / 2);
  const hasAlt = Number.isFinite(from.alt) && Number.isFinite(to.alt);
  return {
    east: toRad(to.lon - from.lon) * Math.cos(midLat) * EARTH_RADIUS_M,
    north: toRad(to.lat - from.lat) * EARTH_RADIUS_M,
    up: hasAlt ? to.alt - from.alt : 0,
  };
}

/** Cap initial (azimut vrai) de `from` vers `to`, en degrés [0, 360). */
export function bearing(from, to) {
  const la1 = toRad(from.lat);
  const la2 = toRad(to.lat);
  const dLon = toRad(to.lon - from.lon);
  const y = Math.sin(dLon) * Math.cos(la2);
  const x = Math.cos(la1) * Math.sin(la2) - Math.sin(la1) * Math.cos(la2) * Math.cos(dLon);
  return normalizeDeg(toDeg(Math.atan2(y, x)));
}

/** Point atteint depuis `from` en suivant un cap sur une distance donnée. */
export function destination(from, bearingDeg, distanceM) {
  const d = distanceM / EARTH_RADIUS_M;
  const br = toRad(bearingDeg);
  const la1 = toRad(from.lat);
  const lo1 = toRad(from.lon);
  const la2 = Math.asin(
    Math.sin(la1) * Math.cos(d) + Math.cos(la1) * Math.sin(d) * Math.cos(br),
  );
  const lo2 =
    lo1 +
    Math.atan2(
      Math.sin(br) * Math.sin(d) * Math.cos(la1),
      Math.cos(d) - Math.sin(la1) * Math.sin(la2),
    );
  return { lat: toDeg(la2), lon: normalizeDeg(toDeg(lo2) + 180) - 180 };
}

/** Vecteur unitaire ENU pointant de `from` vers `to`. */
export function directionTo(from, to) {
  const o = enuOffset(from, to);
  return normalize([o.east, o.north, o.up]);
}

// ─────────────────────────────────────────────────────────────────────────────
// Orientation de l'appareil → base caméra
// ─────────────────────────────────────────────────────────────────────────────

const rotX = (t) => [[1, 0, 0], [0, Math.cos(t), -Math.sin(t)], [0, Math.sin(t), Math.cos(t)]];
const rotY = (t) => [[Math.cos(t), 0, Math.sin(t)], [0, 1, 0], [-Math.sin(t), 0, Math.cos(t)]];
const rotZ = (t) => [[Math.cos(t), -Math.sin(t), 0], [Math.sin(t), Math.cos(t), 0], [0, 0, 1]];

function matMul(m, n) {
  const out = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  for (let i = 0; i < 3; i++)
    for (let j = 0; j < 3; j++)
      out[i][j] = m[i][0] * n[0][j] + m[i][1] * n[1][j] + m[i][2] * n[2][j];
  return out;
}

const column = (m, j) => [m[0][j], m[1][j], m[2][j]];

/**
 * Matrice de rotation appareil → monde ENU, à partir des angles d'Euler du
 * DeviceOrientationEvent (rotation intrinsèque Z-X'-Y'', cf. spec W3C).
 *
 * `screenAngle` (screen.orientation.angle) compense la rotation du contenu à
 * l'écran : elle ne change PAS l'axe optique (l'objectif reste dans l'axe -Z de
 * l'appareil quelle que soit l'orientation de l'affichage), mais elle fait
 * pivoter les axes « droite » et « haut » de l'image affichée.
 */
export function orientationMatrix(alpha = 0, beta = 0, gamma = 0, screenAngle = 0) {
  const base = matMul(matMul(rotZ(toRad(alpha)), rotX(toRad(beta))), rotY(toRad(gamma)));
  return screenAngle ? matMul(base, rotZ(toRad(-screenAngle))) : base;
}

/**
 * Base orthonormée de la caméra arrière, exprimée en ENU.
 * `forward` = axe optique (axe -Z de l'appareil), `right`/`up` = axes de l'image.
 * @param {{alpha:number, beta:number, gamma:number, screenAngle?:number}} o
 */
export function cameraBasis(o) {
  const m = orientationMatrix(o.alpha, o.beta, o.gamma, o.screenAngle ?? 0);
  return {
    right: column(m, 0),
    up: column(m, 1),
    forward: scale(column(m, 2), -1),
  };
}

/** Base caméra → angles de visée lisibles {yaw, pitch, roll}. */
export function aimFromBasis(basis) {
  const f = basis.forward;
  const yaw = normalizeDeg(toDeg(Math.atan2(f[0], f[1])));
  const pitch = toDeg(Math.asin(clamp(f[2], -1, 1)));

  // Roll = rotation de l'image autour de l'axe optique, mesurée par rapport à
  // une référence « horizon horizontal ».
  const ref = horizonReference(f);
  const roll = toDeg(Math.atan2(dot(basis.right, ref.up), dot(basis.right, ref.right)));
  return { yaw, pitch, roll };
}

/** Base de référence (roll = 0) pour un axe optique donné. */
function horizonReference(forward) {
  const ZUP = [0, 0, 1];
  let right = cross(forward, ZUP);
  if (len(right) < 1e-6) right = cross(forward, [0, 1, 0]); // visée au zénith/nadir
  right = normalize(right);
  return { right, up: normalize(cross(right, forward)) };
}

/** Opération inverse de `aimFromBasis` : reconstruit une base à partir des angles. */
export function basisFromAim(yaw, pitch, roll = 0) {
  const y = toRad(yaw);
  const p = toRad(pitch);
  const r = toRad(roll);
  const forward = [Math.sin(y) * Math.cos(p), Math.cos(y) * Math.cos(p), Math.sin(p)];
  const ref = horizonReference(forward);
  return {
    forward,
    right: add(scale(ref.right, Math.cos(r)), scale(ref.up, Math.sin(r))),
    up: add(scale(ref.right, -Math.sin(r)), scale(ref.up, Math.cos(r))),
  };
}

/** Raccourci : angles de visée directement depuis un DeviceOrientationEvent. */
export function cameraAim(o) {
  return aimFromBasis(cameraBasis(o));
}

// ─────────────────────────────────────────────────────────────────────────────
// Projection (modèle sténopé)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Décrit le viseur courant.
 * @param {number} width  largeur affichée, px
 * @param {number} height hauteur affichée, px
 * @param {number} hFovDeg champ horizontal de la vue affichée (voir README : à calibrer)
 */
export function makeView(width, height, hFovDeg) {
  const tanH = Math.tan(toRad(hFovDeg) / 2);
  return { width, height, hFovDeg, tanH, tanV: (tanH * height) / width };
}

/**
 * Projette une direction monde (ENU) dans le viseur.
 * @returns {{inFront:boolean, u:number, v:number, x:number, y:number, depth:number}}
 *   u/v sont normalisés dans [-1, 1] sur les bords de l'image ; x/y sont en pixels.
 */
export function projectDirection(dirWorld, basis, view) {
  const d = normalize(dirWorld);
  const z = dot(d, basis.forward);
  const inFront = z > 1e-4;
  // Derrière la caméra, on garde une direction utilisable pour la flèche de bord.
  const zz = inFront ? z : 1e-4;
  const u = dot(d, basis.right) / zz / view.tanH;
  const v = dot(d, basis.up) / zz / view.tanV;
  return {
    inFront,
    u,
    v,
    x: (0.5 + u / 2) * view.width,
    y: (0.5 - v / 2) * view.height,
    depth: z,
  };
}

/**
 * Directions des 4 coins + du centre du cadre d'origine d'une GeoFrame.
 * Ordre des coins : haut-gauche, haut-droit, bas-droit, bas-gauche.
 */
export function frameRays(frame) {
  const basis = basisFromAim(frame.yaw, frame.pitch, frame.roll ?? 0);
  const tanH = Math.tan(toRad(frame.hFovDeg) / 2);
  const tanV = tanH / (frame.aspect || 1);
  const corner = (sx, sy) =>
    normalize(add(basis.forward, add(scale(basis.right, sx * tanH), scale(basis.up, sy * tanV))));
  return {
    center: basis.forward,
    corners: [corner(-1, 1), corner(1, 1), corner(1, -1), corner(-1, -1)],
  };
}

/** Projette le cadre d'origine dans le viseur courant. */
export function projectFrame(frame, basis, view) {
  const rays = frameRays(frame);
  return {
    center: projectDirection(rays.center, basis, view),
    corners: rays.corners.map((r) => projectDirection(r, basis, view)),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Résolution : « où suis-je par rapport au cadre ? »
// ─────────────────────────────────────────────────────────────────────────────

export const DEFAULT_OPTIONS = {
  /** Rayon en deçà duquel on considère être « sur place ». */
  arrivalRadiusM: 8,
  /** Le rayon ne descend jamais sous accuracy × ce facteur : inutile de mentir. */
  accuracyFactor: 1.5,
  /** Écart angulaire total sous lequel le cadre est considéré verrouillé. */
  aimToleranceDeg: 10,
};

/**
 * Compare la pose courante à celle d'une GeoFrame et produit tout ce dont
 * l'interface a besoin : distance, caps, erreurs angulaires, score, consigne.
 *
 * @param {object}  frame  la GeoFrame cible {lat, lon, alt?, yaw, pitch, roll, hFovDeg, aspect}
 * @param {object?} fix    position courante {lat, lon, alt?, accuracy?} ou null
 * @param {object?} aim    visée courante {yaw, pitch, roll} ou null (pas de boussole)
 */
export function solve(frame, fix, aim, options = {}) {
  const opt = { ...DEFAULT_OPTIONS, ...options };

  if (!fix) {
    return {
      phase: 'locating',
      hint: 'Recherche du signal GPS…',
      score: 0,
      distance: null,
      bearing: null,
      radius: opt.arrivalRadiusM,
      positionScore: 0,
      aimScore: 0,
      yawError: null,
      pitchError: null,
      bearingError: null,
    };
  }

  const radius = Math.max(opt.arrivalRadiusM, (fix.accuracy ?? 0) * opt.accuracyFactor);
  const dist = distance(fix, frame);
  const brg = bearing(fix, frame);
  const positionScore = 1 - smoothstep(0, radius, dist);

  const yawError = aim ? angleDelta(aim.yaw, frame.yaw) : null;
  const pitchError = aim ? frame.pitch - aim.pitch : null;
  const bearingError = aim ? angleDelta(aim.yaw, brg) : null;
  const aimOff = aim ? Math.hypot(yawError, pitchError) : null;
  const aimScore = aim ? 1 - smoothstep(0, opt.aimToleranceDeg * 3, aimOff) : 0;

  const onSite = dist <= radius;
  const locked = onSite && aim != null && aimOff <= opt.aimToleranceDeg;
  const phase = locked ? 'locked' : onSite ? 'framing' : 'approach';

  return {
    phase,
    hint: buildHint({ phase, dist, brg, bearingError, yawError, pitchError, opt }),
    distance: dist,
    bearing: brg,
    radius,
    accuracy: fix.accuracy ?? null,
    yawError,
    pitchError,
    bearingError,
    positionScore,
    aimScore,
    score: positionScore * (aim ? aimScore : 0),
  };
}

function buildHint({ phase, dist, brg, bearingError, yawError, pitchError, opt }) {
  const turn = (err) => (err > 0 ? 'à droite' : 'à gauche');

  if (phase === 'approach') {
    const d = dist > 1000 ? `${(dist / 1000).toFixed(1)} km` : `${Math.round(dist)} m`;
    if (bearingError == null) return `${d} — cap ${Math.round(brg)}° (${cardinal(brg)})`;
    if (Math.abs(bearingError) < 20) return `${d} devant toi — avance`;
    return `${d} — tourne ${turn(bearingError)} de ${Math.round(Math.abs(bearingError))}°`;
  }

  if (phase === 'framing') {
    if (yawError == null) return 'Tu y es. Boussole indisponible — cherche à vue.';
    if (Math.abs(yawError) > opt.aimToleranceDeg)
      return `Tu y es. Tourne ${turn(yawError)} de ${Math.round(Math.abs(yawError))}°`;
    if (Math.abs(pitchError) > opt.aimToleranceDeg)
      return `Presque — ${pitchError > 0 ? 'relève' : 'baisse'} de ${Math.round(Math.abs(pitchError))}°`;
    return 'Presque — affine le cadrage';
  }

  if (phase === 'locked') return 'Cadre retrouvé. Regarde.';
  return 'Recherche du signal GPS…';
}

// ─────────────────────────────────────────────────────────────────────────────
// GeoFrame
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Construit une GeoFrame à partir d'un point GPS et d'une visée.
 * C'est l'unique objet à persister : une photo + ces champs = un géocadrage.
 */
export function createGeoFrame({ fix, aim, hFovDeg, aspect, photo = null, title = '', id = null }) {
  return {
    id: id ?? `gf_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
    title,
    lat: fix.lat,
    lon: fix.lon,
    alt: Number.isFinite(fix.alt) ? fix.alt : null,
    accuracy: fix.accuracy ?? null,
    yaw: aim.yaw,
    pitch: aim.pitch,
    roll: aim.roll ?? 0,
    hFovDeg,
    aspect,
    headingSource: aim.source ?? 'unknown',
    capturedAt: Date.now(),
    photo,
  };
}
