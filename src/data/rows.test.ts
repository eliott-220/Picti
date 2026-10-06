import { describe, expect, it } from 'vitest'
import { photoToRow, profileChangesToRow, rowToPhoto, rowToProfile, storagePaths, type PhotoRow } from './rows'
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
  likesCount: 0,
  versionOf: null,
  versionsCount: 0,
}

const asRow = (p: GeoPhoto): PhotoRow => ({
  ...photoToRow(p),
  owner: p.owner,
  created_at: new Date(p.addedAt).toISOString(),
  likes_count: p.likesCount,
  versions_count: p.versionsCount,
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

  it('lit les likes, la photo parente et le nombre de versions', () => {
    const version: GeoPhoto = { ...photo, likesCount: 7, versionOf: '6a1f0c1e-0000-4000-8000-0000000000ff', versionsCount: 2 }
    expect(rowToPhoto(asRow(version))).toEqual(version)
    // Lignes d'avant la 0.15.0 (colonnes absentes) : ni like ni parente.
    const { likes_count: _l, version_of: _v, versions_count: _n, ...old } = asRow(photo)
    expect(rowToPhoto(old as PhotoRow)).toMatchObject({ likesCount: 0, versionOf: null, versionsCount: 0 })
  })

  it('écrit la photo parente, jamais les compteurs (tenus par la base)', () => {
    const row = photoToRow({ ...photo, likesCount: 7, versionOf: 'parente', versionsCount: 2 })
    expect(row.version_of).toBe('parente')
    expect('likes_count' in row).toBe(false)
    expect('versions_count' in row).toBe(false)
  })

  it('ignore un mode sans orientation complète', () => {
    const row = { ...asRow(photo), heading: null }
    expect(rowToPhoto(row).geoframe).toBeNull()
    expect(rowToPhoto(row).mode).toBeNull()
  })
})

describe('profil ⇄ ligne', () => {
  const row = {
    id: 'u1',
    name: 'Eliott',
    city: 'La Rochelle',
    friend_code: 'A1B2C3',
    plan: 'free' as const,
    default_visibility: 'amis' as const,
  }

  it('lit la visibilité par défaut des nouvelles photos', () => {
    expect(rowToProfile(row)).toEqual({
      id: 'u1',
      name: 'Eliott',
      city: 'La Rochelle',
      friendCode: 'A1B2C3',
      plan: 'free',
      defaultVisibility: 'amis',
    })
    expect(rowToProfile({ ...row, default_visibility: 'prive' }).defaultVisibility).toBe('prive')
  })

  it('n’écrit que les colonnes modifiées, jamais le plan', () => {
    expect(profileChangesToRow({ defaultVisibility: 'public' })).toEqual({ default_visibility: 'public' })
    expect(profileChangesToRow({ name: 'Eliott', city: '' })).toEqual({ name: 'Eliott', city: '' })
    const all = profileChangesToRow({ name: 'E', city: 'Paris', defaultVisibility: 'prive', plan: 'premium' } as never)
    expect(all).toEqual({ name: 'E', city: 'Paris', default_visibility: 'prive' })
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
