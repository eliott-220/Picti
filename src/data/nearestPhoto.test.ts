import { describe, expect, it, vi } from 'vitest'

vi.mock('./supabase', () => ({ supabase: {} }))

const { directionText, nearestFromRow, nearestText } = await import('./nearestPhoto')

describe('photo la plus proche : distance et direction', () => {
  it('« 240 m au nord-est », « 1,2 km au sud »', () => {
    expect(nearestText({ distance: 240, bearing: 45 })).toBe('240 m au nord-est')
    expect(nearestText({ distance: 1230, bearing: 180 })).toBe('1,2 km au sud')
    expect(nearestText({ distance: 4990, bearing: 270 })).toBe('5 km à l’ouest')
  })

  it('huit directions, élision devant est / ouest', () => {
    expect([0, 45, 90, 135, 180, 225, 270, 315].map(directionText)).toEqual([
      'au nord',
      'au nord-est',
      'à l’est',
      'au sud-est',
      'au sud',
      'au sud-ouest',
      'à l’ouest',
      'au nord-ouest',
    ])
  })

  it('arrondit au plus proche, passe le nord', () => {
    expect(directionText(359)).toBe('au nord')
    expect(directionText(-20)).toBe('au nord')
    expect(directionText(68)).toBe('à l’est')
    expect(directionText(360 + 45)).toBe('au nord-est')
  })
})

describe('ligne de la fonction SQL', () => {
  it('sans compte : distance et direction seulement', () => {
    expect(nearestFromRow({ distance_m: 240, bearing_deg: 45, photo_id: null, thumb_path: null })).toEqual({
      distance: 240,
      bearing: 45,
      id: null,
      thumbPath: null,
    })
  })

  it('connecté : la photo et sa vignette', () => {
    expect(nearestFromRow({ distance_m: 30, bearing_deg: 0, photo_id: 'p1', thumb_path: 'u/p1-t.jpg' })).toMatchObject({
      id: 'p1',
      thumbPath: 'u/p1-t.jpg',
    })
  })

  it('aucune photo à moins de 5 km : null', () => {
    expect(nearestFromRow(undefined)).toBeNull()
    expect(nearestFromRow(null)).toBeNull()
    expect(nearestFromRow({})).toBeNull()
  })
})
