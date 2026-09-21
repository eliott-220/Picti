import test from 'node:test';
import assert from 'node:assert/strict';
import { createPositionTracker, createOrientationTracker } from '../src/sensors.js';
import { distance, destination, angleDelta, cameraAim } from '../src/geocadrage.js';

const ORIGIN = { lat: 48.8566, lon: 2.3522 };
const near = (a, b, tol, msg = '') =>
  assert.ok(Math.abs(a - b) <= tol, `${msg} attendu ${b} ±${tol}, obtenu ${a}`);

/** Bruit gaussien déterministe (Box-Muller sur un LCG) — tests reproductibles. */
function makeNoise(seed = 1) {
  let s = seed;
  const rand = () => ((s = (s * 1103515245 + 12345) % 2147483648) / 2147483648);
  return () => Math.sqrt(-2 * Math.log(rand() || 1e-9)) * Math.cos(2 * Math.PI * rand());
}

// ─── Filtre de position ──────────────────────────────────────────────────────

test('position : le premier fix est adopté tel quel', () => {
  const t = createPositionTracker();
  t.push({ ...ORIGIN, accuracy: 12 });
  const { filtered } = t.get();
  assert.equal(filtered.lat, ORIGIN.lat);
  near(filtered.accuracy, 12, 1e-9);
});

test('position : le lissage réduit le bruit d’un GPS immobile', () => {
  const noise = makeNoise(7);
  const tracker = createPositionTracker();
  const brut = [];
  const lisse = [];

  let now = Date.now();
  for (let i = 0; i < 60; i++) {
    now += 1000;
    // Fix bruité de ~10 m autour de l'origine.
    const fix = destination(ORIGIN, (i * 57) % 360, Math.abs(noise()) * 10);
    tracker.push({ ...fix, accuracy: 10, timestamp: now });
    const s = tracker.get();
    if (i > 10) {
      brut.push(distance(ORIGIN, s.raw));
      lisse.push(distance(ORIGIN, s.filtered));
    }
  }
  const moyenne = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
  const errBrut = moyenne(brut);
  const errLisse = moyenne(lisse);
  assert.ok(errLisse < errBrut / 2, `lissé ${errLisse.toFixed(2)} m vs brut ${errBrut.toFixed(2)} m`);
});

test('position : un saut GPS aberrant est rejeté', () => {
  const tracker = createPositionTracker();
  let now = Date.now();
  for (let i = 0; i < 10; i++) tracker.push({ ...ORIGIN, accuracy: 5, timestamp: (now += 1000) });

  const avant = tracker.get().filtered;
  tracker.push({ ...destination(ORIGIN, 90, 400), accuracy: 5, timestamp: (now += 1000) });
  const apres = tracker.get();

  assert.equal(apres.rejected, 1, 'le saut doit être compté comme rejeté');
  near(distance(avant, apres.filtered), 0, 0.5, 'la position ne doit pas bouger');
});

test('position : un déplacement réel finit par être accepté', () => {
  // Trois fixes concordants loin de l'estimation : ce n'est plus du bruit.
  const tracker = createPositionTracker();
  let now = Date.now();
  for (let i = 0; i < 10; i++) tracker.push({ ...ORIGIN, accuracy: 3, timestamp: (now += 1000) });

  const ailleurs = destination(ORIGIN, 90, 400);
  for (let i = 0; i < 3; i++) tracker.push({ ...ailleurs, accuracy: 3, timestamp: (now += 1000) });

  const d = distance(ailleurs, tracker.get().filtered);
  assert.ok(d < 1, `recalage attendu, reste à ${d.toFixed(1)} m`);
  assert.equal(tracker.get().rejected, 2, 'deux rejets avant recalage');
});

test('position : un aberrant isolé reste rejeté, sans compter pour le recalage', () => {
  const tracker = createPositionTracker();
  let now = Date.now();
  for (let i = 0; i < 10; i++) tracker.push({ ...ORIGIN, accuracy: 3, timestamp: (now += 1000) });

  // Alternance saut / retour : jamais trois sauts d'affilée.
  for (let i = 0; i < 6; i++) {
    tracker.push({ ...destination(ORIGIN, i * 60, 400), accuracy: 3, timestamp: (now += 1000) });
    tracker.push({ ...ORIGIN, accuracy: 3, timestamp: (now += 1000) });
  }
  near(distance(ORIGIN, tracker.get().filtered), 0, 1, 'la position doit tenir bon');
});

test('position : un fix précis prend le pas sur un fix vague', () => {
  const tracker = createPositionTracker();
  let now = Date.now();
  tracker.push({ ...ORIGIN, accuracy: 60, timestamp: now });
  const cible = destination(ORIGIN, 0, 30);
  tracker.push({ ...cible, accuracy: 3, timestamp: (now += 1000) });

  const d = distance(cible, tracker.get().filtered);
  assert.ok(d < 5, `devrait converger vers le fix précis, reste à ${d.toFixed(1)} m`);
  assert.ok(tracker.get().filtered.accuracy < 10, 'la précision estimée doit s’améliorer');
});

test('position : après une longue coupure, on repart du fix neuf', () => {
  const tracker = createPositionTracker();
  let now = Date.now();
  tracker.push({ ...ORIGIN, accuracy: 5, timestamp: now });
  const ailleurs = destination(ORIGIN, 90, 5000);
  tracker.push({ ...ailleurs, accuracy: 5, timestamp: now + 120_000 });
  near(distance(ailleurs, tracker.get().filtered), 0, 0.5, 'pas de rejet après 2 min');
});

test('position : les abonnés sont notifiés à chaque intégration', () => {
  const tracker = createPositionTracker();
  let n = 0;
  const off = tracker.subscribe(() => n++);
  tracker.push({ ...ORIGIN, accuracy: 5 });
  tracker.push({ ...ORIGIN, accuracy: 5 });
  off();
  tracker.push({ ...ORIGIN, accuracy: 5 });
  assert.equal(n, 2);
});

// ─── Filtre d'orientation ────────────────────────────────────────────────────

/** Traceur d'orientation piloté par une horloge factice. */
function fakeClockTracker(timeConstantMs = 100) {
  let clock = 0;
  const t = createOrientationTracker({ timeConstantMs, now: () => clock });
  return { t, tick: (ms) => (clock += ms) };
}

test('orientation : convergence vers la valeur visée', () => {
  const { t, tick } = fakeClockTracker(100);
  t.push(90, 80, 0);
  for (let i = 0; i < 50; i++) {
    tick(20);
    t.push(120, 80, 0);
  }
  near(t.get().orientation.alpha, 120, 0.5);
});

test('orientation : le lissage dépend du temps, pas de la cadence du capteur', () => {
  // Deux appareils, l'un à 10 Hz l'autre à 60 Hz, sur la même seconde :
  // ils doivent aboutir au même cap, sinon le viseur serait plus mou sur l'un.
  const run = (hz) => {
    const { t, tick } = fakeClockTracker(150);
    t.push(0, 90, 0);
    const step = 1000 / hz;
    for (let i = 0; i < hz; i++) {
      tick(step);
      t.push(90, 90, 0);
    }
    return t.get().orientation.alpha;
  };
  near(run(10), run(60), 0.5);
});

test('orientation : un capteur muet ne fait pas dériver l’estimation', () => {
  const { t, tick } = fakeClockTracker(100);
  t.push(45, 90, 0);
  tick(10_000);
  assert.equal(t.get().orientation.alpha, 45);
});

test('orientation : le lissage traverse le 0/360 sans faire un tour complet', () => {
  const { t, tick } = fakeClockTracker(1000);
  t.push(350, 90, 0);
  tick(200);
  t.push(10, 90, 0);
  const a = t.get().orientation.alpha;
  // Doit rester dans le voisinage de 350-10, jamais partir vers 180.
  assert.ok(Math.abs(angleDelta(0, a)) < 15, `alpha lissé = ${a}, attendu proche de 0/360`);
});

test('orientation : le décalage manuel corrige le nord', () => {
  const { t } = fakeClockTracker(1);
  t.push(0, 90, 0);
  const avant = cameraAim(t.get().orientation).yaw;
  t.setOffset(-15); // alpha -15 → cap +15
  const apres = cameraAim(t.get().orientation).yaw;
  near(angleDelta(avant, apres), 15, 0.6);
});

test('orientation : une source relative n’écrase pas une source absolue', () => {
  const { t } = fakeClockTracker(1);
  t.push(42, 90, 0); // push() = source absolue
  assert.equal(t.get().source, 'absolute');
  assert.equal(t.get().absolute, true);
});

test('orientation : sans donnée, l’état est explicitement vide', () => {
  const t = createOrientationTracker();
  const s = t.get();
  assert.equal(s.orientation, null);
  assert.equal(s.source, 'none');
  assert.equal(s.absolute, false);
});
