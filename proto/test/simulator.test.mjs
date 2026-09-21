import test from 'node:test';
import assert from 'node:assert/strict';
import * as G from '../src/geocadrage.js';
import { aimToDeviceAngles, horizonLine, buildLandmarks, SIM_ORIGIN } from '../src/simulator.js';

const near = (a, b, tol, msg = '') =>
  assert.ok(Math.abs(a - b) <= tol, `${msg} attendu ${b} ±${tol}, obtenu ${a}`);
const nearAngle = (a, b, tol, msg = '') => near(G.angleDelta(b, a), 0, tol, msg);

test('aimToDeviceAngles : réciproque exacte de cameraAim sur tout le domaine', () => {
  let worst = 0;
  for (let yaw = 0; yaw < 360; yaw += 17) {
    for (let pitch = -85; pitch <= 85; pitch += 11) {
      for (let roll = -170; roll <= 170; roll += 23) {
        const [alpha, beta, gamma] = aimToDeviceAngles(yaw, pitch, roll);
        const back = G.cameraAim({ alpha, beta, gamma });
        worst = Math.max(
          worst,
          Math.abs(G.angleDelta(yaw, back.yaw)),
          Math.abs(back.pitch - pitch),
          Math.abs(G.angleDelta(roll, back.roll)),
        );
      }
    }
  }
  assert.ok(worst < 1e-6, `erreur max ${worst} °`);
});

test('aimToDeviceAngles : angles dans les plages de la spec W3C', () => {
  for (let yaw = 0; yaw < 360; yaw += 23) {
    for (let pitch = -85; pitch <= 85; pitch += 13) {
      for (const roll of [-150, -60, 0, 45, 160]) {
        const [alpha, beta, gamma] = aimToDeviceAngles(yaw, pitch, roll);
        const at = `${yaw}/${pitch}/${roll}`;
        assert.ok(alpha >= 0 && alpha < 360, `alpha ${alpha} hors [0,360) en ${at}`);
        assert.ok(beta >= -180 && beta < 180, `beta ${beta} hors [-180,180) en ${at}`);
        assert.ok(gamma >= -90 && gamma <= 90, `gamma ${gamma} hors [-90,90] en ${at}`);
      }
    }
  }
});

test('aimToDeviceAngles : le cas nominal reste le cas simple', () => {
  // Téléphone droit, visant l'horizon : c'est LA posture du géocadrage.
  const [alpha, beta, gamma] = aimToDeviceAngles(90, 0, 0);
  near(alpha, 270, 1e-9, 'alpha = 360 − cap');
  near(beta, 90, 1e-9, 'beta = 90 (portrait droit)');
  near(gamma, 0, 1e-9, 'gamma nul');
});

test('verrouillage de cardan : à beta = 90 le roulis est nécessairement nul', () => {
  // Un téléphone parfaitement droit ne PEUT pas être roulé : la contrainte est
  // physique, pas numérique. On vérifie que le code ne prétend pas le contraire.
  const aim = G.cameraAim({ alpha: 123, beta: 90, gamma: 45 });
  near(aim.roll, 0, 1e-9);
  near(aim.pitch, 0, 1e-9);
});

test('horizonLine : les directions à élévation nulle sont sur la droite', () => {
  const view = G.makeView(390, 780, 66);
  for (const [yaw, pitch, roll] of [[0, 0, 0], [130, -25, 0], [300, 40, 18], [45, 5, -33]]) {
    const basis = G.basisFromAim(yaw, pitch, roll);
    const { a, b, c } = horizonLine(basis, view);
    for (const az of [yaw - 20, yaw, yaw + 20]) {
      const p = G.projectDirection(G.basisFromAim(az, 0, 0).forward, basis, view);
      if (!p.inFront) continue;
      near(a * p.x + b * p.y + c, 0, 1e-9, `az ${az} sous visée ${yaw}/${pitch}/${roll}`);
    }
  }
});

test('horizonLine : le nadir tombe bien du côté « sol »', () => {
  const view = G.makeView(390, 780, 66);
  for (const [yaw, pitch, roll] of [[0, 0, 0], [130, -25, 0], [300, 30, 18]]) {
    const basis = G.basisFromAim(yaw, pitch, roll);
    const { a, b, c } = horizonLine(basis, view);
    const p = G.projectDirection([0, 0, -1], basis, view);
    if (!p.inFront) continue;
    assert.ok(a * p.x + b * p.y + c < 0, `nadir classé ciel pour ${yaw}/${pitch}/${roll}`);
  }
});

test('buildLandmarks : scène déterministe et plausible', () => {
  const a = buildLandmarks();
  const b = buildLandmarks();
  assert.deepEqual(a, b, 'la scène doit être identique à chaque chargement');
  assert.equal(a.length, 30);
  for (const m of a) {
    const d = G.distance(SIM_ORIGIN, m);
    assert.ok(d > 10 && d < 290, `repère à ${d.toFixed(0)} m`);
    assert.ok(m.height >= 3 && m.height <= 25);
  }
});
