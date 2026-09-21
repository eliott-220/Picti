/**
 * renderer.js — dessin du viseur AR.
 *
 * Ne calcule rien : reçoit une solution de geocadrage.solve() et une projection,
 * et les peint. Toute la géométrie vient d'ailleurs.
 */

import { cardinal, clamp, normalizeDeg, projectDirection, projectFrame } from './geocadrage.js';

// ─────────────────────────────────────────────────────────────────────────────
// Plaquage de texture sur un quadrilatère quelconque
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Canvas 2D ne sait pas plaquer une image sur un quad non affine. On découpe en
 * deux triangles, chacun recevant la transformation affine qui envoie ses trois
 * sommets source sur ses trois sommets destination. La perspective est donc
 * approchée par morceaux — invisible aux angles de vue courants, et c'est le
 * prix à payer pour rester sans WebGL.
 */
function drawTriangle(ctx, img, s, d) {
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(d[0].x, d[0].y);
  ctx.lineTo(d[1].x, d[1].y);
  ctx.lineTo(d[2].x, d[2].y);
  ctx.closePath();
  ctx.clip();

  const sx1 = s[1].x - s[0].x, sy1 = s[1].y - s[0].y;
  const sx2 = s[2].x - s[0].x, sy2 = s[2].y - s[0].y;
  const det = sx1 * sy2 - sx2 * sy1;
  if (Math.abs(det) < 1e-9) return ctx.restore();

  const dx1 = d[1].x - d[0].x, dy1 = d[1].y - d[0].y;
  const dx2 = d[2].x - d[0].x, dy2 = d[2].y - d[0].y;
  const a = (dx1 * sy2 - dx2 * sy1) / det;
  const b = (dy1 * sy2 - dy2 * sy1) / det;
  const c = (dx2 * sx1 - dx1 * sx2) / det;
  const dd = (dy2 * sx1 - dy1 * sx2) / det;

  ctx.transform(a, b, c, dd, d[0].x - a * s[0].x - c * s[0].y, d[0].y - b * s[0].x - dd * s[0].y);
  ctx.drawImage(img, 0, 0);
  ctx.restore();
}

/** Écarte légèrement un triangle de son centre, pour masquer la couture. */
function expand(tri, px = 0.6) {
  const cx = (tri[0].x + tri[1].x + tri[2].x) / 3;
  const cy = (tri[0].y + tri[1].y + tri[2].y) / 3;
  return tri.map((p) => {
    const d = Math.hypot(p.x - cx, p.y - cy) || 1;
    return { x: p.x + ((p.x - cx) / d) * px, y: p.y + ((p.y - cy) / d) * px };
  });
}

/** Plaque une image sur un quad donné dans l'ordre HG, HD, BD, BG. */
export function drawImageQuad(ctx, img, quad) {
  const w = img.naturalWidth || img.width;
  const h = img.naturalHeight || img.height;
  const src = [{ x: 0, y: 0 }, { x: w, y: 0 }, { x: w, y: h }, { x: 0, y: h }];
  drawTriangle(ctx, img, [src[0], src[1], src[2]], expand([quad[0], quad[1], quad[2]]));
  drawTriangle(ctx, img, [src[0], src[2], src[3]], expand([quad[0], quad[2], quad[3]]));
}

// ─────────────────────────────────────────────────────────────────────────────
// Couches du viseur
// ─────────────────────────────────────────────────────────────────────────────

const PHASE_COLOR = {
  locating: '#8a8a8a',
  approach: '#d98c3f',
  framing: '#3f8fd9',
  locked: '#3fa96b',
};

/**
 * Superpose la photo dans son cadre d'origine.
 * Le quad est écarté du bord de l'écran quand on regarde ailleurs : c'est le
 * comportement correct d'une fenêtre fixée dans le monde.
 */
export function drawGhost(ctx, { frame, image, basis, view, solution, alpha, outline = true }) {
  if (!image || !frame) return null;
  const { center, corners } = projectFrame(frame, basis, view);

  // Trop hors-champ ou derrière : la projection diverge, on n'essaie pas.
  const drawable =
    corners.every((c) => c.inFront && Math.abs(c.u) < 14 && Math.abs(c.v) < 14) && center.inFront;

  const quad = corners.map((c) => ({ x: c.x, y: c.y }));
  const strength = clamp(solution.score, 0, 1);

  if (drawable) {
    ctx.save();
    // Par défaut, la photo apparaît d'autant plus qu'on est proche ET aligné.
    ctx.globalAlpha = alpha ?? 0.18 + 0.72 * strength;
    drawImageQuad(ctx, image, quad);
    ctx.restore();
  }

  if (drawable && outline) {
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(quad[0].x, quad[0].y);
    for (const p of quad.slice(1)) ctx.lineTo(p.x, p.y);
    ctx.closePath();
    ctx.strokeStyle = PHASE_COLOR[solution.phase] ?? '#fff';
    ctx.lineWidth = solution.phase === 'locked' ? 3 : 1.5;
    ctx.setLineDash(solution.phase === 'locked' ? [] : [8, 6]);
    ctx.stroke();
    ctx.restore();
  }

  return { center, drawable };
}

/** Flèche collée au bord quand le cadre est hors du champ. */
export function drawEdgeArrow(ctx, { center, view, label, color = '#fff' }) {
  const cx = view.width / 2;
  const cy = view.height / 2;
  // Derrière la caméra, la projection est inversée : on retourne le vecteur.
  const sign = center.inFront ? 1 : -1;
  let dx = (center.x - cx) * sign;
  let dy = (center.y - cy) * sign;
  const l = Math.hypot(dx, dy) || 1;
  dx /= l;
  dy /= l;

  const margin = 58;
  const t = Math.min(
    Math.abs((view.width / 2 - margin) / (dx || 1e-6)),
    Math.abs((view.height / 2 - margin) / (dy || 1e-6)),
  );
  const x = cx + dx * t;
  const y = cy + dy * t;

  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(Math.atan2(dy, dx));
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(18, 0);
  ctx.lineTo(-12, 11);
  ctx.lineTo(-6, 0);
  ctx.lineTo(-12, -11);
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  if (label) {
    ctx.save();
    ctx.fillStyle = color;
    ctx.font = '600 12px ui-monospace, monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, x - dx * 26, y - dy * 26);
    ctx.restore();
  }
}

/** Mire centrale, qui se resserre à mesure que l'alignement se fait. */
export function drawReticle(ctx, { view, solution }) {
  const cx = view.width / 2;
  const cy = view.height / 2;
  const s = clamp(solution.score, 0, 1);
  const size = 34 - 12 * s;
  const color = PHASE_COLOR[solution.phase] ?? '#fff';

  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.globalAlpha = 0.9;
  for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
    ctx.beginPath();
    ctx.moveTo(cx + sx * size, cy + sy * size - sy * 11);
    ctx.lineTo(cx + sx * size, cy + sy * size);
    ctx.lineTo(cx + sx * size - sx * 11, cy + sy * size);
    ctx.stroke();
  }
  ctx.restore();
}

/** Mini-radar : nord, cap courant, position du cadre. */
export function drawRadar(ctx, { view, aim, solution, x, y, r = 40 }) {
  const cx = x ?? view.width - r - 18;
  const cy = y ?? r + 18;

  ctx.save();
  ctx.translate(cx, cy);
  ctx.fillStyle = 'rgba(12,14,18,.62)';
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,.28)';
  ctx.lineWidth = 1;
  ctx.stroke();

  // Cône de visée.
  if (aim) {
    ctx.fillStyle = 'rgba(255,255,255,.12)';
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.arc(0, 0, r, -Math.PI / 2 - 0.5, -Math.PI / 2 + 0.5);
    ctx.closePath();
    ctx.fill();
  }

  // Rose des vents, tournée pour que l'avant de l'écran soit en haut.
  const heading = aim ? aim.yaw : 0;
  ctx.font = '600 9px ui-monospace, monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (const az of [0, 90, 180, 270]) {
    const a = ((normalizeDeg(az - heading) - 90) * Math.PI) / 180;
    ctx.fillStyle = az === 0 ? '#e0574f' : 'rgba(255,255,255,.55)';
    ctx.fillText(cardinal(az), Math.cos(a) * (r - 9), Math.sin(a) * (r - 9));
  }

  // Le cadre visé.
  if (solution.distance != null) {
    const a = ((normalizeDeg(solution.bearing - heading) - 90) * Math.PI) / 180;
    // Échelle logarithmique : lisible de 2 m à 2 km.
    const k = clamp(Math.log10(Math.max(solution.distance, 1)) / 3, 0.08, 0.86);
    ctx.fillStyle = PHASE_COLOR[solution.phase] ?? '#fff';
    ctx.beginPath();
    ctx.arc(Math.cos(a) * k * r, Math.sin(a) * k * r, 4, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

/** Bandeau d'information en bas du viseur. */
export function drawHud(ctx, { view, solution, aim, frame }) {
  const pad = 14;
  const h = 76;
  const y = view.height - h - pad;

  ctx.save();
  ctx.fillStyle = 'rgba(12,14,18,.68)';
  roundRect(ctx, pad, y, view.width - pad * 2, h, 12);
  ctx.fill();

  ctx.fillStyle = PHASE_COLOR[solution.phase] ?? '#fff';
  ctx.beginPath();
  ctx.arc(pad + 18, y + 24, 5, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#fff';
  ctx.font = '600 14px ui-monospace, monospace';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(truncate(ctx, solution.hint, view.width - pad * 2 - 46), pad + 32, y + 24);

  ctx.fillStyle = 'rgba(255,255,255,.62)';
  ctx.font = '11px ui-monospace, monospace';
  const bits = [];
  if (solution.distance != null) bits.push(`${formatDistance(solution.distance)}`);
  if (solution.accuracy != null) bits.push(`±${Math.round(solution.accuracy)} m`);
  if (aim) bits.push(`cap ${Math.round(aim.yaw)}°`);
  if (frame?.title) bits.push(frame.title);
  ctx.fillText(bits.join('   ·   '), pad + 32, y + 48);

  // Jauge d'alignement.
  const gw = view.width - pad * 2 - 46;
  ctx.fillStyle = 'rgba(255,255,255,.16)';
  roundRect(ctx, pad + 32, y + 60, gw, 4, 2);
  ctx.fill();
  ctx.fillStyle = PHASE_COLOR[solution.phase] ?? '#fff';
  roundRect(ctx, pad + 32, y + 60, Math.max(gw * clamp(solution.score, 0, 1), 2), 4, 2);
  ctx.fill();
  ctx.restore();
}

export function formatDistance(m) {
  if (m == null) return '—';
  if (m < 10) return `${m.toFixed(1)} m`;
  if (m < 1000) return `${Math.round(m)} m`;
  return `${(m / 1000).toFixed(2)} km`;
}

function truncate(ctx, text, maxWidth) {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let t = text;
  while (t.length > 1 && ctx.measureText(`${t}…`).width > maxWidth) t = t.slice(0, -1);
  return `${t}…`;
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Redimensionne un canvas à la taille CSS de son conteneur, en tenant compte du DPR. */
export function fitCanvas(canvas) {
  const rect = canvas.getBoundingClientRect();
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = Math.round(rect.width * dpr);
  const h = Math.round(rect.height * dpr);
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
  }
  return { width: canvas.width, height: canvas.height, dpr };
}
