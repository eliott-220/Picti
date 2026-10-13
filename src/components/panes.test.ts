import { describe, expect, it } from 'vitest'
import { awayOf, neighborPane, paneMove, paneOffset, PANES } from './panes'

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

  it('en s’éloignant du viseur, l’écran suivant arrive par-dessus ; en revenant, l’écran actuel repart', () => {
    expect(paneMove('viseur', 'amis')).toEqual({ pane: 'amis', arriving: true, under: 'viseur', to: 'amis' })
    expect(paneMove('amis', 'carte')).toEqual({ pane: 'carte', arriving: true, under: 'amis', to: 'carte' })
    expect(paneMove('carte', 'amis')).toEqual({ pane: 'carte', arriving: false, under: 'amis', to: 'amis' })
    expect(paneMove('amis', 'viseur')).toEqual({ pane: 'amis', arriving: false, under: 'viseur', to: 'viseur' })
    expect(paneMove('profil', 'photos')).toEqual({ pane: 'profil', arriving: false, under: 'photos', to: 'photos' })
    // Bouton de la barre : la carte depuis le viseur arrive directement ; le bouton rouge la renvoie.
    expect(paneMove('viseur', 'carte')).toEqual({ pane: 'carte', arriving: true, under: 'viseur', to: 'carte' })
    expect(paneMove('carte', 'viseur')).toEqual({ pane: 'carte', arriving: false, under: 'viseur', to: 'viseur' })
    // D'un côté à l'autre : le nouvel écran arrive par-dessus.
    expect(paneMove('amis', 'profil')).toEqual({ pane: 'profil', arriving: true, under: 'amis', to: 'profil' })
    expect(paneMove('photos', 'carte')).toEqual({ pane: 'carte', arriving: true, under: 'photos', to: 'carte' })
    expect(paneMove('amis', 'amis')).toBeNull()
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
