import { describe, expect, it } from 'vitest'
import { fromENU } from './geodesy'
import { cycle, groupBySpot, NEW_PHOTO_BOOST_HOURS, pileOrder, sameSpot, spotRadius, type PileEntry } from './spots'

const origin = { lat: 46.1558, lon: -1.1522 }
const at = (east: number, north: number) => fromENU(origin, [east, north, 0])

const photos = [
  { id: 'ancienne', pos: at(0, 0), date: 2018 },
  { id: 'recente', pos: at(3, 2), date: 2024 },
  { id: 'moyenne', pos: at(-4, 1), date: 2021 },
  { id: 'ailleurs', pos: at(80, 0), date: 2023 },
]

describe('sameSpot', () => {
  const point = (east: number, heading: number | null, accuracy: number | null) => ({
    position: at(east, 0),
    heading,
    accuracy,
  })

  it('4 m, même direction : même lieu', () => {
    expect(sameSpot(point(0, 250, 3), point(4, 260, 3))).toBe(true)
  })

  it('7 m avec un GPS à ±3 m : lieux différents (rayon de 5 m)', () => {
    expect(spotRadius(point(0, 250, 3), point(7, 250, 3))).toBe(5)
    expect(sameSpot(point(0, 250, 3), point(7, 250, 3))).toBe(false)
  })

  it('7 m avec un GPS à ±8 m : même lieu (rayon élargi à 8 m)', () => {
    expect(spotRadius(point(0, 250, 3), point(7, 250, 8))).toBe(8)
    expect(sameSpot(point(0, 250, 3), point(7, 250, 8))).toBe(true)
  })

  it('3 m, dos à dos : lieux différents', () => {
    expect(sameSpot(point(0, 90, 3), point(3, 270, 3))).toBe(false)
  })

  it('12 m : toujours différents, même avec un GPS imprécis', () => {
    expect(sameSpot(point(0, 250, 30), point(12, 250, 30))).toBe(false)
    expect(sameSpot(point(0, 250, null), point(12, 250, null))).toBe(false)
  })

  it('précision inconnue : 10 m ; sans cap : la distance seule', () => {
    expect(spotRadius(point(0, 0, null), point(0, 0, 2))).toBe(10)
    expect(sameSpot(point(0, null, null), point(9, 90, null))).toBe(true)
  })
})

describe('groupBySpot', () => {
  const spots = groupBySpot(
    photos,
    (p) => ({ position: p.pos }),
    (p) => p.date,
  )

  it('regroupe les prises de vue au même endroit', () => {
    expect(spots).toHaveLength(2)
  })

  it('sans ordre de pile : la plus récente devant, puis les plus anciennes', () => {
    expect(spots[0].items.map((p) => p.id)).toEqual(['recente', 'moyenne', 'ancienne'])
  })

  it('ancre chaque lieu sur sa photo la plus récente', () => {
    expect(spots[0].position).toEqual(photos[1].pos)
    expect(spots[1].items.map((p) => p.id)).toEqual(['ailleurs'])
  })

  it('sépare des lieux distants de plus que le rayon', () => {
    const far = groupBySpot(
      [
        { pos: at(0, 0), date: 1 },
        { pos: at(0, 15), date: 2 },
      ],
      (p) => ({ position: p.pos }),
      (p) => p.date,
    )
    expect(far).toHaveLength(2)
  })

  it('sépare deux photos dos à dos au même endroit', () => {
    const backToBack = groupBySpot(
      [
        { pos: at(0, 0), heading: 90, date: 1 },
        { pos: at(1, 0), heading: 270, date: 2 },
      ],
      (p) => ({ position: p.pos, heading: p.heading, accuracy: 3 }),
      (p) => p.date,
    )
    expect(backToBack).toHaveLength(2)
  })

  it('range la pile selon l’ordre donné, sans déplacer le lieu', () => {
    const liked = groupBySpot(
      photos.map((p) => ({ ...p, likes: p.id === 'ancienne' ? 5 : 0 })),
      (p) => ({ position: p.pos }),
      (p) => p.date,
      (a, b) => b.likes - a.likes || b.date - a.date,
    )
    expect(liked[0].items.map((p) => p.id)).toEqual(['ancienne', 'recente', 'moyenne'])
    expect(liked[0].position).toEqual(photos[1].pos)
  })
})

describe('pileOrder', () => {
  const day = 86_400_000
  const now = Date.parse('2026-10-06T12:00:00Z')
  const entry = (id: string, likes: number, ageDays: number, time = now - ageDays * day) => ({
    id,
    e: { likes, addedAt: now - ageDays * day, time } satisfies PileEntry,
  })
  const order = (list: ReturnType<typeof entry>[]) =>
    [...list].sort(pileOrder((x) => x.e, now)).map((x) => x.id)

  it('la plus aimée devant', () => {
    expect(order([entry('a', 1, 10), entry('b', 7, 30), entry('c', 3, 5)])).toEqual(['b', 'c', 'a'])
  })

  it('à égalité de likes : la plus récente devant', () => {
    expect(order([entry('vieille', 2, 30), entry('recente', 2, 3)])).toEqual(['recente', 'vieille'])
  })

  it(`une photo ajoutée depuis moins de ${NEW_PHOTO_BOOST_HOURS} h passe en tête, même sans like`, () => {
    expect(order([entry('star', 50, 10), entry('neuve', 0, 0.5)])).toEqual(['neuve', 'star'])
    // Au-delà, elle reprend sa place selon ses likes.
    expect(order([entry('star', 50, 10), entry('hier', 0, 1.5)])).toEqual(['star', 'hier'])
  })

  it('entre photos neuves : la plus récente devant', () => {
    expect(order([entry('ce-matin', 9, 0.3), entry('a-l-instant', 0, 0.01)])).toEqual(['a-l-instant', 'ce-matin'])
  })
})

describe('cycle', () => {
  it('passe à la photo suivante ou précédente', () => {
    expect(cycle(0, 1, 3)).toBe(1)
    expect(cycle(2, -1, 3)).toBe(1)
  })

  it('boucle aux extrémités de la pile', () => {
    expect(cycle(2, 1, 3)).toBe(0)
    expect(cycle(0, -1, 3)).toBe(2)
    expect(cycle(1, 1, 2)).toBe(0)
  })
})
