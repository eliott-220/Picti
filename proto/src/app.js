/**
 * app.js — banc d'essai du géocadrage.
 *
 * Assemble les quatre couches : capteurs → géométrie → solution → rendu.
 * Volontairement mince : dès qu'un calcul apparaît ici, c'est qu'il devrait
 * vivre dans geocadrage.js (et donc être testé).
 */

import * as G from './geocadrage.js';
import {
  createOrientationTracker, createPositionTracker, needsMotionPermission,
  openRearCamera, requestMotionPermission,
} from './sensors.js';
import { createSimulator, drawScene, EYE_HEIGHT } from './simulator.js';
import {
  drawEdgeArrow, drawGhost, drawHud, drawRadar, drawReticle, fitCanvas, formatDistance,
} from './renderer.js';

const STORE_KEY = 'picti_geoframes_v1';
const PREFS_KEY = 'picti_proto_prefs_v1';

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => [...document.querySelectorAll(sel)];

// ─────────────────────────────────────────────────────────────────────────────
// État
// ─────────────────────────────────────────────────────────────────────────────

const position = createPositionTracker();
const orientation = createOrientationTracker();
const simulator = createSimulator({ position, orientation });

const state = {
  tab: 'pose',
  sim: false,
  frames: load(STORE_KEY, []),
  selected: 0,
  prefs: { fovDeg: 66, declinationDeg: 0, ...load(PREFS_KEY, {}) },
  stream: null,
  images: new Map(), // id → HTMLImageElement décodée
};

function load(key, fallback) {
  try {
    return JSON.parse(localStorage.getItem(key)) ?? fallback;
  } catch {
    return fallback;
  }
}

function save(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Lecture de la pose courante
// ─────────────────────────────────────────────────────────────────────────────

/** Position retenue pour les calculs : la version lissée. */
const currentFix = () => position.get().filtered;

/** Visée courante, ou null si la boussole ne donne pas de nord fiable. */
function currentAim() {
  const o = orientation.get();
  if (!o.orientation || !o.absolute) return null;
  return { ...G.cameraAim(o.orientation), source: o.source };
}

/** Base caméra utilisée pour la projection ; en simulation, la visée fait foi. */
function currentBasis() {
  const o = orientation.get();
  if (o.orientation) return G.cameraBasis(o.orientation);
  return G.basisFromAim(0, 0, 0);
}

// ─────────────────────────────────────────────────────────────────────────────
// Onglets
// ─────────────────────────────────────────────────────────────────────────────

const stage = $('#stage');

function setTab(name) {
  state.tab = name;
  $$('.tabs button').forEach((b) => b.classList.toggle('on', b.dataset.tab === name));
  $$('.tab').forEach((s) => s.classList.toggle('on', s.id === `tab-${name}`));

  // Une seule scène pour deux onglets : on la déplace au lieu d'ouvrir deux flux.
  if (name === 'graver') $('#slotGraver').append(stage);
  else if (name === 'viser') $('#slotViser').append(stage);
  stage.classList.toggle('idle', name === 'pose');
  stage.classList.toggle('bw', name === 'graver');

  if (name !== 'pose' && !state.sim) ensureCamera();
  renderList();
  renderViserLabel();
}

$$('.tabs button').forEach((b) => b.addEventListener('click', () => setTab(b.dataset.tab)));

// ─────────────────────────────────────────────────────────────────────────────
// Capteurs / simulation
// ─────────────────────────────────────────────────────────────────────────────

async function enableSensors() {
  const perm = await requestMotionPermission();
  if (perm === 'granted') orientation.start();
  position.start();

  setSim(false);
  $('#permBox').classList.add('hidden');

  if (perm === 'denied') {
    note("Permission boussole refusée — le viseur ne pourra pas s'orienter.");
  }
}

function setSim(on) {
  state.sim = on;
  $('#modeBadge').textContent = on ? 'simulation' : 'capteurs';
  $('#modeBadge').dataset.sim = on ? '1' : '0';
  $('#simPanel').classList.toggle('hidden', !on);
  $('#video').classList.toggle('hidden', on);
  $('#scene').classList.toggle('hidden', !on);

  if (on) {
    position.stop();
    orientation.stop();
    position.reset();
    stopCamera();
    simulator.emit();
    $('#permBox').classList.add('hidden');
    note('');
  }
}

$('#btnEnable').addEventListener('click', enableSensors);
$('#btnSim').addEventListener('click', () => setSim(true));
$('#modeBadge').addEventListener('click', () => (state.sim ? enableSensors() : setSim(true)));

$$('[data-sim]').forEach((input) => {
  input.addEventListener('input', () => {
    const key = input.dataset.sim;
    const value = Number(input.value);
    simulator.set({ [key]: value });
    const unit = key === 'east' || key === 'north' ? ' m' : key === 'accuracy' ? ' m' : '°';
    $(`[data-v="${key}"]`).textContent = `${value}${unit}`;
  });
});

// ── Calibration ──────────────────────────────────────────────────────────────

$('#fov').addEventListener('input', (e) => {
  state.prefs.fovDeg = Number(e.target.value);
  $('#fovVal').textContent = `${state.prefs.fovDeg}°`;
  save(PREFS_KEY, state.prefs);
});

$('#decl').addEventListener('input', (e) => {
  state.prefs.declinationDeg = Number(e.target.value);
  $('#declVal').textContent = `${state.prefs.declinationDeg}°`;
  orientation.setOffset(state.prefs.declinationDeg);
  save(PREFS_KEY, state.prefs);
});

// ─────────────────────────────────────────────────────────────────────────────
// Caméra
// ─────────────────────────────────────────────────────────────────────────────

async function ensureCamera() {
  if (state.stream || state.sim) return;
  try {
    const { stream } = await openRearCamera();
    state.stream = stream;
    $('#video').srcObject = stream;
    await $('#video').play();
    note('');
  } catch (err) {
    note(`Caméra indisponible (${err.name}). Bascule en simulation pour tester quand même.`);
  }
}

function stopCamera() {
  state.stream?.getTracks().forEach((t) => t.stop());
  state.stream = null;
  $('#video').srcObject = null;
}

const note = (msg) => ($('#stageMsg').textContent = msg);

// ─────────────────────────────────────────────────────────────────────────────
// Gravure
// ─────────────────────────────────────────────────────────────────────────────

$('#btnShoot').addEventListener('click', () => {
  const fix = currentFix();
  const aim = currentAim();

  if (!fix) return shootMsg('Pas de position : impossible de graver.', true);
  if (!aim) return shootMsg('Pas de cap absolu : la plaque serait inorientable.', true);

  const source = state.sim ? $('#scene') : $('#video');
  const sw = source.videoWidth || source.width;
  const sh = source.videoHeight || source.height;
  if (!sw || !sh) return shootMsg('Image non disponible.', true);

  // On recadre au format du viseur (3:4) : c'est ce cadre-là qu'on regrave.
  const targetAspect = 3 / 4;
  const cropW = Math.min(sw, sh * targetAspect);
  const cropH = cropW / targetAspect;
  const canvas = document.createElement('canvas');
  canvas.width = 480;
  canvas.height = Math.round(480 / targetAspect);
  canvas
    .getContext('2d')
    .drawImage(source, (sw - cropW) / 2, (sh - cropH) / 2, cropW, cropH, 0, 0, canvas.width, canvas.height);

  const frame = G.createGeoFrame({
    fix,
    aim,
    hFovDeg: state.prefs.fovDeg,
    aspect: targetAspect,
    title: $('#title').value.trim(),
    photo: canvas.toDataURL('image/jpeg', 0.6),
  });

  state.frames.unshift(frame);
  if (!save(STORE_KEY, state.frames)) {
    state.frames.shift();
    return shootMsg('Stockage local plein — supprime une plaque.', true);
  }

  $('#title').value = '';
  state.selected = 0;
  renderList();
  shootMsg(`Gravée à ${fix.lat.toFixed(5)}, ${fix.lon.toFixed(5)} — cap ${Math.round(aim.yaw)}°`);
});

function shootMsg(msg, isError = false) {
  const el = $('#shootMsg');
  el.textContent = msg;
  el.style.color = isError ? 'var(--warn)' : 'var(--muted)';
}

// ─────────────────────────────────────────────────────────────────────────────
// Carnet
// ─────────────────────────────────────────────────────────────────────────────

function renderList() {
  $('#count').textContent = String(state.frames.length);
  const ul = $('#list');
  ul.innerHTML = '';

  if (!state.frames.length) {
    ul.innerHTML = '<li class="empty">Aucune plaque. Grave-en une pour tester le viseur.</li>';
    return;
  }

  const fix = currentFix();
  for (const f of state.frames) {
    const li = document.createElement('li');
    const d = fix ? formatDistance(G.distance(fix, f)) : '—';
    li.innerHTML = `
      <img alt="" src="${f.photo ?? ''}">
      <div class="meta">
        <b>${escapeHtml(f.title || 'Sans titre')}</b>
        <span>${d} · cap ${Math.round(f.yaw)}° · ±${Math.round(f.accuracy ?? 0)} m</span>
      </div>
      <button data-del="${f.id}" type="button">suppr</button>`;
    ul.append(li);
  }

  ul.querySelectorAll('[data-del]').forEach((b) =>
    b.addEventListener('click', () => {
      state.frames = state.frames.filter((f) => f.id !== b.dataset.del);
      state.images.delete(b.dataset.del);
      state.selected = 0;
      save(STORE_KEY, state.frames);
      renderList();
      renderViserLabel();
    }),
  );
}

const escapeHtml = (s) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// ─────────────────────────────────────────────────────────────────────────────
// Viseur
// ─────────────────────────────────────────────────────────────────────────────

/** Plaques triées par proximité : la plus proche d'abord. */
function orderedFrames() {
  const fix = currentFix();
  if (!fix) return state.frames;
  return [...state.frames].sort((a, b) => G.distance(fix, a) - G.distance(fix, b));
}

const selectedFrame = () => orderedFrames()[state.selected] ?? null;

$('#prev').addEventListener('click', () => step(-1));
$('#next').addEventListener('click', () => step(1));

function step(delta) {
  const n = state.frames.length;
  if (!n) return;
  state.selected = (state.selected + delta + n) % n;
  renderViserLabel();
}

function renderViserLabel() {
  const f = selectedFrame();
  $('#viserLabel').textContent = f
    ? `${f.title || 'Sans titre'} — ${state.selected + 1}/${state.frames.length}`
    : 'Aucune plaque';
}

/** Charge (et met en cache) l'image d'une plaque. */
function imageFor(frame) {
  if (!frame?.photo) return null;
  if (state.images.has(frame.id)) return state.images.get(frame.id);
  const img = new Image();
  img.src = frame.photo;
  state.images.set(frame.id, img);
  return img;
}

// ─────────────────────────────────────────────────────────────────────────────
// Boucle de rendu
// ─────────────────────────────────────────────────────────────────────────────

function frameLoop() {
  requestAnimationFrame(frameLoop);
  if (state.tab === 'pose') return renderTelemetry();

  const overlay = $('#overlay');
  const { width, height } = fitCanvas(overlay);
  const view = G.makeView(width, height, state.prefs.fovDeg);
  const basis = currentBasis();
  const ctx = overlay.getContext('2d');
  ctx.clearRect(0, 0, width, height);

  if (state.sim) {
    const scene = $('#scene');
    fitCanvas(scene);
    drawScene(scene.getContext('2d'), {
      basis,
      view: G.makeView(scene.width, scene.height, state.prefs.fovDeg),
      eye: simulator.eyePosition(),
      landmarks: simulator.landmarks,
      dark: matchMedia('(prefers-color-scheme: dark)').matches,
    });
  }

  renderTelemetry();
  if (state.tab === 'graver') return drawCaptureGuides(ctx, view, basis);
  drawViewfinder(ctx, view, basis);
}

/**
 * Onglet Graver : la caméra est en noir et blanc (CSS), et les plaques déjà
 * gravées ici réapparaissent en couleur, verrouillées sur le monde.
 */
function drawCaptureGuides(ctx, view, basis) {
  const aim = currentAim();
  const fix = currentFix();
  drawNearbyPlates(ctx, view, basis, fix, aim);

  ctx.save();
  ctx.strokeStyle = 'rgba(255,255,255,.35)';
  ctx.lineWidth = 1;
  ctx.setLineDash([6, 6]);
  ctx.strokeRect(view.width * 0.1, view.height * 0.1, view.width * 0.8, view.height * 0.8);
  ctx.restore();

  drawRadar(ctx, { view, aim, solution: { distance: null, phase: 'framing' } });
  note(
    aim && fix
      ? `pose : ${fix.lat.toFixed(5)}, ${fix.lon.toFixed(5)} · cap ${Math.round(aim.yaw)}° · élév ${Math.round(aim.pitch)}°`
      : 'Pose incomplète — la gravure sera refusée.',
  );
}

/**
 * Plaques dont on est « sur place » (positionScore > 0, soit dans le rayon
 * d'arrivée). Au-delà, la projection — qui ne dépend que de la direction —
 * placerait la photo au mauvais endroit : on ne l'affiche pas.
 * Les plus lointaines d'abord, pour que la plus proche soit peinte au-dessus.
 */
function drawNearbyPlates(ctx, view, basis, fix, aim) {
  if (!fix) return;
  const nearby = state.frames
    .map((frame) => ({ frame, solution: G.solve(frame, fix, aim) }))
    .filter(({ solution }) => solution.positionScore > 0)
    .sort((a, b) => b.solution.distance - a.solution.distance);

  for (const { frame, solution } of nearby) {
    drawGhost(ctx, {
      frame,
      image: imageFor(frame),
      basis,
      view,
      solution,
      alpha: 0.35 + 0.65 * solution.positionScore,
      outline: false,
    });
  }
}

/** Onglet Viser : superposition du cadre d'origine. */
function drawViewfinder(ctx, view, basis) {
  const frame = selectedFrame();
  const fix = currentFix();
  const aim = currentAim();

  if (!frame) {
    note('Aucune plaque gravée.');
    return;
  }

  const solution = G.solve(frame, fix, aim);
  const ghost = drawGhost(ctx, { frame, image: imageFor(frame), basis, view, solution });

  if (ghost && !ghost.drawable) {
    drawEdgeArrow(ctx, {
      center: ghost.center,
      view,
      label: formatDistance(solution.distance),
      color: solution.phase === 'locked' ? '#3fa96b' : '#fff',
    });
  }

  drawReticle(ctx, { view, solution });
  drawRadar(ctx, { view, aim, solution });
  drawHud(ctx, { view, solution, aim, frame });
  note('');
  renderSolution(solution);
}

// ─────────────────────────────────────────────────────────────────────────────
// Panneaux de lecture
// ─────────────────────────────────────────────────────────────────────────────

const setField = (root, key, value) => {
  const el = $(`${root} [data-k="${key}"]`);
  if (el) el.textContent = value;
};

function renderTelemetry() {
  const p = position.get();
  const fix = p.filtered;
  setField('#posOut', 'lat', fix ? fix.lat.toFixed(6) : '—');
  setField('#posOut', 'lon', fix ? fix.lon.toFixed(6) : '—');
  setField('#posOut', 'acc', fix ? `±${fix.accuracy.toFixed(1)} m` : '—');
  setField('#posOut', 'alt', fix && Number.isFinite(fix.alt) ? `${fix.alt.toFixed(0)} m` : '—');
  setField('#posOut', 'rej', String(p.rejected));
  setField(
    '#posOut',
    'smooth',
    p.raw && fix ? `${G.distance(p.raw, fix).toFixed(1)} m` : '—',
  );
  if (p.error) setField('#posOut', 'lat', p.error.message);

  const o = orientation.get();
  const aim = o.orientation ? G.cameraAim(o.orientation) : null;
  setField('#aimOut', 'yaw', aim ? `${aim.yaw.toFixed(1)}° ${G.cardinal(aim.yaw)}` : '—');
  setField('#aimOut', 'pitch', aim ? `${aim.pitch.toFixed(1)}°` : '—');
  setField('#aimOut', 'roll', aim ? `${aim.roll.toFixed(1)}°` : '—');
  setField('#aimOut', 'src', o.source);
  setField(
    '#aimOut',
    'euler',
    o.orientation
      ? `${o.orientation.alpha.toFixed(0)} / ${o.orientation.beta.toFixed(0)} / ${o.orientation.gamma.toFixed(0)}`
      : '—',
  );
  setField('#aimOut', 'screen', `${o.screenAngle}°`);

  $('#warnAbs').classList.toggle('hidden', o.source !== 'relative');
}

function renderSolution(s) {
  setField('#solveOut', 'phase', s.phase);
  setField('#solveOut', 'dist', formatDistance(s.distance));
  setField('#solveOut', 'brg', s.bearing == null ? '—' : `${Math.round(s.bearing)}° ${G.cardinal(s.bearing)}`);
  setField('#solveOut', 'dyaw', s.yawError == null ? '—' : `${s.yawError.toFixed(1)}°`);
  setField('#solveOut', 'dpitch', s.pitchError == null ? '—' : `${s.pitchError.toFixed(1)}°`);
  setField('#solveOut', 'score', `${Math.round(s.score * 100)} %`);
}

// ─────────────────────────────────────────────────────────────────────────────
// Démarrage
// ─────────────────────────────────────────────────────────────────────────────

$('#fov').value = String(state.prefs.fovDeg);
$('#fovVal').textContent = `${state.prefs.fovDeg}°`;
$('#decl').value = String(state.prefs.declinationDeg);
$('#declVal').textContent = `${state.prefs.declinationDeg}°`;
orientation.setOffset(state.prefs.declinationDeg);

// Sans capteur de mouvement exposé (cas du desktop), la simulation est le seul
// mode utile : autant la proposer d'emblée plutôt que d'afficher des tirets.
if (!needsMotionPermission() && !('ondeviceorientationabsolute' in window)) {
  $('#btnSim').classList.add('primary');
  $('#btnSim').classList.remove('ghost');
}

position.subscribe(() => {
  if (state.tab === 'graver') renderList();
});

setTab('pose');
renderList();
frameLoop();

// Exposé pour l'inspection manuelle depuis la console du navigateur.
window.picti = { state, position, orientation, simulator, G };
