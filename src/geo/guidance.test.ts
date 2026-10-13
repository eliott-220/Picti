import { describe, expect, it } from 'vitest'
import { arrowDeg, compassReference, deviceHeading, guideTo, steadyViewer, unwrapDeg } from './guidance'
import { basisFromAngles, basisFromDeviceOrientation, type CameraBasis } from './orientation'
import { fromENU, type GeoFix } from './geodesy'

/** Téléphone à plat, écran vers le ciel, le haut de l'écran vers `heading`. */
function flat(heading: number): CameraBasis {
  // Debout vers `heading`, puis basculé de 90° vers l'avant : l'objectif vise le sol.
  return basisFromAngles({ heading, pitch: -90, roll: 0 })
}

/** Téléphone debout, l'objectif vers `heading` (inclinaison `pitch`). */
const upright = (heading: number, pitch = 0): CameraBasis => basisFromAngles({ heading, pitch, roll: 0 })

const origin: GeoFix = { lat: 46.1591, lon: -1.1517, alt: null, accuracy: 5, timestamp: 0 }
const at = (east: number, north: number, accuracy = 5): GeoFix => ({ ...fromENU(origin, [east, north, 0]), alt: null, accuracy, timestamp: 0 })

describe('cap du téléphone tel qu’on le tient (0.24.0)', () => {
  it('debout : le cap de l’objectif (0, 90, 180, 270°)', () => {
    for (const h of [0, 90, 180, 270]) expect(deviceHeading(upright(h))).toBeCloseTo(h, 5)
  })

  it('à plat : la direction du haut de l’écran (0, 90, 180, 270°), pas un bruit', () => {
    for (const h of [0, 90, 180, 270]) expect(deviceHeading(flat(h))! % 360).toBeCloseTo(h % 360, 5)
    // Quelques degrés d'inclinaison autour de la position à plat ne font pas sauter le cap.
    for (const pitch of [-80, -85, -89, -91 + 0.5]) expect(deviceHeading(upright(40, pitch))).toBeCloseTo(40, 5)
  })

  it('à plat d’après les capteurs du navigateur (alpha, beta, gamma) : le haut de l’écran', () => {
    // alpha = 0, beta = 0 : à plat, le haut vers l'« alpha 0 » du repère (nord) ; alpha tourne en sens inverse.
    expect(deviceHeading(basisFromDeviceOrientation(0, 0, 0))).toBeCloseTo(0, 5)
    expect(deviceHeading(basisFromDeviceOrientation(90, 0, 0))).toBeCloseTo(270, 5)
    // Debout (beta = 90) : l'objectif.
    expect(deviceHeading(basisFromDeviceOrientation(0, 90, 0))).toBeCloseTo(0, 5)
  })

  it('référence de la boussole : l’objectif debout, le haut de l’écran à plat', () => {
    expect(compassReference(upright(120, -20)).heading).toBeCloseTo(120, 5)
    expect(compassReference(flat(200)).heading).toBeCloseTo(200, 5)
    // À plat, l'inclinaison de référence est celle du haut de l'écran (proche de l'horizon) : recalage permis.
    expect(Math.abs(compassReference(flat(200)).pitch)).toBeLessThan(1)
  })
})

describe('flèche vers une photo', () => {
  it('photo au nord, à l’est… selon le cap (0 / 90 / 180 / 270°)', () => {
    // Photo au nord : vers le haut quand on regarde le nord, à gauche quand on regarde l'est…
    expect(arrowDeg(0, 0)).toBe(0)
    expect(arrowDeg(90, 0)).toBe(-90)
    expect(arrowDeg(180, 0)).toBe(180)
    expect(arrowDeg(270, 0)).toBe(90)
    // Photo à l'est.
    expect(arrowDeg(0, 90)).toBe(90)
    expect(arrowDeg(90, 90)).toBe(0)
    expect(arrowDeg(180, 90)).toBe(-90)
    expect(arrowDeg(270, 90)).toBe(180)
  })

  it('sans cap fiable : nord en haut', () => {
    expect(arrowDeg(null, 90)).toBe(90)
    expect(arrowDeg(null, -30)).toBe(330)
  })

  it('même résultat à plat et debout', () => {
    for (const h of [0, 45, 135, 300]) {
      expect(arrowDeg(deviceHeading(flat(h)), 90)).toBeCloseTo(arrowDeg(deviceHeading(upright(h)), 90), 5)
    }
  })

  it('tourne par le plus court chemin (transition CSS)', () => {
    expect(unwrapDeg(null, 10)).toBe(10)
    expect(unwrapDeg(350, 10)).toBe(370)
    expect(unwrapDeg(-170, 170)).toBe(-190)
    expect(unwrapDeg(720, 30)).toBe(750)
  })
})

describe('position stable et « ici »', () => {
  it('ne suit pas les sauts du GPS plus petits que sa précision', () => {
    const anchor = steadyViewer(null, at(0, 0, 5))
    expect(steadyViewer(anchor, at(3, -2, 5))).toBe(anchor)
    // Vrai déplacement (au-delà de la précision) : suivi.
    const moved = at(8, 0, 5)
    expect(steadyViewer(anchor, moved)).toBe(moved)
    // Point nettement plus précis : pris aussitôt.
    const sharp = at(1, 1, 2)
    expect(steadyViewer(anchor, sharp)).toBe(sharp)
  })

  it('pas de flèche quand la photo est plus près que la précision du GPS', () => {
    const photo = at(0, 10)
    expect(guideTo(origin, photo, 12).bearing).toBeNull()
    const far = guideTo(origin, photo, 5)
    expect(far.bearing).toBeCloseTo(0, 3)
    expect(far.distance).toBeCloseTo(10, 1)
    expect(guideTo(origin, at(20, 0), 5).bearing).toBeCloseTo(90, 3)
  })
})
