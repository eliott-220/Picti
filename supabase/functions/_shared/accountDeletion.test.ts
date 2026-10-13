import { describe, expect, it } from 'vitest'
import { deleteAccount, ownsPath, REMOVE_BATCH, type DeletionBackend } from './accountDeletion'

const ME = '11111111-1111-4111-8111-111111111111'

function backend(overrides: Partial<DeletionBackend> = {}) {
  const calls: string[] = []
  const queued: string[] = []
  const cleared: string[] = []
  const b: DeletionBackend = {
    userOf: async (jwt) => (jwt === 'ok' ? ME : null),
    photoPaths: async () => [`${ME}/a.jpg`, `${ME}/a_vignette.jpg`],
    storageFiles: async () => [`${ME}/a.jpg`, `${ME}/orpheline.jpg`, 'autre/b.jpg'],
    deleteUser: async (id) => {
      calls.push(`deleteUser ${id}`)
    },
    removeFiles: async (paths) => {
      calls.push(`remove ${paths.length}`)
      return []
    },
    queueCleanup: async (paths) => {
      queued.push(...paths)
    },
    pendingCleanup: async () => [],
    clearCleanup: async (paths) => {
      cleared.push(...paths)
    },
    log: () => {},
    ...overrides,
  }
  return { b, calls, queued, cleared }
}

describe('supprimer un compte (Edge Function delete-account, 0.24.0)', () => {
  it('sans jeton valide : refusé, rien d’effacé', async () => {
    const { b, calls } = backend()
    expect((await deleteAccount(b, null)).status).toBe(401)
    expect((await deleteAccount(b, 'faux')).status).toBe(401)
    expect(calls).toEqual([])
  })

  it('efface le compte (base, une transaction), puis ses fichiers — seulement ceux de son dossier', async () => {
    const removed: string[] = []
    const { b, calls } = backend({
      removeFiles: async (paths) => {
        removed.push(...paths)
        return []
      },
    })
    const r = await deleteAccount(b, 'ok')
    expect(r).toEqual({ status: 200, body: { deleted: true, files: 3, pending: 0 } })
    expect(calls[0]).toBe(`deleteUser ${ME}`)
    expect(removed.sort()).toEqual([`${ME}/a.jpg`, `${ME}/a_vignette.jpg`, `${ME}/orpheline.jpg`])
  })

  it('tout ou rien : liste des fichiers impossible, ou base en échec → rien n’est effacé', async () => {
    const a = backend({
      storageFiles: async () => {
        throw new Error('stockage indisponible')
      },
    })
    expect((await deleteAccount(a.b, 'ok')).body.deleted).toBe(false)
    expect(a.calls).toEqual([])
    const removed: string[] = []
    const c = backend({
      deleteUser: async () => {
        throw new Error('base indisponible')
      },
      removeFiles: async (p) => {
        removed.push(...p)
        return []
      },
    })
    const r = await deleteAccount(c.b, 'ok')
    expect(r.status).toBe(500)
    expect(removed).toEqual([])
  })

  it('fichiers qui résistent : notés et réessayés à l’appel suivant ; le compte, lui, est bien supprimé', async () => {
    const { b, queued } = backend({ removeFiles: async (paths) => paths.filter((p) => p.endsWith('orpheline.jpg')) })
    const r = await deleteAccount(b, 'ok')
    expect(r.body).toEqual({ deleted: true, files: 2, pending: 1 })
    expect(queued).toEqual([`${ME}/orpheline.jpg`])
    const later = backend({ pendingCleanup: async () => [`${ME}/orpheline.jpg`] })
    await deleteAccount(later.b, 'ok')
    expect(later.cleared).toEqual([`${ME}/orpheline.jpg`])
  })

  it('par lots de 100 fichiers', async () => {
    const many = Array.from({ length: 250 }, (_, i) => `${ME}/${i}.jpg`)
    const { b, calls } = backend({ photoPaths: async () => many, storageFiles: async () => [] })
    await deleteAccount(b, 'ok')
    expect(calls.filter((c) => c.startsWith('remove'))).toEqual([`remove ${REMOVE_BATCH}`, `remove ${REMOVE_BATCH}`, 'remove 50'])
  })

  it('garde-fou : jamais un fichier hors de son dossier', () => {
    expect(ownsPath(ME, `${ME}/a.jpg`)).toBe(true)
    expect(ownsPath(ME, 'autre/a.jpg')).toBe(false)
    expect(ownsPath(ME, `${ME}/../autre/a.jpg`)).toBe(false)
  })
})
