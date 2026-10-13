import { describe, expect, it } from 'vitest'
import { MAX_SCREENS, nextStack, slotsOf, slotTransition } from './screenStack'

describe('pile des écrans : l’écran quitté reste monté, il réapparaît tel quel au retour (0.23.1)', () => {
  it('avancer empile, revenir dépile, remplacer remplace', () => {
    let s = nextStack([], 0, '#/')
    s = nextStack(s, 1, '#/photo/a')
    s = nextStack(s, 2, '#/personne/u')
    expect(s.map((e) => e.hash)).toEqual(['#/', '#/photo/a', '#/personne/u'])
    // Retour : le niveau 1 retrouvé ; la fiche y était déjà, elle est gardée telle quelle (même clé).
    const back = nextStack(s, 1, '#/photo/a')
    expect(back.map((e) => e.hash)).toEqual(['#/', '#/photo/a'])
    expect(slotsOf(back).at(-1)?.key).toBe(slotsOf(s)[1].key)
    // Remplacement au même niveau (pile de la fiche glissée) : un autre écran.
    expect(nextStack(back, 1, '#/photo/b').map((e) => e.hash)).toEqual(['#/', '#/photo/b'])
  })

  it('le viseur, la carte, les amis, mes photos et le profil sont un seul écran (même clé)', () => {
    const a = slotsOf(nextStack([], 0, ''))
    const b = slotsOf(nextStack(nextStack([], 0, ''), 1, '#/carte'))
    const c = slotsOf([
      { depth: 0, hash: '' },
      { depth: 1, hash: '#/profil' },
    ])
    expect(a).toHaveLength(1)
    expect(b).toHaveLength(1)
    expect(b[0]).toEqual({ key: a[0].key, route: { name: 'carte' } })
    expect(c[0]).toEqual({ key: a[0].key, route: { name: 'profil' } })
    expect(slotsOf([{ depth: 0, hash: '#/amis' }])[0].route).toEqual({ name: 'amis' })
    expect(slotsOf([{ depth: 0, hash: '#/photos' }])[0].route).toEqual({ name: 'photos' })
  })

  it('profil › Paramètres › retour : le profil est toujours là, sous les Paramètres', () => {
    const s = nextStack([{ depth: 0, hash: '' }, { depth: 1, hash: '#/profil' }], 2, '#/parametres')
    const slots = slotsOf(s)
    expect(slots.map((x) => x.route.name)).toEqual(['profil', 'parametres'])
    const back = slotsOf(nextStack(s, 1, '#/profil'))
    expect(back).toEqual([slots[0]])
  })

  it('une feuille (entrée d’historique sans changement d’adresse) ne crée pas de second viseur', () => {
    // Fiche après capture (feuille, niveau 1), puis une fiche ouverte depuis elle (niveau 2), puis retour.
    let s = nextStack([], 0, '#/')
    s = nextStack(s, 2, '#/photo/a')
    s = nextStack(s, 1, '#/')
    expect(slotsOf(s)).toHaveLength(1)
  })

  it('au plus quelques écrans gardés montés', () => {
    let s = nextStack([], 0, '#/')
    for (let d = 1; d <= 8; d++) s = nextStack(s, d, `#/photo/${d}`)
    expect(s).toHaveLength(MAX_SCREENS)
    expect(s[0].hash).toBe(`#/photo/${8 - MAX_SCREENS + 1}`)
  })
})

describe('passage d’un écran à l’autre : le nouveau pousse l’ancien, sauf vers ou depuis l’accueil (0.23.3)', () => {
  const profil = [{ depth: 0, hash: '' }, { depth: 1, hash: '#/profil' }]
  const parametres = nextStack(profil, 2, '#/parametres')

  it('Mon profil › Paramètres : les Paramètres arrivent de droite et poussent le profil, gardé dessous', () => {
    const t = slotTransition(slotsOf(profil), slotsOf(parametres), 'push')
    expect(t).toEqual({ motion: 'forward', incoming: '2:#/parametres', outgoing: slotsOf(profil)[0], ghost: false })
  })

  it('retour par la flèche de l’app : le profil revient de gauche, les Paramètres repartent à droite puis sont démontés', () => {
    const back = nextStack(parametres, 1, '#/profil')
    const t = slotTransition(slotsOf(parametres), slotsOf(back), 'back')
    expect(t).toMatchObject({ motion: 'back', incoming: slotsOf(profil)[0].key, ghost: true })
    expect(t?.outgoing.route).toEqual({ name: 'parametres' })
  })

  it('retour du système (geste d’iOS, bouton du navigateur) : rien à rejouer', () => {
    const back = nextStack(parametres, 1, '#/profil')
    expect(slotTransition(slotsOf(parametres), slotsOf(back), 'pop')).toBeNull()
  })

  it('remplacement entre deux pages : le nouvel écran pousse l’ancien, qui quitte la pile', () => {
    const fiche = nextStack(profil, 2, '#/photo/a')
    const chasse = nextStack(fiche, 2, '#/chasse/a')
    expect(slotTransition(slotsOf(fiche), slotsOf(chasse), 'replace')).toMatchObject({ motion: 'forward', ghost: true })
  })

  it('vers l’accueil ou depuis lui : comportement d’avant (la page passe par-dessus le viseur)', () => {
    const viseur = [{ depth: 0, hash: '' }]
    const fromHome = nextStack(viseur, 1, '#/parametres')
    expect(slotTransition(slotsOf(viseur), slotsOf(fromHome), 'push')).toBeNull()
    expect(slotTransition(slotsOf(fromHome), slotsOf(nextStack(fromHome, 0, '')), 'back')).toBeNull()
  })

  it('entre deux onglets de la barre : même écran, ils glissent entre eux dans Home', () => {
    const carte = nextStack([{ depth: 0, hash: '' }], 1, '#/carte')
    expect(slotTransition(slotsOf(carte), slotsOf(nextStack(carte, 1, '#/profil')), 'replace')).toBeNull()
  })
})
