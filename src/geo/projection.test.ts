import { describe, expect, it } from 'vitest'
import { scale } from './math'
import { coverViewport, fieldOfView, focalPx } from './optics'
import { basisFromAngles } from './orientation'
import {
  applyHomography,
  CARD_MAX,
  cardScale,
  cornersInFront,
  edgeFade,
  facesViewer,
  homography,
  NEAR_FADE,
  panelDistance,
  panelProximityFade,
  photoPlaneCorners,
  projectCard,
  projectPhoto,
  quadTransform,
  scaleQuad,
  viewCosine,
  type Point2,
  type Quad,
  type ScreenPoint,
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

describe('photo « carte » : taille plafonnée', () => {
  const quad = (x0: number, y0: number, x1: number, y1: number): Quad<ScreenPoint> => [
    { x: x0, y: y0, z: 1 },
    { x: x1, y: y0, z: 1 },
    { x: x1, y: y1, z: 1 },
    { x: x0, y: y1, z: 1 },
  ]

  it('une carte qui tient dans le plafond n’est pas réduite', () => {
    expect(cardScale(quad(100, 100, 200, 220), screen)).toBe(1)
  })

  it('trop large ou trop haute : réduite juste assez', () => {
    // 600 px de large pour un écran de 300 : réduite à 60 % de l'écran.
    expect(cardScale(quad(-150, 100, 450, 200), screen)).toBeCloseTo((CARD_MAX.width * 300) / 600, 9)
    // 400 px de haut : réduite à 45 % de la hauteur.
    expect(cardScale(quad(100, 0, 150, 400), screen)).toBeCloseTo(CARD_MAX.height, 9)
  })

  it('réduite autour de son centre : même forme, centre immobile', () => {
    const q = scaleQuad(quad(0, 0, 300, 400), { x: 150, y: 200 }, 0.5)
    expect(q.map((p) => [p.x, p.y])).toEqual([
      [75, 100],
      [225, 100],
      [225, 300],
      [75, 300],
    ])
  })

  it('au point de vue, la carte reste centrée et plafonnée', () => {
    const corners = photoPlaneCorners(basis, photo)
    const card = projectCard(corners, [0, 0, 0], basis, screen)
    const xs = card.corners.map((c) => c.x)
    const ys = card.corners.map((c) => c.y)
    expect((Math.min(...xs) + Math.max(...xs)) / 2).toBeCloseTo(150, 6)
    expect((Math.min(...ys) + Math.max(...ys)) / 2).toBeCloseTo(200, 6)
    expect(Math.max(...ys) - Math.min(...ys)).toBeCloseTo(CARD_MAX.height * 400, 6)
    expect(card.onScreen).toBe(true)
  })

  it('coins derrière l’objectif, centre devant : plan réduit autour de son centre', () => {
    const corners = photoPlaneCorners(basis, photo)
    // À 1 m du plan, objectif tourné de 40° : des coins passent derrière.
    const eye = scale(basis.f, 5)
    const turned = basisFromAngles({ heading: 80, pitch: 5, roll: 3 })
    expect(projectPhoto(corners, eye, turned, screen).inFront).toBe(false)
    const front = cornersInFront(corners, eye, turned)!
    const depth = (p: readonly number[]) =>
      (p[0] - eye[0]) * turned.f[0] + (p[1] - eye[1]) * turned.f[1] + (p[2] - eye[2]) * turned.f[2]
    const center = depth(scale(basis.f, 6))
    for (const c of front) expect(depth(c)).toBeGreaterThanOrEqual(center / 2 - 1e-9)
    expect(projectCard(corners, eye, turned, screen).inFront).toBe(true)
  })

  it('centre derrière l’objectif : rien à projeter', () => {
    const corners = photoPlaneCorners(basis, photo)
    const back = basisFromAngles({ heading: 220, pitch: -5, roll: 0 })
    expect(cornersInFront(corners, [0, 0, 0], back)).toBeNull()
    expect(projectCard(corners, [0, 0, 0], back, screen).onScreen).toBe(false)
  })
})

describe('effacement à l’approche du plan-photo', () => {
  const level = basisFromAngles({ heading: 0, pitch: 0, roll: 0 })
  const corners = photoPlaneCorners(level, photo)
  const halfW = (6 * 3000) / (2 * focalPx(26, 3000, 4000))

  it('distance au point le plus proche du rectangle, des deux côtés', () => {
    expect(panelDistance(corners, [0, 0, 0])).toBeCloseTo(6, 9)
    expect(panelDistance(corners, [1, 4.5, 0])).toBeCloseTo(1.5, 9)
    expect(panelDistance(corners, [-1, 7.5, 0])).toBeCloseTo(1.5, 9)
  })

  it('à côté du plan, dans son prolongement : distance au bord, pas au plan', () => {
    expect(panelDistance(corners, [halfW + 10, 6, 0])).toBeCloseTo(10, 9)
    expect(panelDistance(corners, [halfW + 3, 2, 0])).toBeCloseTo(5, 9)
  })

  it('photo du sol (objectif vers le bas) : jamais traversée depuis le point de vue', () => {
    const ground = basisFromAngles({ heading: 0, pitch: -80, roll: 0 })
    const plane = photoPlaneCorners(ground, photo)
    expect(panelDistance(plane, [0, 0, 0])).toBeCloseTo(6, 9)
    expect(panelDistance(plane, [0, 1, 0])).toBeGreaterThan(NEAR_FADE.clear)
  })

  it('nette à 2 m, floue et transparente en deçà, invisible sous 0,5 m', () => {
    expect(panelProximityFade(10)).toEqual({ opacity: 1, blur: 0 })
    expect(panelProximityFade(2)).toEqual({ opacity: 1, blur: 0 })
    const mid = panelProximityFade(1.25)
    expect(mid.opacity).toBeCloseTo(0.5, 9)
    expect(mid.blur).toBeCloseTo(NEAR_FADE.blur / 2, 9)
    expect(panelProximityFade(0.5)).toEqual({ opacity: 0, blur: NEAR_FADE.blur })
    expect(panelProximityFade(0)).toEqual({ opacity: 0, blur: NEAR_FADE.blur })
  })

  it('courbe douce et continue', () => {
    let last = panelProximityFade(0.5)
    for (let d = 0.55; d <= 2; d += 0.05) {
      const f = panelProximityFade(d)
      expect(f.opacity).toBeGreaterThanOrEqual(last.opacity)
      expect(f.opacity - last.opacity).toBeLessThan(0.06)
      expect(f.blur).toBeLessThanOrEqual(last.blur)
      last = f
    }
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
