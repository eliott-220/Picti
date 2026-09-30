import { describe, expect, it } from 'vitest'
import { photoToRow, rowToPhoto, storagePaths, type PhotoRow } from './rows'
import type { GeoPhoto } from './types'

const photo: GeoPhoto = {
  id: '6a1f0c1e-0000-4000-8000-000000000001',
  owner: 'u1',
  ownerName: 'Eliott',
  visibility: 'amis',
  imagePath: 'u1/6a1f.jpg',
  thumbPath: 'u1/6a1f_vignette.jpg',
  title: 'Vieux-Port',
  addedAt: Date.parse('2026-09-28T10:00:00Z'),
  takenAt: Date.parse('2022-07-12T16:04:33Z'),
  width: 3024,
  height: 4032,
  focal35: 26,
  depth: 6,
  mode: 'direct',
  geoframe: {
    position: { lat: 46.1558, lon: -1.1522, alt: 4 },
    accuracy: 5,
    heading: 251.5,
    pitch: 2,
    roll: -1,
    headingSource: 'boussole',
    pitchAssumed: false,
  },
  hintPosition: null,
  selfie: false,
}

const asRow = (p: GeoPhoto): PhotoRow => ({
  ...photoToRow(p),
  owner: p.owner,
  created_at: new Date(p.addedAt).toISOString(),
  owner_profile: { name: p.ownerName },
})

describe('conversion photo ⇄ ligne', () => {
  it('fait l’aller-retour d’une photo géocadrée', () => {
    expect(rowToPhoto(asRow(photo))).toEqual(photo)
  })

  it('fait l’aller-retour d’une photo à recaler', () => {
    const pending: GeoPhoto = {
      ...photo,
      mode: null,
      geoframe: null,
      takenAt: null,
      hintPosition: { lat: 46.16, lon: -1.15 },
    }
    expect(rowToPhoto(asRow(pending))).toEqual(pending)
    expect(photoToRow(pending).lat).toBeNull()
  })

  it('fait l’aller-retour d’un selfie', () => {
    const selfie: GeoPhoto = { ...photo, selfie: true, focal35: 23, depth: 0.6 }
    expect(rowToPhoto(asRow(selfie))).toEqual(selfie)
    expect(photoToRow(selfie).selfie).toBe(true)
  })

  it('ignore un mode sans orientation complète', () => {
    const row = { ...asRow(photo), heading: null }
    expect(rowToPhoto(row).geoframe).toBeNull()
    expect(rowToPhoto(row).mode).toBeNull()
  })
})

describe('storagePaths', () => {
  it('range les images dans le dossier de l’utilisateur', () => {
    expect(storagePaths('u1', 'p1', 'image/jpeg')).toEqual({
      imagePath: 'u1/p1.jpg',
      thumbPath: 'u1/p1_vignette.jpg',
    })
    expect(storagePaths('u1', 'p1', 'image/png').imagePath).toBe('u1/p1.png')
  })

  it('selfie enregistré à la distance par défaut : l’auteur était à bout de bras', () => {
    expect(rowToPhoto(asRow({ ...photo, selfie: true })).depth).toBe(0.6)
    expect(rowToPhoto(asRow({ ...photo, selfie: true, depth: 2 })).depth).toBe(2)
    expect(rowToPhoto(asRow(photo)).depth).toBe(6)
  })
})
