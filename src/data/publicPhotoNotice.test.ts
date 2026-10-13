import { afterEach, describe, expect, it } from 'vitest'
import { answerPublicNotice, confirmPublicPhoto, publicNoticePending } from './publicPhotoNotice'

const store = new Map<string, string>()
globalThis.localStorage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
} as Storage

afterEach(() => store.clear())

describe('première photo publique (0.24.0)', () => {
  it('une feuille la première fois ; « Compris » : publique, et plus jamais de feuille', async () => {
    const p = confirmPublicPhoto('u1')
    expect(publicNoticePending()).toBe(true)
    answerPublicNotice('public')
    await expect(p).resolves.toBe('public')
    expect(publicNoticePending()).toBe(false)
    await expect(confirmPublicPhoto('u1')).resolves.toBe('public')
    expect(publicNoticePending()).toBe(false)
  })

  it('« Passer en Amis » (ou feuille fermée) : la photo part en Amis, sans être perdue ; redemandé la fois suivante', async () => {
    const p = confirmPublicPhoto('u2')
    answerPublicNotice('amis')
    await expect(p).resolves.toBe('amis')
    confirmPublicPhoto('u2')
    expect(publicNoticePending()).toBe(true)
    answerPublicNotice('public')
  })

  it('deux photos coup sur coup : une seule feuille, la même réponse', async () => {
    const a = confirmPublicPhoto('u3')
    const b = confirmPublicPhoto('u3')
    answerPublicNotice('public')
    await expect(Promise.all([a, b])).resolves.toEqual(['public', 'public'])
  })
})
