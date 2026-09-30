import { describe, expect, it } from 'vitest'
import { fromENU } from '../geo/geodesy'
import { DEG } from '../geo/math'
import { focalPx } from '../geo/optics'
import { basisFromAngles } from '../geo/orientation'
import { farScale, FAR } from '../geo/projection'
import { projectGeoPhoto, type GeoframedPhoto } from './arProjection'

const spot = { lat: 46.1557, lon: -1.1533 }

// Photo prise face au nord, sujet à 6 m.
const photo: GeoframedPhoto = {
  id: 'p1',
  owner: 'u1',
  ownerName: 'Eliott',
  visibility: 'public',
  imagePath: '',
  thumbPath: '',
  title: 'Test',
  addedAt: 0,
  takenAt: 0,
  width: 3000,
  height: 4000,
  focal35: 26,
  depth: 6,
  mode: 'direct',
  geoframe: { position: spot, accuracy: 5, heading: 0, pitch: 0, roll: 0, headingSource: 'boussole' },
  hintPosition: null,
  selfie: false,
}

// Le spectateur regarde lui aussi vers le nord, avec un écran au cadrage de la photo.
const looking = basisFromAngles({ heading: 0, pitch: 0, roll: 0 })
const screen = { width: 300, height: 400, focal: focalPx(26, 300, 400) }

/** Position du spectateur à `east`, `north` mètres du point de vue. */
const at = (east: number, north: number, alt: number | null = null) => ({
  ...fromENU(spot, [east, north, 0]),
  alt,
  accuracy: 5,
  timestamp: 0,
})

/** Bords gauche et droit de la photo à l'écran (px). */
function edges(east: number, north: number, alt: number | null = null, offset?: [number, number, number]) {
  const ar = projectGeoPhoto(photo, at(east, north, alt), looking, screen, offset)
  const [tl, tr, br] = ar.projection.corners
  return { left: tl.x, right: tr.x, height: br.y - tr.y, ar }
}

describe('photo ancrée dans le décor', () => {
  it('depuis le point de vue, recouvre exactement l’écran', () => {
    const { left, right } = edges(0, 0)
    expect(left).toBeCloseTo(0, 1)
    expect(right).toBeCloseTo(300, 1)
  })

  it('reste à sa place quand on s’écarte de quelques mètres (elle ne suit pas le téléphone)', () => {
    // 3 m à droite : la photo, restée en place, part vers la gauche de l'écran
    // (son centre, au milieu de l'écran au point de vue, passe sur le bord gauche).
    const { left, right, ar } = edges(3, 0)
    expect((left + right) / 2).toBeCloseTo(0, 0)
    expect(right - left).toBeCloseTo(300 * farScale(3), 0)
    expect(ar.transform).not.toBeNull()
  })

  it('grandit quand on s’en approche, rapetisse quand on recule', () => {
    const near = edges(0, 3)
    expect(near.right - near.left).toBeCloseTo(600 * farScale(3), 0)
    const far = edges(0, -6)
    expect(far.right - far.left).toBeCloseTo(150 * farScale(6), 0)
  })

  it('de loin, paraît lointaine', () => {
    // À 20 m derrière le point de vue : la perspective seule la laisserait à 6/26 de sa
    // taille ; elle est trois fois plus petite : moins de 8 % de sa largeur au point de vue.
    const { left, right } = edges(0, -20)
    expect(right - left).toBeLessThan(0.08 * 300)
    expect(right - left).toBeLessThan((300 * 6) / 26 / 2.5)
  })

  it('de très loin, reste repérable', () => {
    const { height } = edges(0, -120)
    const minHeight = 2 * screen.focal * Math.tan((FAR.minAngle * DEG) / 2)
    expect(height).toBeCloseTo(minHeight, 0)
  })

  it('dépassée, en regardant dans le même sens : derrière soi, hors écran', () => {
    const { ar } = edges(0, 8)
    expect(ar.facing).toBe(false)
    expect(ar.projection.onScreen).toBe(false)
  })

  it('dépassée, en se retournant : visible de dos, en miroir, comme sur une vitre', () => {
    const south = basisFromAngles({ heading: 180, pitch: 0, roll: 0 })
    const ar = projectGeoPhoto(photo, at(0, 12), south, screen)
    expect(ar.facing).toBe(false)
    expect(ar.fade).toBeCloseTo(1, 6)
    expect(ar.transform).not.toBeNull()
    expect(ar.projection.onScreen).toBe(true)
    // Miroir : le coin haut-gauche de l'image passe à droite du coin haut-droit.
    const [tl, tr] = ar.projection.corners
    expect(tl.x).toBeGreaterThan(tr.x)
  })

  it('vue par la tranche : s’efface', () => {
    const west = basisFromAngles({ heading: 270, pitch: 0, roll: 0 })
    const edge = projectGeoPhoto(photo, at(25, 6), west, screen)
    expect(edge.fade).toBe(0)
    expect(edge.transform).toBeNull()
    const oblique = projectGeoPhoto(photo, at(25, 0), west, screen)
    expect(oblique.fade).toBeGreaterThan(0)
    expect(oblique.fade).toBeLessThan(1)
  })

  it('ne dépend pas de l’altitude GPS', () => {
    photo.geoframe.position = { ...spot, alt: 12 }
    try {
      const { left, right } = edges(0, 0, 25)
      expect(left).toBeCloseTo(0, 1)
      expect(right).toBeCloseTo(300, 1)
    } finally {
      photo.geoframe.position = spot
    }
  })

  it('une fois recalée au point de vue, recouvre l’écran', () => {
    const { left, right } = edges(3, 0, null, [3, 0, 0])
    expect(left).toBeCloseTo(0, 1)
    expect(right).toBeCloseTo(300, 1)
  })
})
