import { describe, expect, it } from 'vitest'
import { fromENU } from '../geo/geodesy'
import { DEG } from '../geo/math'
import { focalPx } from '../geo/optics'
import { basisFromAngles } from '../geo/orientation'
import { CARD_MAX, farScale, FAR, NEAR_FADE } from '../geo/projection'
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
  likesCount: 0,
  versionOf: null,
  versionsCount: 0,
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

/**
 * Bords gauche et droit de la carte à l'écran (px), son centre, et sa largeur sans le plafond
 * de taille (`full`) : la perspective du plan-photo, qui reste celle d'une photo ancrée.
 */
function edges(east: number, north: number, alt: number | null = null, offset?: [number, number, number]) {
  const ar = projectGeoPhoto(photo, at(east, north, alt), looking, screen, offset)
  const [tl, tr, br, bl] = ar.projection.corners
  return {
    left: tl.x,
    right: tr.x,
    height: br.y - tr.y,
    center: { x: (tl.x + br.x) / 2, y: (tl.y + bl.y) / 2 },
    full: (tr.x - tl.x) / ar.cardScale,
    ar,
  }
}

describe('photo ancrée dans le décor', () => {
  it('depuis le point de vue, carte centrée sur l’écran, à la place exacte de la photo', () => {
    const { center, full } = edges(0, 0)
    expect(center.x).toBeCloseTo(150, 1)
    expect(center.y).toBeCloseTo(200, 1)
    // Sans le plafond, elle recouvrirait exactement l'écran.
    expect(full).toBeCloseTo(300, 1)
  })

  it('reste à sa place quand on s’écarte de quelques mètres (elle ne suit pas le téléphone)', () => {
    // 3 m à droite : la photo, restée en place, part vers la gauche de l'écran
    // (son centre, au milieu de l'écran au point de vue, passe sur le bord gauche).
    const { left, right, full, ar } = edges(3, 0)
    expect((left + right) / 2).toBeCloseTo(0, 0)
    expect(full).toBeCloseTo(300 * farScale(3), 0)
    expect(ar.transform).not.toBeNull()
  })

  it('grandit quand on s’en approche, rapetisse quand on recule', () => {
    const near = edges(0, 3)
    expect(near.full).toBeCloseTo(600 * farScale(3), 0)
    const far = edges(0, -6)
    expect(far.full).toBeCloseTo(150 * farScale(6), 0)
    expect(far.right - far.left).toBeCloseTo(150 * farScale(6), 0)
    expect(near.right - near.left).toBeGreaterThan(far.right - far.left)
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
      const { center, full } = edges(0, 0, 25)
      expect(center.x).toBeCloseTo(150, 1)
      expect(center.y).toBeCloseTo(200, 1)
      expect(full).toBeCloseTo(300, 1)
    } finally {
      photo.geoframe.position = spot
    }
  })

  it('une fois recalée au point de vue, centrée comme au point de vue', () => {
    const { center, full } = edges(3, 0, null, [3, 0, 0])
    expect(center.x).toBeCloseTo(150, 1)
    expect(full).toBeCloseTo(300, 1)
  })
})

/** Boîte de la carte à l'écran (px). */
function box(ar: ReturnType<typeof projectGeoPhoto>) {
  const xs = ar.projection.corners.map((c) => c.x)
  const ys = ar.projection.corners.map((c) => c.y)
  return { w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) }
}

describe('photo « carte » : jamais plein écran en se promenant', () => {
  it('au point de vue : réduite au plafond, même forme (format 3:4)', () => {
    const ar = projectGeoPhoto(photo, at(0, 0), looking, screen)
    const { w, h } = box(ar)
    expect(h).toBeCloseTo(CARD_MAX.height * screen.height, 6)
    expect(w).toBeLessThanOrEqual(CARD_MAX.width * screen.width + 1e-6)
    expect(w / h).toBeCloseTo(3 / 4, 6)
    expect(ar.cardScale).toBeCloseTo(0.45, 6)
  })

  it('de loin : taille de la perspective, sans réduction', () => {
    const ar = projectGeoPhoto(photo, at(0, -20), looking, screen)
    expect(ar.cardScale).toBe(1)
    expect(box(ar).h).toBeLessThan(CARD_MAX.height * screen.height)
  })

  it('en marchant vers elle : plafonnée à chaque pas, toujours centrée à sa place', () => {
    for (let north = -10; north <= 3.5; north += 0.25) {
      const ar = projectGeoPhoto(photo, at(0, north), looking, screen)
      expect(ar.transform).not.toBeNull()
      const { w, h } = box(ar)
      expect(w).toBeLessThanOrEqual(CARD_MAX.width * screen.width + 1e-6)
      expect(h).toBeLessThanOrEqual(CARD_MAX.height * screen.height + 1e-6)
      // Dans l'axe : le centre de la photo reste au centre de l'écran.
      const [tl, , br] = ar.projection.corners
      expect((tl.x + br.x) / 2).toBeCloseTo(150, 6)
    }
  })

  it('de côté, réduite autour du centre que lui donne la perspective', () => {
    // 2 m à droite, à 3 m du plan : le centre de la photo est vu 2 m à gauche de l'axe.
    const view = basisFromAngles({ heading: -20, pitch: 0, roll: 0 })
    const ar = projectGeoPhoto(photo, at(2, 3), view, screen)
    expect(ar.cardScale).toBeLessThan(1)
    const [tl, tr, br, bl] = ar.projection.corners
    // Centre projeté = intersection des diagonales du quadrilatère.
    const t =
      ((bl.x - tl.x) * (tr.y - bl.y) - (bl.y - tl.y) * (tr.x - bl.x)) /
      ((br.x - tl.x) * (tr.y - bl.y) - (br.y - tl.y) * (tr.x - bl.x))
    const center = { x: tl.x + t * (br.x - tl.x), y: tl.y + t * (br.y - tl.y) }
    const d = [-2, 3, 0] as const
    const z = d[0] * view.f[0] + d[1] * view.f[1]
    const x = d[0] * view.r[0] + d[1] * view.r[1]
    expect(center.x).toBeCloseTo(150 + (screen.focal * x) / z, 6)
    expect(center.y).toBeCloseTo(200, 6)
  })

  it('tout près, en tournant le téléphone : pas de disparition sèche', () => {
    // À 1,2 m du plan, objectif tourné de 30° : des coins du plan passent derrière l'objectif ;
    // la carte reste affichée, plus petite, à sa place.
    const turned = basisFromAngles({ heading: 30, pitch: 0, roll: 0 })
    const ar = projectGeoPhoto(photo, at(0, 4.8), turned, screen)
    expect(ar.fade).toBeGreaterThan(0)
    expect(ar.transform).not.toBeNull()
  })
})

describe('effacement à moins de 2 m de la photo', () => {
  // Plan-photo à 6 m au nord du point de vue, vertical : à `north` m, on en est à 6 − north m.
  const near = (north: number, east = 0, view = looking) => projectGeoPhoto(photo, at(east, north), view, screen)

  it('nette à 2 m', () => {
    const ar = near(4)
    expect(ar.panelDistance).toBeCloseTo(2, 6)
    expect(ar.fade).toBeCloseTo(1, 6)
    expect(ar.blur).toBeCloseTo(0, 6)
  })

  it('de 2 m à 0,5 m : de plus en plus floue et transparente', () => {
    let last = { fade: 1, blur: 0 }
    for (const north of [4.4, 4.8, 5.2]) {
      const ar = near(north)
      expect(ar.fade).toBeLessThan(last.fade)
      expect(ar.blur).toBeGreaterThan(last.blur)
      expect(ar.blur).toBeLessThan(NEAR_FADE.blur)
      expect(ar.transform).not.toBeNull()
      last = ar
    }
  })

  it('sous 0,5 m : invisible', () => {
    const ar = near(5.6)
    expect(ar.fade).toBe(0)
    expect(ar.transform).toBeNull()
    expect(ar.projection.onScreen).toBe(false)
  })

  it('côté vitre (on l’a traversée, on se retourne) : même règle', () => {
    const south = basisFromAngles({ heading: 180, pitch: 0, roll: 0 })
    const front = near(4.8)
    const back = near(7.2, 0, south)
    expect(back.facing).toBe(false)
    expect(back.panelDistance).toBeCloseTo(front.panelDistance, 6)
    expect(back.fade).toBeCloseTo(front.fade, 6)
    expect(back.blur).toBeCloseTo(front.blur, 6)
    // Plus loin derrière : vitre nette.
    expect(near(9, 0, south).blur).toBe(0)
  })

  it('passer à côté de la photo, à 10 m sur le côté : rien', () => {
    const west = basisFromAngles({ heading: 270, pitch: 0, roll: 0 })
    for (const north of [4, 6, 8]) {
      const ar = near(north, 10, west)
      expect(ar.panelDistance).toBeGreaterThan(5)
      expect(ar.blur).toBe(0)
    }
  })

  it('au point de vue et dans le rayon de capture : jamais effacée', () => {
    for (const [east, north] of [
      [0, 0],
      [3, 0],
      [0, -5],
      [-4, 2],
    ]) {
      const ar = near(north, east)
      expect(ar.panelDistance).toBeGreaterThan(NEAR_FADE.clear)
      expect(ar.blur).toBe(0)
    }
  })
})
