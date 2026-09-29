import { describe, expect, it } from 'vitest'
import { formatDate, formatDateTime, photoDate, photoTitleAndDate, type GeoPhoto } from './types'

const ts = new Date(2026, 8, 28, 17, 5).getTime()
const photo = (title: string) => ({ title, takenAt: ts, addedAt: ts + 60_000 }) as GeoPhoto

describe('dates des photos', () => {
  it('ajoute l’heure à la date', () => {
    expect(formatDateTime(ts)).toBe('28 septembre 2026 à 17:05')
    expect(formatDateTime(ts, { short: true })).toBe('28 sept. 2026 · 17:05')
  })

  it('ne répète pas la date quand elle sert de titre', () => {
    const p = photo(formatDate(ts))
    expect(photoDate(p)).toBe('à 17:05')
    expect(photoTitleAndDate(p)).toBe('28 septembre 2026 à 17:05')
  })

  it('garde le titre choisi, suivi de la date et de l’heure', () => {
    const p = photo('Port de La Rochelle')
    expect(photoDate(p)).toBe('28 septembre 2026 à 17:05')
    expect(photoTitleAndDate(p)).toBe('Port de La Rochelle · 28 septembre 2026 à 17:05')
  })
})
