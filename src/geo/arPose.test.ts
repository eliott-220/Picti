import { describe, expect, it } from 'vitest'
import { localToGeo } from './arAlign'
import {
  approachTransform,
  arBasis,
  arPosition,
  compassTheta,
  focal35Of,
  localBasis,
  localPoint,
  localView,
  poseAt,
  poseJumped,
  turnRate,
  verticalFov,
  type ArPose,
} from './arPose'
import { distanceMeters } from './geodesy'
import { DEG, type Vec3 } from './math'
import { anglesFromBasis } from './orientation'

const REF = { lat: 46.1558, lon: -1.152 }

/** Caméra tenue droite (portrait), objectif au cap local `heading`, inclinée de `pitch`. */
function pose(t: number, heading: number, position: Vec3 = [0, 1.5, 0], pitch = 0): ArPose {
  const h = heading * DEG
  const p = pitch * DEG
  // Repère du suivi : x, y (haut), z ; cap local 0 = vers −z.
  const forward: Vec3 = [Math.sin(h) * Math.cos(p), Math.sin(p), -Math.cos(h) * Math.cos(p)]
  const right: Vec3 = [Math.cos(h), 0, Math.sin(h)]
  const up: Vec3 = [-Math.sin(h) * Math.sin(p), Math.cos(p), Math.cos(h) * Math.sin(p)]
  return { t, position, right, up, back: [-forward[0], -forward[1], -forward[2]] }
}

describe('repère du suivi → repère local', () => {
  it('objectif vers −z : cap local 0, horizontal, sans roulis ; x reste l’est local', () => {
    const b = localBasis(pose(0, 0))
    expect(b.f[0]).toBeCloseTo(0, 9)
    expect(b.f[1]).toBeCloseTo(1, 9)
    expect(b.u[2]).toBeCloseTo(1, 9)
    expect(b.r[0]).toBeCloseTo(1, 9)
    const a = anglesFromBasis(b)
    expect(a.pitch).toBeCloseTo(0, 9)
    expect(a.roll).toBeCloseTo(0, 9)
    expect(localPoint({ position: [2, 1, -3] })).toEqual([2, 3])
  })

  it('cap et inclinaison de l’objectif', () => {
    const v = localView(pose(0, 120, [0, 0, 0], 20))
    expect(v.heading).toBeCloseTo(120, 9)
    expect(v.pitch).toBeCloseTo(20, 9)
  })

  it('cap ENU = cap local + θ ; position = calage du point local', () => {
    const a = anglesFromBasis(arBasis(pose(0, 30, [0, 0, 0], -10), 250))
    expect(a.heading).toBeCloseTo(280, 9)
    expect(a.pitch).toBeCloseTo(-10, 9)
    const t = { ref: REF, theta: 90, e0: 5, n0: -2 }
    const p = pose(0, 0, [0, 1.6, -10]) // 10 m « devant » dans le repère local
    expect(distanceMeters(arPosition(p, t), localToGeo(t, [0, 10]))).toBeLessThan(1e-6)
    // θ = 90° : 10 m vers le nord local = 10 m vers l'est, depuis (5, −2).
    expect(distanceMeters(arPosition(p, t), localToGeo({ ref: REF, theta: 0, e0: 15, n0: -2 }, [0, 0]))).toBeLessThan(1e-6)
  })
})

describe('pose à l’instant d’un relevé GPS', () => {
  const history = [pose(1000, 0, [0, 0, 0]), pose(1100, 0, [1, 0, 0]), pose(1200, 0, [3, 0, 0])]

  it('interpolée entre deux images', () => {
    expect(poseAt(history, 1150)!.position[0]).toBeCloseTo(2, 9)
    expect(poseAt(history, 1000)!.position[0]).toBeCloseTo(0, 9)
  })

  it('un peu plus récente que la dernière image : la dernière ; trop vieille ou trop récente : aucune', () => {
    expect(poseAt(history, 1300)!.position[0]).toBe(3)
    expect(poseAt(history, 1400)).toBeNull()
    expect(poseAt(history, 900)).toBeNull()
    expect(poseAt([], 1000)).toBeNull()
  })
})

describe('mesures de boussole', () => {
  it('vitesse de rotation de l’objectif', () => {
    const turning = Array.from({ length: 16 }, (_, i) => pose(i * 16, 350 + i * 0.48))
    expect(turnRate(turning)).toBeCloseTo(30, 0)
    expect(turnRate([pose(0, 10), pose(16, 10)])).toBeCloseTo(0, 9)
    expect(turnRate([])).toBe(Infinity)
  })

  it('θ = cap boussole − cap local, seulement objectif près de l’horizon, téléphone stable, boussole sûre', () => {
    expect(compassTheta(100, 10, pose(0, 30), 2)).toBeCloseTo(70, 9)
    expect(compassTheta(10, null, pose(0, 30), 2)).toBeCloseTo(340, 9)
    expect(compassTheta(100, 10, pose(0, 30), 20)).toBeNull()
    expect(compassTheta(100, 40, pose(0, 30), 2)).toBeNull()
    expect(compassTheta(100, -1, pose(0, 30), 2)).toBeNull()
    expect(compassTheta(100, 10, pose(0, 30, [0, 0, 0], 70), 2)).toBeNull()
    expect(compassTheta(-1, 10, pose(0, 30), 2)).toBeNull()
  })
})

describe('calage affiché', () => {
  it('rejoint le calage calculé en douceur, y compris autour du nord', () => {
    const shown = { ref: REF, theta: 359, e0: 0, n0: 0 }
    const next = approachTransform(shown, { ref: REF, theta: 3, e0: 2, n0: 0 }, 1000, 1000)
    // 1 − e⁻¹ ≈ 63 % du chemin : 359° + 0,63 × 4°, 0,63 × 2 m.
    expect(next.theta).toBeCloseTo(1.53, 1)
    expect(next.e0).toBeCloseTo(1.26, 1)
  })

  it('premier calage, nouvelle référence ou grand écart : directement', () => {
    const target = { ref: REF, theta: 100, e0: 0, n0: 0 }
    expect(approachTransform(null, target, 16, 1000)).toBe(target)
    expect(approachTransform({ ...target, theta: 50 }, target, 16, 1000)).toBe(target)
    expect(approachTransform({ ...target, e0: 40 }, target, 16, 1000)).toBe(target)
    expect(approachTransform({ ...target, ref: { ...REF } }, target, 16, 1000)).toBe(target)
  })
})

describe('optique de la caméra du suivi', () => {
  it('focale équivalente et champ de l’image ARKit d’un iPhone (1920 × 1440, ~1450 px)', () => {
    expect(focal35Of(1450, 1440, 1920)).toBeCloseTo(26.1, 1)
    expect(verticalFov(1450, 1920)).toBeCloseTo(67.0, 0)
  })
})

describe('saut du repère du suivi', () => {
  it('un déplacement impossible d’une image à l’autre est un saut ; la marche, la course n’en sont pas', () => {
    expect(poseJumped(pose(0, 0, [0, 0, 0]), pose(16, 0, [0, 0, -3]))).toBe(true)
    expect(poseJumped(pose(0, 0, [0, 0, 0]), pose(16, 0, [0, 0, -0.05]))).toBe(false)
    expect(poseJumped(pose(0, 0, [0, 0, 0]), pose(200, 0, [0, 0, -1.2]))).toBe(false)
    // Trop longtemps sans image : on ne tranche pas.
    expect(poseJumped(pose(0, 0, [0, 0, 0]), pose(2000, 0, [0, 0, -30]))).toBe(false)
  })
})
