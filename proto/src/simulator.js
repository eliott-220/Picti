/**
 * simulator.js — monde synthétique pour tester le géocadrage sans téléphone.
 *
 * Sur un Mac il n'y a ni GPS ni boussole : impossible de vérifier que le viseur
 * vise juste. Ce module fabrique une scène (horizon, graduations de boussole,
 * repères posés à des coordonnées réelles) rendue avec EXACTEMENT la même
 * projection que l'AR, et pilote les capteurs via leurs entrées `push()`.
 *
 * Attention à la portée de ce harnais : la scène et l'overlay partageant la
 * même projection, une erreur de projection s'y annulerait visuellement. C'est
 * un banc d'ergonomie et d'intégration — la correction, elle, est prouvée par
 * les tests unitaires de geocadrage.js.
 */

import {
  basisFromAim, cardinal, clamp, destination, enuOffset, normalize, normalizeDeg,
  projectDirection, scale, toDeg, toRad,
} from './geocadrage.js';

/** Hauteur d'œil supposée, en mètres. */
export const EYE_HEIGHT = 1.6;

/** Origine par défaut du monde simulé : le parvis de Notre-Dame. */
export const SIM_ORIGIN = { lat: 48.853, lon: 2.3499 };

/** Générateur déterministe — la scène est la même à chaque rechargement. */
function seeded(seed) {
  let s = seed;
  return () => ((s = (s * 1103515245 + 12345) % 2147483648) / 2147483648);
}

/** Pose une trentaine de repères verticaux autour de l'origine. */
export function buildLandmarks(origin = SIM_ORIGIN) {
  const rand = seeded(42);
  const marks = [];
  for (let i = 0; i < 30; i++) {
    const bearing = rand() * 360;
    const dist = 12 + rand() ** 2 * 260;
    const height = 3 + rand() * 22;
    marks.push({
      ...destination(origin, bearing, dist),
      height,
      width: 1.5 + rand() * 4,
      hue: Math.round(rand() * 360),
    });
  }
  return marks.sort((a, b) => b.height - a.height);
}

// ─────────────────────────────────────────────────────────────────────────────
// Découpe par demi-plan (pour remplir le sol sous l'horizon)
// ─────────────────────────────────────────────────────────────────────────────

/** Sutherland–Hodgman : garde la part du polygone où a·x + b·y + c ≤ 0. */
function clipHalfPlane(poly, a, b, c) {
  const inside = (p) => a * p.x + b * p.y + c <= 0;
  const out = [];
  for (let i = 0; i < poly.length; i++) {
    const cur = poly[i];
    const prev = poly[(i + poly.length - 1) % poly.length];
    const dCur = a * cur.x + b * cur.y + c;
    const dPrev = a * prev.x + b * prev.y + c;
    if (inside(cur) !== inside(prev)) {
      const t = dPrev / (dPrev - dCur);
      out.push({ x: prev.x + t * (cur.x - prev.x), y: prev.y + t * (cur.y - prev.y) });
    }
    if (inside(cur)) out.push(cur);
  }
  return out;
}

/**
 * Droite d'horizon dans le repère image, sous la forme a·x + b·y + c = 0
 * (côté négatif = sol). Dérivée algébriquement de d·Zénith = 0, donc exacte
 * quelle que soit l'inclinaison — pas de cas limite quand l'horizon sort du cadre.
 */
export function horizonLine(basis, view) {
  const A = view.tanH * basis.right[2];
  const B = view.tanV * basis.up[2];
  const C = basis.forward[2];
  return {
    a: (2 * A) / view.width,
    b: (-2 * B) / view.height,
    c: C - A + B,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Rendu de la scène
// ─────────────────────────────────────────────────────────────────────────────

export function drawScene(ctx, { basis, view, eye, landmarks, dark }) {
  const { width: W, height: H } = view;

  const sky = ctx.createLinearGradient(0, 0, 0, H);
  if (dark) {
    sky.addColorStop(0, '#0b1220');
    sky.addColorStop(1, '#22364f');
  } else {
    sky.addColorStop(0, '#8fb8dd');
    sky.addColorStop(1, '#d8e8f2');
  }
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, W, H);

  // Sol : demi-plan sous l'horizon.
  const line = horizonLine(basis, view);
  const rect = [{ x: 0, y: 0 }, { x: W, y: 0 }, { x: W, y: H }, { x: 0, y: H }];
  const ground = clipHalfPlane(rect, line.a, line.b, line.c);
  if (ground.length > 2) {
    ctx.beginPath();
    ctx.moveTo(ground[0].x, ground[0].y);
    for (const p of ground.slice(1)) ctx.lineTo(p.x, p.y);
    ctx.closePath();
    ctx.fillStyle = dark ? '#16201a' : '#4e5c48';
    ctx.fill();
    ctx.strokeStyle = dark ? '#3d5a4a' : '#e8eee4';
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }

  // Graduations de boussole, plantées sur l'horizon.
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (let az = 0; az < 360; az += 15) {
    const dir = basisFromAim(az, 0, 0).forward;
    const p = projectDirection(dir, basis, view);
    if (!p.inFront || p.x < -60 || p.x > W + 60) continue;
    const major = az % 45 === 0;
    ctx.strokeStyle = dark ? 'rgba(255,255,255,.45)' : 'rgba(255,255,255,.7)';
    ctx.lineWidth = major ? 2 : 1;
    ctx.beginPath();
    ctx.moveTo(p.x, p.y - (major ? 14 : 7));
    ctx.lineTo(p.x, p.y + (major ? 14 : 7));
    ctx.stroke();
    if (major) {
      ctx.fillStyle = dark ? 'rgba(255,255,255,.8)' : '#fff';
      ctx.font = '600 13px ui-monospace, monospace';
      ctx.fillText(cardinal(az), p.x, p.y - 26);
    }
  }

  // Repères verticaux : base et sommet projetés séparément → parallaxe réelle.
  for (const m of landmarks) {
    const off = enuOffset(eye, m);
    const base = normalize([off.east, off.north, -EYE_HEIGHT]);
    const top = normalize([off.east, off.north, m.height - EYE_HEIGHT]);
    const pb = projectDirection(base, basis, view);
    const pt = projectDirection(top, basis, view);
    if (!pb.inFront || !pt.inFront) continue;

    const dist = Math.hypot(off.east, off.north);
    if (pb.x < -200 || pb.x > W + 200) continue;

    // Largeur apparente = largeur réelle vue à cette distance.
    const px = ((m.width / dist) / view.tanH / 2) * W;
    const fade = Math.max(0.25, 1 - dist / 400);
    ctx.fillStyle = `hsla(${m.hue}, 35%, ${dark ? 42 : 62}%, ${fade})`;
    ctx.strokeStyle = `hsla(${m.hue}, 40%, ${dark ? 22 : 35}%, ${fade})`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.rect(pb.x - px / 2, pt.y, Math.max(px, 2), pb.y - pt.y);
    ctx.fill();
    ctx.stroke();
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Pilotage des capteurs simulés
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Traduit l'état des curseurs en fixes GPS et orientations, puis les injecte
 * dans les mêmes traceurs que les vrais capteurs. Le reste de l'app ne sait pas
 * qu'elle est en simulation.
 */
export function createSimulator({ position, orientation, origin = SIM_ORIGIN }) {
  const state = { east: 0, north: 0, yaw: 0, pitch: 0, roll: 0, accuracy: 6, jitter: true };
  const landmarks = buildLandmarks(origin);

  function eyePosition() {
    const northward = destination(origin, state.north >= 0 ? 0 : 180, Math.abs(state.north));
    return destination(northward, state.east >= 0 ? 90 : 270, Math.abs(state.east));
  }

  function emit() {
    const eye = eyePosition();
    const noise = state.jitter ? (Math.random() - 0.5) * state.accuracy * 0.6 : 0;
    const noisy = noise ? destination(eye, Math.random() * 360, Math.abs(noise)) : eye;
    position.push({ ...noisy, accuracy: state.accuracy, timestamp: Date.now() });

    // Le simulateur raisonne en visée (yaw/pitch/roll) ; les traceurs attendent
    // des angles d'Euler d'appareil. On passe par la convention W3C.
    orientation.push(...aimToDeviceAngles(state.yaw, state.pitch, state.roll));
  }

  return {
    state,
    landmarks,
    origin,
    eyePosition,
    set(patch) {
      Object.assign(state, patch);
      emit();
    },
    emit,
    basis: () => basisFromAim(state.yaw, state.pitch, state.roll),
  };
}

/**
 * Visée (yaw/pitch/roll) → angles d'Euler DeviceOrientation.
 *
 * Réciproque exacte de `cameraAim` : le simulateur traverse ainsi toute la vraie
 * chaîne de traitement (Euler → matrice → base → projection) au lieu de
 * court-circuiter la conversion, ce qui serait le seul endroit du code où un
 * bug pourrait se cacher sans jamais être vu.
 *
 * On reconstruit la matrice de rotation depuis la base visée, puis on en extrait
 * les angles selon la séquence intrinsèque Z-X'-Y'' de la spec W3C. Deux
 * subtilités :
 *   - en beta = ±90 (téléphone droit visant l'horizon) alpha et gamma sont
 *     confondus — verrouillage de cardan : on verse tout sur alpha ;
 *   - la décomposition admet deux solutions ; on retient celle avec |gamma| ≤ 90,
 *     qui est la convention que renvoient les vrais appareils.
 */
export function aimToDeviceAngles(yaw, pitch, roll = 0) {
  const b = basisFromAim(yaw, pitch, roll);
  const back = scale(b.forward, -1);
  // Colonnes de la matrice appareil → monde : [droite, haut, -axe optique].
  const R = [
    [b.right[0], b.up[0], back[0]],
    [b.right[1], b.up[1], back[1]],
    [b.right[2], b.up[2], back[2]],
  ];

  const beta = Math.asin(clamp(R[2][1], -1, 1));
  if (Math.abs(Math.cos(beta)) < 1e-9) {
    return [normalizeDeg(toDeg(Math.atan2(R[1][0], R[0][0]))), toDeg(beta), 0];
  }

  let alpha = toDeg(Math.atan2(-R[0][1], R[1][1]));
  let betaDeg = toDeg(beta);
  let gamma = toDeg(Math.atan2(-R[2][0], R[2][2]));

  if (Math.abs(gamma) > 90) {
    // Solution conjuguée, équivalente à la matrice près.
    alpha += 180;
    betaDeg = 180 - betaDeg;
    gamma += gamma > 0 ? -180 : 180;
  }
  // beta vit dans [-180, 180) : une rotation de 188° est la même que -172°.
  if (betaDeg >= 180) betaDeg -= 360;
  return [normalizeDeg(alpha), betaDeg, gamma];
}

/** Champ de vision vertical correspondant, utile pour l'affichage. */
export const vFovOf = (hFovDeg, aspect) =>
  (2 * Math.atan(Math.tan(toRad(hFovDeg) / 2) / aspect) * 180) / Math.PI;
