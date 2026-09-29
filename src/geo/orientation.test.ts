import { describe, expect, it } from 'vitest'
import { cross, dot, norm } from './math'
import {
  anglesFromBasis,
  basisFromAngles,
  basisFromDeviceOrientation,
  frontCameraBasis,
  rotateAboutUp,
  rotateForScreen,
  smoothBasis,
  type CameraBasis,
} from './orientation'

function expectOrthonormal(b: CameraBasis) {
  expect(norm(b.f)).toBeCloseTo(1)
  expect(norm(b.r)).toBeCloseTo(1)
  expect(norm(b.u)).toBeCloseTo(1)
  expect(dot(b.f, b.r)).toBeCloseTo(0)
  expect(dot(b.f, b.u)).toBeCloseTo(0)
  expect(dot(b.r, b.u)).toBeCloseTo(0)
  // Repère direct : avant = haut × droite… soit droite = avant × haut.
  const r = cross(b.f, b.u)
  expect(r[0]).toBeCloseTo(b.r[0])
  expect(r[1]).toBeCloseTo(b.r[1])
  expect(r[2]).toBeCloseTo(b.r[2])
}

describe('basisFromDeviceOrientation', () => {
  it('téléphone tenu droit face au nord : cap 0°, horizontal', () => {
    const a = anglesFromBasis(basisFromDeviceOrientation(0, 90, 0))
    expect(a.heading).toBeCloseTo(0)
    expect(a.pitch).toBeCloseTo(0)
    expect(a.roll).toBeCloseTo(0)
  })

  it('alpha croît dans le sens anti-horaire : alpha 90° → ouest', () => {
    expect(anglesFromBasis(basisFromDeviceOrientation(90, 90, 0)).heading).toBeCloseTo(270)
    expect(anglesFromBasis(basisFromDeviceOrientation(270, 90, 0)).heading).toBeCloseTo(90)
  })

  it('beta au-delà de 90° lève l’objectif', () => {
    const a = anglesFromBasis(basisFromDeviceOrientation(0, 120, 0))
    expect(a.pitch).toBeCloseTo(30)
    expect(a.heading).toBeCloseTo(0)
  })

  it('téléphone à plat, écran vers le ciel : objectif vers le sol', () => {
    const a = anglesFromBasis(basisFromDeviceOrientation(0, 0, 0))
    expect(a.pitch).toBeCloseTo(-90)
  })

  it('produit toujours une base orthonormée directe', () => {
    for (const [al, be, ga] of [
      [10, 80, 5],
      [200, 100, -30],
      [300, 45, 60],
    ]) {
      expectOrthonormal(basisFromDeviceOrientation(al, be, ga))
    }
  })
})

describe('angles ⇄ base', () => {
  it('fait l’aller-retour', () => {
    for (const angles of [
      { heading: 0, pitch: 0, roll: 0 },
      { heading: 123, pitch: 15, roll: -8 },
      { heading: 359, pitch: -40, roll: 30 },
      { heading: 270, pitch: 70, roll: 170 },
    ]) {
      const b = basisFromAngles(angles)
      expectOrthonormal(b)
      const back = anglesFromBasis(b)
      expect(back.heading).toBeCloseTo(angles.heading)
      expect(back.pitch).toBeCloseTo(angles.pitch)
      expect(back.roll).toBeCloseTo(angles.roll)
    }
  })

  it('un roulis positif penche le haut de l’image vers la droite', () => {
    const b = basisFromAngles({ heading: 0, pitch: 0, roll: 20 })
    expect(b.u[0]).toBeGreaterThan(0) // cap nord : la droite, c’est l’est
  })
})

describe('rotateForScreen', () => {
  it('en paysage (90°), le haut de l’écran est le côté droit de l’appareil', () => {
    const b = basisFromDeviceOrientation(0, 90, 0)
    const s = rotateForScreen(b, 90)
    expect(s.u[0]).toBeCloseTo(b.r[0])
    expect(s.u[1]).toBeCloseTo(b.r[1])
    expect(s.u[2]).toBeCloseTo(b.r[2])
    expectOrthonormal(s)
  })
})

describe('rotateAboutUp', () => {
  it('décale le cap sans toucher à l’inclinaison ni au roulis', () => {
    const b = rotateAboutUp(basisFromAngles({ heading: 350, pitch: 12, roll: -5 }), 30)
    expectOrthonormal(b)
    const a = anglesFromBasis(b)
    expect(a.heading).toBeCloseTo(20)
    expect(a.pitch).toBeCloseTo(12)
    expect(a.roll).toBeCloseTo(-5)
  })
})

describe('smoothBasis', () => {
  it('reste orthonormée et passe sans saut de 359° à 1°', () => {
    const a = basisFromAngles({ heading: 359, pitch: 0, roll: 0 })
    const b = basisFromAngles({ heading: 1, pitch: 0, roll: 0 })
    const s = smoothBasis(a, b, 0.5)
    expectOrthonormal(s)
    const h = anglesFromBasis(s).heading
    expect(Math.min(h, 360 - h)).toBeCloseTo(0, 5)
  })
})

describe('frontCameraBasis', () => {
  it('téléphone face au nord : la caméra avant regarde vers le sud', () => {
    const a = anglesFromBasis(frontCameraBasis(basisFromDeviceOrientation(0, 90, 0)))
    expect(a.heading).toBeCloseTo(180)
    expect(a.pitch).toBeCloseTo(0)
    expect(a.roll).toBeCloseTo(0)
  })

  it('retourne le cap, inverse l’inclinaison et le roulis', () => {
    const b = frontCameraBasis(basisFromAngles({ heading: 30, pitch: 15, roll: 8 }))
    expectOrthonormal(b)
    const a = anglesFromBasis(b)
    expect(a.heading).toBeCloseTo(210)
    expect(a.pitch).toBeCloseTo(-15)
    expect(a.roll).toBeCloseTo(-8)
  })

  it('appliquée deux fois, redonne la caméra arrière', () => {
    const b = basisFromAngles({ heading: 123, pitch: -20, roll: 4 })
    const a = anglesFromBasis(frontCameraBasis(frontCameraBasis(b)))
    expect(a.heading).toBeCloseTo(123)
    expect(a.pitch).toBeCloseTo(-20)
    expect(a.roll).toBeCloseTo(4)
  })
})
