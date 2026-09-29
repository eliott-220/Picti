import { describe, expect, it } from 'vitest'
import { fromENU } from '../geo/geodesy'
import { focalPx } from '../geo/optics'
import { basisFromAngles } from '../geo/orientation'
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
  const [tl, tr] = ar.projection.corners
  return { left: tl.x, right: tr.x, ar }
}

describe('photo ancrée dans le décor', () => {
  it('depuis le point de vue, recouvre exactement l’écran', () => {
    const { left, right } = edges(0, 0)
    expect(left).toBeCloseTo(0, 1)
    expect(right).toBeCloseTo(300, 1)
  })

  it('reste à sa place quand on s’écarte de quelques mètres (elle ne suit pas le téléphone)', () => {
    // 3 m à droite : la photo, restée en place, part vers la gauche de l'écran.
    const { left, right, ar } = edges(3, 0)
    expect(left).toBeCloseTo(-150, 0)
    expect(right).toBeCloseTo(150, 0)
    expect(ar.transform).not.toBeNull()
  })

  it('grandit quand on s’en approche, rapetisse quand on recule', () => {
    const near = edges(0, 3)
    expect(near.right - near.left).toBeCloseTo(600, 0)
    const far = edges(0, -6)
    expect(far.right - far.left).toBeCloseTo(150, 0)
  })

  it('n’est plus affichée une fois dépassée', () => {
    const { ar } = edges(0, 8)
    expect(ar.facing).toBe(false)
    expect(ar.transform).toBeNull()
    expect(ar.projection.onScreen).toBe(false)
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
