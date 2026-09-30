import { describe, expect, it } from 'vitest'
import { scale } from './math'
import { coverViewport, fieldOfView, focalPx } from './optics'
import { basisFromAngles } from './orientation'
import {
  applyHomography,
  edgeFade,
  facesViewer,
  homography,
  photoPlaneCorners,
  projectPhoto,
  quadTransform,
  viewCosine,
  type Point2,
  type Quad,
} from './projection'

const photo = { width: 3000, height: 4000, focal35: 26, depth: 6 }
const basis = basisFromAngles({ heading: 40, pitch: 5, roll: 3 })
// Écran ayant exactement le cadrage de la photo (même format, même focale).
const screen = { width: 300, height: 400, focal: focalPx(26, 300, 400) }

describe('optique', () => {
  it('un 26 mm en portrait 3:4 couvre ~53° en largeur', () => {
    const fov = fieldOfView(26, 3000, 4000)
    expect(fov.h).toBeCloseTo(53.1, 0)
    expect(fov.v).toBeCloseTo(67.4, 0)
  })

  it('le mode cover agrandit la focale du facteur de recadrage', () => {
    const cam = coverViewport(1440, 1920, 390, 844, 26)
    expect(cam.focal).toBeCloseTo(focalPx(26, 1440, 1920) * (844 / 1920))
  })
})

describe('projection du plan-photo', () => {
  it('depuis le point de vue exact, la photo recouvre tout le cadre', () => {
    for (const depth of [2, 6, 50]) {
      const corners = photoPlaneCorners(basis, { ...photo, depth })
      const p = projectPhoto(corners, [0, 0, 0], basis, screen)
      expect(p.inFront).toBe(true)
      const expected = [
        [0, 0],
        [300, 0],
        [300, 400],
        [0, 400],
      ]
      p.corners.forEach((c, i) => {
        expect(c.x).toBeCloseTo(expected[i][0], 6)
        expect(c.y).toBeCloseTo(expected[i][1], 6)
      })
    }
  })

  it('s’agrandit quand on avance dans l’axe de la prise de vue', () => {
    const corners = photoPlaneCorners(basis, photo)
    const p = projectPhoto(corners, scale(basis.f, 2), basis, screen)
    const width = p.corners[1].x - p.corners[0].x
    expect(width).toBeGreaterThan(300)
  })

  it('se décale vers la gauche quand on se déplace vers la droite', () => {
    const corners = photoPlaneCorners(basis, photo)
    const p = projectPhoto(corners, scale(basis.r, 1), basis, screen)
    expect(p.corners[0].x).toBeLessThan(0)
    expect(p.onScreen).toBe(true)
  })

  it('disparaît une fois dépassée', () => {
    const corners = photoPlaneCorners(basis, photo)
    const p = projectPhoto(corners, scale(basis.f, 10), basis, screen)
    expect(p.inFront).toBe(false)
    expect(p.onScreen).toBe(false)
  })

  it('se voit de face jusqu’à ce qu’on la dépasse', () => {
    expect(facesViewer(basis, 6, [0, 0, 0])).toBe(true)
    expect(facesViewer(basis, 6, scale(basis.f, -20))).toBe(true)
    expect(facesViewer(basis, 6, scale(basis.r, 15))).toBe(true)
    expect(facesViewer(basis, 6, scale(basis.f, 7))).toBe(false)
  })

  it('angle de vue : 1 de face ou de dos, 0 par la tranche', () => {
    expect(viewCosine(basis, 6, [0, 0, 0])).toBeCloseTo(1, 6)
    // 12 m devant le point de vue : on voit le plan de dos, dans l'axe.
    expect(viewCosine(basis, 6, scale(basis.f, 12))).toBeCloseTo(1, 6)
    // Sur le côté, à hauteur du plan : par la tranche.
    const side = [basis.f[0] * 6 + basis.r[0] * 20, basis.f[1] * 6 + basis.r[1] * 20, basis.f[2] * 6 + basis.r[2] * 20] as const
    expect(viewCosine(basis, 6, side)).toBeCloseTo(0, 6)
  })

  it('s’efface en douceur quand on la voit par la tranche', () => {
    expect(edgeFade(1)).toBe(1)
    expect(edgeFade(0.02)).toBe(0)
    expect(edgeFade(0.2)).toBeGreaterThan(0)
    expect(edgeFade(0.2)).toBeLessThan(1)
  })

  it('n’est pas à l’écran quand on regarde à l’opposé', () => {
    const corners = photoPlaneCorners(basis, photo)
    const back = basisFromAngles({ heading: 220, pitch: -5, roll: 0 })
    expect(projectPhoto(corners, [0, 0, 0], back, screen).onScreen).toBe(false)
  })
})

describe('homographie', () => {
  const src: Quad<Point2> = [
    [0, 0],
    [100, 0],
    [100, 50],
    [0, 50],
  ]
  const dst: Quad<Point2> = [
    [10, 20],
    [230, 5],
    [210, 180],
    [30, 140],
  ]

  it('envoie chaque coin source sur son coin cible', () => {
    const h = homography(src, dst)!
    src.forEach(([x, y], i) => {
      const [X, Y] = applyHomography(h, x, y)
      expect(X).toBeCloseTo(dst[i][0], 6)
      expect(Y).toBeCloseTo(dst[i][1], 6)
    })
  })

  it('refuse une configuration dégénérée', () => {
    expect(
      homography(src, [
        [0, 0],
        [1, 1],
        [2, 2],
        [3, 3],
      ]),
    ).toBeNull()
  })

  it('produit une transformation CSS matrix3d', () => {
    const t = quadTransform(100, 50, dst.map(([x, y]) => ({ x, y, z: 1 })) as never)
    expect(t).toMatch(/^matrix3d\(([-\d.e]+,){15}[-\d.e]+\)$/)
  })
})
