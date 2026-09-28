import { describe, expect, it } from 'vitest'
import { fromENU } from './geodesy'
import { groupBySpot } from './spots'

const origin = { lat: 46.1558, lon: -1.1522 }
const at = (east: number, north: number) => fromENU(origin, [east, north, 0])

const photos = [
  { id: 'ancienne', pos: at(0, 0), date: 2018 },
  { id: 'recente', pos: at(3, 2), date: 2024 },
  { id: 'moyenne', pos: at(-4, 1), date: 2021 },
  { id: 'ailleurs', pos: at(80, 0), date: 2023 },
]

describe('groupBySpot', () => {
  const spots = groupBySpot(
    photos,
    (p) => p.pos,
    (p) => p.date,
  )

  it('regroupe les prises de vue au même endroit', () => {
    expect(spots).toHaveLength(2)
  })

  it('met la plus récente devant, puis les plus anciennes', () => {
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
      (p) => p.pos,
      (p) => p.date,
    )
    expect(far).toHaveLength(2)
  })
})
