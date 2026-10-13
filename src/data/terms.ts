// Conditions d'utilisation (0.24.0) : un compte qui ne les a pas encore acceptées (dans cette version) voit
// une fois la page d'accord, à accepter pour continuer. Tant que la base n'a pas la migration du socle
// (colonnes absentes), personne n'est bloqué : l'app reste utilisable pendant les essais.

import { TERMS_VERSION } from '../config'
import { notDeployed } from './moderation'
import { supabase } from './supabase'

export type TermsState = 'accepted' | 'required' | 'unknown'

/** Décision d'après la ligne du profil (ou l'erreur de la base). */
export function termsState(
  row: { terms_accepted_at?: string | null; terms_version?: string | null } | null,
  error: { code?: string } | null,
): TermsState {
  // Colonne inconnue (42703) : la base n'a pas encore la migration ; autre erreur (réseau) : on ne bloque pas.
  if (error) return error.code === '42703' ? 'accepted' : 'unknown'
  if (!row) return 'unknown'
  return row.terms_accepted_at && row.terms_version === TERMS_VERSION ? 'accepted' : 'required'
}

export async function loadTermsState(userId: string): Promise<TermsState> {
  const { data, error } = await supabase.from('profiles').select('terms_accepted_at, terms_version').eq('id', userId).maybeSingle()
  return termsState(data as { terms_accepted_at?: string | null; terms_version?: string | null } | null, error)
}

/** Accord daté par le serveur (`accept_terms`). Base sans la fonction : accepté pour cette ouverture. */
export async function acceptTerms(): Promise<void> {
  const { error } = await supabase.rpc('accept_terms', { p_version: TERMS_VERSION })
  if (error && !notDeployed(error)) throw new Error('L’accord n’a pas pu être enregistré. Réessaie dans un instant.')
}
