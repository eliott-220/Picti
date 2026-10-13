import { describe, expect, it } from 'vitest'
import { awayOf, neighborPane, paneMove, paneOffset, PANES, pushOffsets } from './panes'

describe('les cinq écrans de la barre, dans l’ordre de la barre (0.23.1)', () => {
  it('Carte · Amis · Viseur · Mes photos · Profil', () => {
    expect(PANES).toEqual(['carte', 'amis', 'viseur', 'photos', 'profil'])
  })

  it('glisser mène à l’écran voisin : vers la gauche celui de droite, vers la droite celui de gauche', () => {
    expect(neighborPane('viseur', 'right')).toBe('amis')
    expect(neighborPane('amis', 'right')).toBe('carte')
    expect(neighborPane('carte', 'right')).toBeNull()
    expect(neighborPane('carte', 'left')).toBe('amis')
    expect(neighborPane('viseur', 'left')).toBe('photos')
    expect(neighborPane('photos', 'left')).toBe('profil')
    expect(neighborPane('profil', 'left')).toBeNull()
    expect(neighborPane('profil', 'right')).toBe('photos')
  })

  it('depuis le viseur, l’écran arrive par-dessus ; vers le viseur, l’écran actuel repart (inchangé)', () => {
    expect(paneMove('viseur', 'amis')).toEqual({ pane: 'amis', arriving: true, under: 'viseur', to: 'amis', push: false })
    expect(paneMove('amis', 'viseur')).toEqual({ pane: 'amis', arriving: false, under: 'viseur', to: 'viseur', push: false })
    // Bouton de la barre : la carte depuis le viseur arrive directement ; le bouton rouge la renvoie.
    expect(paneMove('viseur', 'carte')).toEqual({ pane: 'carte', arriving: true, under: 'viseur', to: 'carte', push: false })
    expect(paneMove('carte', 'viseur')).toEqual({ pane: 'carte', arriving: false, under: 'viseur', to: 'viseur', push: false })
    expect(paneMove('amis', 'amis')).toBeNull()
  })

  it('entre deux autres écrans, le nouveau pousse l’ancien (0.23.3)', () => {
    expect(paneMove('amis', 'carte')).toEqual({ pane: 'carte', arriving: true, under: 'amis', to: 'carte', push: true })
    expect(paneMove('carte', 'amis')).toEqual({ pane: 'amis', arriving: true, under: 'carte', to: 'amis', push: true })
    expect(paneMove('profil', 'photos')).toEqual({ pane: 'photos', arriving: true, under: 'profil', to: 'photos', push: true })
    expect(paneMove('amis', 'profil')).toEqual({ pane: 'profil', arriving: true, under: 'amis', to: 'profil', push: true })
    expect(paneMove('photos', 'carte')).toEqual({ pane: 'carte', arriving: true, under: 'photos', to: 'carte', push: true })
  })

  it('poussée : vers la droite de la barre, le nouvel écran arrive de droite et l’ancien part à gauche, collés', () => {
    expect(pushOffsets('carte', 'profil', 0)).toEqual({ from: 0, to: 100 })
    expect(pushOffsets('carte', 'profil', 0.25)).toEqual({ from: -25, to: 75 })
    expect(pushOffsets('carte', 'profil', 1)).toEqual({ from: -100, to: 0 })
    // Vers la gauche : l'inverse.
    expect(pushOffsets('profil', 'photos', 0.4)).toEqual({ from: 40, to: -60 })
    expect(pushOffsets('amis', 'carte', 2)).toEqual({ from: 100, to: 0 })
    // Toujours collés l'un à l'autre.
    for (const s of [0, 0.1, 0.5, 0.9, 1]) {
      const o = pushOffsets('photos', 'amis', s)
      expect(Math.abs(o.to - o.from)).toBe(100)
    }
  })

  it('chaque écran glisse depuis son côté', () => {
    expect(paneOffset('carte', 0)).toBe(-100)
    expect(paneOffset('amis', 0.25)).toBe(-75)
    expect(paneOffset('photos', 0)).toBe(100)
    expect(paneOffset('profil', 1)).toBe(0)
    expect(paneOffset('profil', 2)).toBe(0)
  })

  it('le bouton rouge rétrécit avec l’écran qui couvre le viseur, reste réduit entre deux autres', () => {
    const toAmis = paneMove('viseur', 'amis')!
    expect(awayOf(toAmis, 0)).toBe(0)
    expect(awayOf(toAmis, 0.4)).toBe(0.4)
    const back = paneMove('photos', 'viseur')!
    expect(awayOf(back, 1)).toBe(1)
    expect(awayOf(back, 0.3)).toBe(0.3)
    expect(awayOf(paneMove('amis', 'carte')!, 0.5)).toBe(1)
  })
})
