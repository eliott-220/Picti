import { describe, expect, it, vi } from 'vitest'

vi.mock('./supabase', () => ({ supabase: {} }))
const { termsState } = await import('./terms')

describe('conditions d’utilisation (0.24.0)', () => {
  it('acceptées dans cette version : on passe ; jamais, ou une ancienne version : page d’accord', () => {
    expect(termsState({ terms_accepted_at: '2026-10-13T12:00:00Z', terms_version: '2026-10-13' }, null)).toBe('accepted')
    expect(termsState({ terms_accepted_at: null, terms_version: null }, null)).toBe('required')
    expect(termsState({ terms_accepted_at: '2026-01-01T12:00:00Z', terms_version: '2026-01-01' }, null)).toBe('required')
  })

  it('base sans la migration (colonne inconnue) ou réseau en panne : personne n’est bloqué', () => {
    expect(termsState(null, { code: '42703' })).toBe('accepted')
    expect(termsState(null, { code: 'fetch' })).toBe('unknown')
    expect(termsState(null, null)).toBe('unknown')
  })
})
