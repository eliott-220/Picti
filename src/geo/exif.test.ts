import { describe, expect, it } from 'vitest'
import { exifCompleteness, geoframeFromExif } from './exif'

describe('geoframeFromExif', () => {
  it('exploite une photo de smartphone complète', () => {
    const g = geoframeFromExif({
      latitude: 46.1557,
      longitude: -1.1533,
      GPSAltitude: 4.2,
      GPSAltitudeRef: 0,
      GPSImgDirection: 251.3,
      GPSImgDirectionRef: 'T',
      FocalLengthIn35mmFormat: 26,
      DateTimeOriginal: new Date(2022, 6, 12, 18, 4, 33),
    })
    expect(g.position).toEqual({ lat: 46.1557, lon: -1.1533, alt: 4.2 })
    expect(g.heading).toBeCloseTo(251.3)
    expect(g.headingRef).toBe('T')
    expect(g.focal35).toBe(26)
    expect(g.takenAt).toBe(new Date(2022, 6, 12, 18, 4, 33).getTime())
    expect(exifCompleteness(g)).toBe('complet')
  })

  it('signale une direction manquante', () => {
    const g = geoframeFromExif({ latitude: 46.1, longitude: -1.1 })
    expect(exifCompleteness(g)).toBe('position')
  })

  it('reconnaît une photo sans GPS', () => {
    expect(exifCompleteness(geoframeFromExif({ FocalLength: 50 }))).toBe('aucun')
    expect(exifCompleteness(geoframeFromExif(null))).toBe('aucun')
  })

  it('ignore les coordonnées nulles (0, 0) des appareils sans fix', () => {
    expect(geoframeFromExif({ latitude: 0, longitude: 0 }).position).toBeNull()
  })

  it('gère une altitude sous le niveau de la mer', () => {
    const g = geoframeFromExif({ latitude: 31.5, longitude: 35.5, GPSAltitude: 420, GPSAltitudeRef: 1 })
    expect(g.position?.alt).toBe(-420)
  })

  it('lit une date EXIF au format brut', () => {
    const g = geoframeFromExif({ DateTimeOriginal: '2018:11:03 14:22:05' })
    expect(g.takenAt).toBe(new Date(2018, 10, 3, 14, 22, 5).getTime())
  })

  it('normalise le cap et le référentiel', () => {
    const g = geoframeFromExif({ latitude: 1, longitude: 1, GPSImgDirection: 360, GPSImgDirectionRef: 'Magnetic North' })
    expect(g.heading).toBe(0)
    expect(g.headingRef).toBe('M')
  })
})
