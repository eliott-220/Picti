import { describe, expect, it } from 'vitest'
import { fromENU } from './geodesy'
import { capVisibility, chooseParent, sameView, type ParentCandidate, type ViewPoint } from './views'

const origin = { lat: 46.1558, lon: -1.1522 }
const view = (east: number, heading: number, pitch = 0, accuracy: number | null = 3): ViewPoint => ({
  position: fromENU(origin, [east, 0, 0]),
  accuracy,
  heading,
  pitch,
})

describe('sameView', () => {
  it('même lieu, même direction : même vue', () => {
    expect(sameView(view(0, 250), view(2, 265, 10))).toBe(true)
  })

  it('cap à plus de 20° : autre vue du même lieu', () => {
    expect(sameView(view(0, 250), view(2, 275))).toBe(false)
  })

  it('inclinaison à plus de 15° : autre vue', () => {
    expect(sameView(view(0, 250, 0), view(2, 250, 20))).toBe(false)
  })

  it('passe le nord sans se tromper (355° et 10°)', () => {
    expect(sameView(view(0, 355), view(1, 10))).toBe(true)
  })

  it('lieux différents : jamais la même vue', () => {
    expect(sameView(view(0, 250), view(7, 250))).toBe(false)
  })

  it('selfie : orientation enregistrée de l’objectif avant, comparée telle quelle', () => {
    // Photo classique vers l'ouest, selfie au même endroit (objectif avant tourné vers l'est).
    expect(sameView(view(0, 270), view(1, 90))).toBe(false)
    expect(sameView(view(0, 90), view(1, 90))).toBe(true)
  })
})

describe('capVisibility', () => {
  it('une version n’est jamais plus visible que sa parente', () => {
    expect(capVisibility('public', 'amis')).toBe('amis')
    expect(capVisibility('amis', 'public')).toBe('amis')
    expect(capVisibility('prive', 'amis')).toBe('prive')
  })
})

describe('chooseParent', () => {
  const candidates: ParentCandidate[] = [
    { id: 'ancienne', view: view(0, 250), visibility: 'public', time: 1 },
    { id: 'moyenne', view: view(1, 255), visibility: 'public', time: 2 },
    { id: 'recente', view: view(1, 245), visibility: 'amis', time: 3 },
    { id: 'autre-direction', view: view(0, 90), visibility: 'public', time: 0 },
  ]
  const photo = { view: view(0.5, 250), visibility: 'amis' as const }

  it('sans capture : la plus ancienne de la vue', () => {
    expect(chooseParent(photo, candidates, new Map())).toBe('ancienne')
  })

  it('la photo de la vue que j’ai capturée le plus récemment', () => {
    expect(
      chooseParent(
        photo,
        candidates,
        new Map([
          ['moyenne', 100],
          ['recente', 200],
        ]),
      ),
    ).toBe('recente')
  })

  it('écarte les parentes privées ou moins visibles que la nouvelle photo', () => {
    const publique = { view: view(0.5, 250), visibility: 'public' as const }
    expect(chooseParent(publique, candidates, new Map([['recente', 200]]))).toBe('ancienne')
    expect(chooseParent(photo, [{ ...candidates[0], visibility: 'prive' }], new Map())).toBeNull()
  })

  it('aucune photo dans cette vue : pas de parente', () => {
    expect(chooseParent({ view: view(0, 180), visibility: 'amis' }, candidates, new Map())).toBeNull()
  })
})
