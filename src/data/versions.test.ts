import { describe, expect, it } from 'vitest'
import type { GeoPhoto } from './types'
import { hiddenVersionsText, otherVersionsText, remadeText, timelineOrder } from './versions'

const day = 86400e3
const t0 = new Date(2026, 0, 1).getTime()
const photo = (id: string, takenDay: number | null, extra: Partial<GeoPhoto> = {}) =>
  ({
    id,
    takenAt: takenDay == null ? null : t0 + takenDay * day,
    addedAt: t0 + 100 * day,
    versionOf: 'orig',
    ...extra,
  }) as GeoPhoto

describe('frise « Au fil du temps »', () => {
  const original = photo('orig', 50, { versionOf: null })

  it('l’originale d’abord, puis les reproductions par date de prise croissante', () => {
    const list = timelineOrder(original, [photo('c', 30), photo('a', 10), photo('b', 20)])
    expect(list.map((p) => p.id)).toEqual(['orig', 'a', 'b', 'c'])
  })

  it('même une reproduction prise avant l’originale reste après elle', () => {
    expect(timelineOrder(original, [photo('ancienne', 1)]).map((p) => p.id)).toEqual(['orig', 'ancienne'])
  })

  it('sans date de prise : la date d’ajout ; à égalité, la première ajoutée', () => {
    const list = timelineOrder(original, [
      photo('ajout-tard', null, { addedAt: t0 + 40 * day }),
      photo('meme-jour-2', 20, { addedAt: t0 + 31 * day }),
      photo('meme-jour-1', 20, { addedAt: t0 + 30 * day }),
    ])
    expect(list.map((p) => p.id)).toEqual(['orig', 'meme-jour-1', 'meme-jour-2', 'ajout-tard'])
  })

  it('seulement les reproductions directes, sans doublon de l’originale', () => {
    const list = timelineOrder(original, [photo('a', 10), photo('petite-fille', 12, { versionOf: 'a' }), original])
    expect(list.map((p) => p.id)).toEqual(['orig', 'a'])
  })

  it('aucune reproduction : l’originale seule', () => {
    expect(timelineOrder(original, [])).toEqual([original])
  })
})

describe('reproductions que je ne peux pas voir', () => {
  it('« et n autres que vous ne pouvez pas voir »', () => {
    expect(hiddenVersionsText(5, 3)).toBe('et 2 autres que vous ne pouvez pas voir')
    expect(hiddenVersionsText(4, 3)).toBe('et 1 autre que vous ne pouvez pas voir')
    expect(hiddenVersionsText(3, 3)).toBe('')
    // Compteur pas encore à jour (reproduction qu’on vient de voir arriver) : rien.
    expect(hiddenVersionsText(2, 3)).toBe('')
  })

  it('« refaite n fois » et lien vers les autres reproductions', () => {
    expect(remadeText(3)).toBe('refaite 3 fois')
    expect(otherVersionsText(4)).toBe('Voir les 3 autres reproductions')
    expect(otherVersionsText(2)).toBe('Voir l’autre reproduction')
    expect(otherVersionsText(1)).toBe('')
  })
})
