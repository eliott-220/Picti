import { afterEach, describe, expect, it, vi } from 'vitest'

// Fausse base : chaque appel renvoie la réponse préparée par le test.
const db = vi.hoisted(() => ({
  insertError: null as { code?: string } | null,
  inserted: [] as { table: string; row: Record<string, unknown> }[],
  deleted: [] as { table: string; column: string; value: string }[],
  invoked: [] as { name: string; body?: unknown }[],
  invokeResult: { data: { deleted: true } as unknown, error: null as unknown },
}))
vi.mock('./supabase', () => ({
  supabase: {
    from: (table: string) => ({
      insert: (row: Record<string, unknown>) => {
        db.inserted.push({ table, row })
        const result = { data: db.insertError ? null : { id: 'r1' }, error: db.insertError }
        return Object.assign(Promise.resolve(result), { select: () => ({ maybeSingle: () => Promise.resolve(result) }) })
      },
      delete: () => ({
        eq: (column: string, value: string) => {
          db.deleted.push({ table, column, value })
          return Promise.resolve({ error: null })
        },
      }),
    }),
    rpc: () => Promise.resolve({ data: [{ id: 'u2', name: '', blocked_at: '2026-10-13T10:00:00Z' }], error: null }),
    functions: {
      invoke: (name: string, options?: { body?: unknown }) => {
        db.invoked.push({ name, body: options?.body })
        return Promise.resolve(name === 'delete-account' ? db.invokeResult : { data: null, error: null })
      },
    },
  },
}))

const m = await import('./moderation')
const { hiddenContent, isHiddenPhoto, resetHiddenContent } = await import('./hiddenContent')

afterEach(() => {
  db.insertError = null
  db.inserted.length = 0
  db.deleted.length = 0
  db.invoked.length = 0
  db.invokeResult = { data: { deleted: true }, error: null }
  resetHiddenContent()
})

describe('signaler (0.24.0)', () => {
  it('six motifs, dont « Vie privée » ; texte facultatif de 300 caractères au plus', () => {
    expect(m.REPORT_REASONS.map((r) => r.id)).toEqual(['sexual', 'violence', 'harassment', 'privacy', 'spam', 'other'])
    expect(m.reportDetails('  plaque visible  ')).toBe('plaque visible')
    expect([...m.reportDetails('é'.repeat(400))]).toHaveLength(300)
  })

  it('une photo signalée disparaît aussitôt pour moi, et Eliott est prévenu', async () => {
    await m.reportPhoto('p1', 'privacy', 'visage')
    expect(db.inserted).toEqual([{ table: 'reports', row: { photo_id: 'p1', reason: 'privacy', details: 'visage' } }])
    expect(isHiddenPhoto({ id: 'p1', owner: 'x' })).toBe(true)
    expect(db.invoked).toEqual([{ name: 'report-alert', body: { report_id: 'r1' } }])
  })

  it('déjà signalée : pas une erreur ; base sans la migration : message clair, rien de masqué', async () => {
    db.insertError = { code: '23505' }
    await expect(m.reportPhoto('p1', 'spam')).resolves.toBeUndefined()
    resetHiddenContent()
    db.insertError = { code: '42P01' }
    await expect(m.reportPhoto('p2', 'spam')).rejects.toThrow(m.NOT_YET)
    expect(isHiddenPhoto({ id: 'p2', owner: 'x' })).toBe(false)
    db.insertError = { code: '42501' }
    await expect(m.reportUser('u1', 'harassment')).rejects.toThrow(/pas pu être envoyé/)
  })
})

describe('bloquer (0.24.0)', () => {
  it('bloquer retire aussitôt ses photos ; débloquer les laisse revenir', async () => {
    await m.blockUser('u2')
    expect(db.inserted).toEqual([{ table: 'blocks', row: { blocked: 'u2' } }])
    expect(isHiddenPhoto({ id: 'any', owner: 'u2' })).toBe(true)
    await m.unblockUser('u2')
    expect(db.deleted).toEqual([{ table: 'blocks', column: 'blocked', value: 'u2' }])
    expect(hiddenContent().owners.has('u2')).toBe(false)
  })

  it('liste des bloqués : nom par défaut pour un compte sans nom', async () => {
    expect(await m.listBlockedUsers()).toEqual([{ id: 'u2', name: 'Compte sans nom', blockedAt: Date.parse('2026-10-13T10:00:00Z') }])
  })
})

describe('supprimer mon compte (0.24.0)', () => {
  it('il faut taper SUPPRIMER', () => {
    expect(m.deleteConfirmed('SUPPRIMER')).toBe(true)
    expect(m.deleteConfirmed('  supprimer ')).toBe(true)
    expect(m.deleteConfirmed('SUPPRIME')).toBe(false)
    expect(m.deleteConfirmed('')).toBe(false)
  })

  it('appelle la fonction du serveur ; échec : rien n’est effacé, message clair', async () => {
    await expect(m.deleteMyAccount()).resolves.toBeUndefined()
    expect(db.invoked[0].name).toBe('delete-account')
    db.invokeResult = { data: null, error: { context: { status: 500 } } }
    await expect(m.deleteMyAccount()).rejects.toThrow(/rien n’a été effacé/)
    db.invokeResult = { data: null, error: { context: { status: 404 } } }
    await expect(m.deleteMyAccount()).rejects.toThrow(m.NOT_YET)
  })
})
