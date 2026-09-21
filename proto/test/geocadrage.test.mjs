import test from 'node:test';
import assert from 'node:assert/strict';
import * as G from '../src/geocadrage.js';

/** Assertion approchée, avec message lisible. */
const near = (actual, expected, tol, msg = '') =>
  assert.ok(
    Math.abs(actual - expected) <= tol,
    `${msg} attendu ${expected} ±${tol}, obtenu ${actual}`,
  );

const nearAngle = (actual, expected, tol, msg = '') =>
  near(G.angleDelta(expected, actual), 0, tol, msg);

// ─── Scalaires ───────────────────────────────────────────────────────────────

test('normalizeDeg ramène dans [0, 360)', () => {
  assert.equal(G.normalizeDeg(0), 0);
  assert.equal(G.normalizeDeg(360), 0);
  assert.equal(G.normalizeDeg(-90), 270);
  assert.equal(G.normalizeDeg(450), 90);
});

test('angleDelta prend le chemin le plus court et passe le 0/360', () => {
  assert.equal(G.angleDelta(350, 10), 20);
  assert.equal(G.angleDelta(10, 350), -20);
  assert.equal(G.angleDelta(0, 180), 180);
  assert.equal(G.angleDelta(0, 190), -170);
});

test('cardinal nomme les huit secteurs en français', () => {
  assert.equal(G.cardinal(0), 'N');
  assert.equal(G.cardinal(90), 'E');
  assert.equal(G.cardinal(225), 'SO');
  assert.equal(G.cardinal(359), 'N');
});

// ─── Géodésie ────────────────────────────────────────────────────────────────

test('distance : un degré de latitude vaut ~111,2 km', () => {
  near(G.distance({ lat: 0, lon: 0 }, { lat: 1, lon: 0 }), 111195, 50);
});

test('distance : Paris → Lyon ≈ 392 km', () => {
  const paris = { lat: 48.8566, lon: 2.3522 };
  const lyon = { lat: 45.7640, lon: 4.8357 };
  near(G.distance(paris, lyon), 392000, 3000);
});

test('distance : symétrique et nulle sur place', () => {
  const a = { lat: 48.8566, lon: 2.3522 };
  const b = { lat: 48.8570, lon: 2.3530 };
  assert.equal(G.distance(a, a), 0);
  near(G.distance(a, b), G.distance(b, a), 1e-9);
});

test('bearing : nord, est, sud, ouest', () => {
  const o = { lat: 48.8566, lon: 2.3522 };
  nearAngle(G.bearing(o, { lat: 48.9566, lon: 2.3522 }), 0, 0.01, 'nord');
  nearAngle(G.bearing(o, { lat: 48.8566, lon: 2.4522 }), 90, 0.05, 'est');
  nearAngle(G.bearing(o, { lat: 48.7566, lon: 2.3522 }), 180, 0.01, 'sud');
  nearAngle(G.bearing(o, { lat: 48.8566, lon: 2.2522 }), 270, 0.05, 'ouest');
});

test('destination ∘ bearing/distance : aller-retour exact', () => {
  const origin = { lat: 48.8566, lon: 2.3522 };
  for (const brg of [0, 37, 90, 154, 180, 271, 359]) {
    for (const dist of [5, 120, 4500]) {
      const target = G.destination(origin, brg, dist);
      near(G.distance(origin, target), dist, 0.01, `dist ${brg}°/${dist}m`);
      nearAngle(G.bearing(origin, target), brg, 0.01, `cap ${brg}°/${dist}m`);
    }
  }
});

test('enuOffset : décompose en est/nord cohérents avec destination', () => {
  const origin = { lat: 48.8566, lon: 2.3522 };
  const nord = G.destination(origin, 0, 100);
  const est = G.destination(origin, 90, 100);
  near(G.enuOffset(origin, nord).north, 100, 0.05);
  near(G.enuOffset(origin, nord).east, 0, 0.05);
  near(G.enuOffset(origin, est).east, 100, 0.05);
  near(G.enuOffset(origin, est).north, 0, 0.05);
});

test('enuOffset : altitude reportée seulement si connue des deux côtés', () => {
  const a = { lat: 48.8566, lon: 2.3522, alt: 35 };
  const b = { lat: 48.8566, lon: 2.3522, alt: 47 };
  assert.equal(G.enuOffset(a, b).up, 12);
  assert.equal(G.enuOffset(a, { lat: b.lat, lon: b.lon }).up, 0);
});

// ─── Orientation appareil ────────────────────────────────────────────────────

test('téléphone à plat, écran vers le ciel : objectif au nadir', () => {
  const aim = G.cameraAim({ alpha: 0, beta: 0, gamma: 0 });
  near(aim.pitch, -90, 0.01, 'pitch');
});

test('téléphone vertical, alpha=0 : objectif plein nord', () => {
  const aim = G.cameraAim({ alpha: 0, beta: 90, gamma: 0 });
  nearAngle(aim.yaw, 0, 0.01, 'yaw');
  near(aim.pitch, 0, 0.01, 'pitch');
  near(aim.roll, 0, 0.01, 'roll');
});

test('alpha suit la convention W3C : cap = 360 − alpha', () => {
  // alpha croît dans le sens antihoraire vu du dessus.
  for (const [alpha, cap] of [[270, 90], [180, 180], [90, 270]]) {
    nearAngle(G.cameraAim({ alpha, beta: 90, gamma: 0 }).yaw, cap, 0.01, `alpha ${alpha}`);
  }
});

test('beta module l’élévation de l’objectif', () => {
  near(G.cameraAim({ alpha: 0, beta: 120, gamma: 0 }).pitch, 30, 0.01, 'visée vers le haut');
  near(G.cameraAim({ alpha: 0, beta: 60, gamma: 0 }).pitch, -30, 0.01, 'visée vers le bas');
});

test('la base caméra est orthonormée et directe', () => {
  const samples = [
    { alpha: 0, beta: 90, gamma: 0 },
    { alpha: 37, beta: 65, gamma: -22 },
    { alpha: 200, beta: 110, gamma: 44, screenAngle: 90 },
    { alpha: 315, beta: 12, gamma: 80, screenAngle: 270 },
  ];
  for (const o of samples) {
    const b = G.cameraBasis(o);
    for (const v of [b.right, b.up, b.forward]) near(G.len(v), 1, 1e-9, 'norme');
    near(G.dot(b.right, b.up), 0, 1e-9, 'right⊥up');
    near(G.dot(b.right, b.forward), 0, 1e-9, 'right⊥forward');
    near(G.dot(b.up, b.forward), 0, 1e-9, 'up⊥forward');
    // right × up = -forward : l'objectif regarde dans le dos de l'écran.
    const c = G.cross(b.right, b.up);
    near(G.len(G.add(c, b.forward)), 0, 1e-9, 'trièdre');
  }
});

test('la rotation d’écran laisse l’axe optique inchangé', () => {
  const o = { alpha: 42, beta: 78, gamma: 15 };
  const portrait = G.cameraBasis({ ...o, screenAngle: 0 });
  for (const screenAngle of [90, 180, 270]) {
    const rotated = G.cameraBasis({ ...o, screenAngle });
    near(G.len(G.sub(portrait.forward, rotated.forward)), 0, 1e-9, `écran ${screenAngle}°`);
    // ...mais fait bien pivoter les axes de l'image.
    near(G.angleBetween(portrait.right, rotated.right), screenAngle > 180 ? 360 - screenAngle : screenAngle, 1e-6);
  }
});

test('aimFromBasis ∘ basisFromAim : aller-retour sur des visées quelconques', () => {
  const cases = [
    [0, 0, 0], [90, 0, 0], [273, 12, 0], [45, -35, 20], [180, 60, -75], [359, -80, 170],
  ];
  for (const [yaw, pitch, roll] of cases) {
    const back = G.aimFromBasis(G.basisFromAim(yaw, pitch, roll));
    nearAngle(back.yaw, yaw, 1e-6, `yaw ${yaw}/${pitch}/${roll}`);
    near(back.pitch, pitch, 1e-6, `pitch ${yaw}/${pitch}/${roll}`);
    nearAngle(back.roll, roll, 1e-6, `roll ${yaw}/${pitch}/${roll}`);
  }
});

// ─── Projection ──────────────────────────────────────────────────────────────

test('une cible dans l’axe se projette au centre du viseur', () => {
  const view = G.makeView(400, 800, 65);
  const basis = G.basisFromAim(120, 5, 0);
  const p = G.projectDirection(basis.forward, basis, view);
  assert.ok(p.inFront);
  near(p.x, 200, 1e-6);
  near(p.y, 400, 1e-6);
});

test('une cible au bord du champ tombe sur le bord de l’image', () => {
  const hFov = 65;
  const view = G.makeView(400, 800, hFov);
  const basis = G.basisFromAim(0, 0, 0);
  // Pile à la moitié du champ horizontal, vers la droite.
  const edge = G.basisFromAim(hFov / 2, 0, 0).forward;
  const p = G.projectDirection(edge, basis, view);
  near(p.u, 1, 1e-6, 'u');
  near(p.x, view.width, 1e-6, 'x');
});

test('une cible derrière la caméra est signalée', () => {
  const view = G.makeView(400, 800, 65);
  const basis = G.basisFromAim(0, 0, 0);
  const p = G.projectDirection(G.basisFromAim(180, 0, 0).forward, basis, view);
  assert.equal(p.inFront, false);
});

test('roll : un horizon incliné bascule bien la projection', () => {
  const view = G.makeView(400, 400, 90);
  const droite = G.basisFromAim(90, 0, 0).forward; // cible plein est
  const droit = G.projectDirection(droite, G.basisFromAim(0, 0, 0), view);
  const penche = G.projectDirection(droite, G.basisFromAim(0, 0, 90), view);
  // Sans roll la cible part sur le côté ; avec 90° de roll elle part en vertical.
  assert.ok(Math.abs(droit.u) > 0.9 && Math.abs(droit.v) < 1e-6);
  assert.ok(Math.abs(penche.v) > 0.9 && Math.abs(penche.u) < 1e-6);
});

test('projectFrame : replacé dans sa pose d’origine, le cadre remplit l’image', () => {
  const frame = { yaw: 47, pitch: -8, roll: 0, hFovDeg: 66, aspect: 3 / 4 };
  const view = G.makeView(300, 400, 66); // même champ, même aspect
  const basis = G.basisFromAim(frame.yaw, frame.pitch, frame.roll);
  const { center, corners } = G.projectFrame(frame, basis, view);
  near(center.x, 150, 1e-6, 'centre x');
  near(center.y, 200, 1e-6, 'centre y');
  for (const c of corners) {
    assert.ok(c.inFront);
    near(Math.abs(c.u), 1, 1e-6, 'coin u');
    near(Math.abs(c.v), 1, 1e-6, 'coin v');
  }
});

// ─── Résolution ──────────────────────────────────────────────────────────────

const FRAME = {
  lat: 48.8566, lon: 2.3522, alt: null,
  yaw: 90, pitch: 0, roll: 0, hFovDeg: 66, aspect: 3 / 4,
};

test('solve : sans position, phase « locating »', () => {
  const r = G.solve(FRAME, null, { yaw: 90, pitch: 0, roll: 0 });
  assert.equal(r.phase, 'locating');
  assert.equal(r.score, 0);
});

test('solve : au loin, phase « approach » et cap annoncé', () => {
  const fix = { ...G.destination(FRAME, 180, 300), accuracy: 5 };
  const r = G.solve(FRAME, fix, { yaw: 0, pitch: 0, roll: 0 });
  assert.equal(r.phase, 'approach');
  near(r.distance, 300, 1);
  nearAngle(r.bearing, 0, 0.1, 'cap vers le cadre');
  assert.equal(r.positionScore, 0);
  assert.match(r.hint, /300 m/);
});

test('solve : sur place mais mal orienté, phase « framing »', () => {
  const fix = { ...FRAME, accuracy: 4 };
  const r = G.solve(FRAME, fix, { yaw: 200, pitch: 0, roll: 0 });
  assert.equal(r.phase, 'framing');
  assert.equal(r.positionScore, 1);
  nearAngle(r.yawError, -110, 1e-6);
  assert.match(r.hint, /tourne à gauche/i);
});

test('solve : sur place et bien orienté, phase « locked »', () => {
  const fix = { ...FRAME, accuracy: 4 };
  const r = G.solve(FRAME, fix, { yaw: 92, pitch: 1, roll: 0 });
  assert.equal(r.phase, 'locked');
  assert.ok(r.score > 0.9, `score ${r.score}`);
  assert.match(r.hint, /Cadre retrouvé/);
});

test('solve : le rayon d’arrivée s’élargit quand le GPS est mauvais', () => {
  const fix = { ...G.destination(FRAME, 0, 20), accuracy: 40 };
  const r = G.solve(FRAME, fix, { yaw: 90, pitch: 0, roll: 0 });
  assert.equal(r.phase, 'locked', 'à 20 m avec ±40 m, on ne peut pas prétendre être loin');
  near(r.radius, 60, 1e-9);
});

test('solve : sans boussole, on guide quand même à la distance', () => {
  const fix = { ...G.destination(FRAME, 270, 80), accuracy: 10 };
  const r = G.solve(FRAME, fix, null);
  assert.equal(r.phase, 'approach');
  assert.equal(r.yawError, null);
  assert.match(r.hint, /cap 90° \(E\)/);
});

test('solve : le score décroît continûment avec l’éloignement', () => {
  const aim = { yaw: 90, pitch: 0, roll: 0 };
  let prev = Infinity;
  for (const d of [0, 2, 4, 6, 8, 12]) {
    const r = G.solve(FRAME, { ...G.destination(FRAME, 30, d), accuracy: 1 }, aim);
    assert.ok(r.score <= prev, `score non monotone à ${d} m`);
    prev = r.score;
  }
  assert.equal(prev, 0);
});

// ─── GeoFrame ────────────────────────────────────────────────────────────────

test('createGeoFrame : capture la pose complète et survit à un aller-retour JSON', () => {
  const frame = G.createGeoFrame({
    fix: { lat: 48.8566, lon: 2.3522, alt: 35, accuracy: 6 },
    aim: { yaw: 123.4, pitch: -5.6, roll: 2.1, source: 'ios-compass' },
    hFovDeg: 66,
    aspect: 3 / 4,
    title: 'Le banc',
  });
  assert.ok(frame.id.startsWith('gf_'));
  assert.equal(frame.headingSource, 'ios-compass');
  const revived = JSON.parse(JSON.stringify(frame));
  const r = G.solve(revived, { lat: 48.8566, lon: 2.3522, accuracy: 6 }, revived);
  assert.equal(r.phase, 'locked');
});
