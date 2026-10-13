// Socle avant testeurs (0.24.0, partie 2) : signaler une photo ou un utilisateur, bloquer, supprimer son
// compte. Les règles sont dans la base (migration `20261013150000_socle_testeurs.sql`) et dans l'Edge
// Function `delete-account` ; ici, seulement les appels et les messages.

import { hideOwner, hidePhoto, showOwner } from './hiddenContent'
import { supabase } from './supabase'

export type ReportReason = 'sexual' | 'violence' | 'harassment' | 'privacy' | 'spam' | 'other'

/** Motifs proposés, dans l'ordre de la feuille. */
export const REPORT_REASONS: readonly { id: ReportReason; label: string; hint?: string }[] = [
  { id: 'sexual', label: 'Nudité ou contenu sexuel' },
  { id: 'violence', label: 'Violence' },
  { id: 'harassment', label: 'Harcèlement' },
  { id: 'privacy', label: 'Vie privée', hint: 'personne reconnaissable, plaque, intérieur d’une maison' },
  { id: 'spam', label: 'Spam' },
  { id: 'other', label: 'Autre' },
]

/** Longueur maximale du texte facultatif (caractères). */
export const REPORT_DETAILS_MAX = 300

/** Texte facultatif nettoyé : espaces retirés aux bouts, 300 caractères au plus. */
export function reportDetails(text: string): string {
  return [...text.trim()].slice(0, REPORT_DETAILS_MAX).join('')
}

/** Erreur de la base telle que renvoyée par Supabase (PostgREST). */
interface DbError {
  code?: string
  message?: string
  status?: number
}

/**
 * La base n'a pas encore la migration du socle (table ou fonction inconnue) : la fonction n'est pas
 * encore en service. Vrai aussi pour une Edge Function pas encore déployée (404).
 */
export function notDeployed(e: DbError | null | undefined): boolean {
  if (!e) return false
  return e.code === '42P01' || e.code === 'PGRST205' || e.code === 'PGRST202' || e.code === '42883' || e.status === 404
}

/** Déjà signalé (une seule fois par personne et par cible) : ce n'est pas une erreur. */
export const alreadyDone = (e: DbError | null | undefined): boolean => e?.code === '23505'

export const NOT_YET = 'Pas encore disponible : cette fonction arrive avec la prochaine mise à jour du service.'

function check(e: DbError | null, failure: string) {
  if (!e || alreadyDone(e)) return
  throw new Error(notDeployed(e) ? NOT_YET : failure)
}

/** Prévient Eliott (e-mail, si l'Edge Function `report-alert` est en place) ; jamais bloquant. */
function alertModerator(reportId: string | undefined) {
  if (!reportId) return
  void supabase.functions.invoke('report-alert', { body: { report_id: reportId } }).catch(() => undefined)
}

/** Signale une photo : elle disparaît aussitôt pour moi (et pour tous après trois signalements). */
export async function reportPhoto(photoId: string, reason: ReportReason, details = ''): Promise<void> {
  const { data, error } = await supabase
    .from('reports')
    .insert({ photo_id: photoId, reason, details: reportDetails(details) })
    .select('id')
    .maybeSingle()
  check(error, 'Le signalement n’a pas pu être envoyé. Réessaie dans un instant.')
  hidePhoto(photoId)
  alertModerator((data as { id?: string } | null)?.id)
}

/** Signale un utilisateur. */
export async function reportUser(userId: string, reason: ReportReason, details = ''): Promise<void> {
  const { data, error } = await supabase
    .from('reports')
    .insert({ user_id: userId, reason, details: reportDetails(details) })
    .select('id')
    .maybeSingle()
  check(error, 'Le signalement n’a pas pu être envoyé. Réessaie dans un instant.')
  alertModerator((data as { id?: string } | null)?.id)
}

/** Bloque un utilisateur (dans les deux sens, par la base) ; ses photos disparaissent aussitôt. */
export async function blockUser(userId: string): Promise<void> {
  const { error } = await supabase.from('blocks').insert({ blocked: userId })
  check(error, 'Le blocage n’a pas pu être enregistré. Réessaie dans un instant.')
  hideOwner(userId)
}

/** Débloque (l'amitié n'est pas rétablie). */
export async function unblockUser(userId: string): Promise<void> {
  const { error } = await supabase.from('blocks').delete().eq('blocked', userId)
  check(error, 'Le déblocage n’a pas pu être enregistré. Réessaie dans un instant.')
  showOwner(userId)
}

export interface BlockedUser {
  id: string
  name: string
  blockedAt: number
}

/** Mes utilisateurs bloqués, les plus récents d'abord. */
export async function listBlockedUsers(): Promise<BlockedUser[]> {
  const { data, error } = await supabase.rpc('my_blocked_users')
  check(error, 'Impossible de charger les utilisateurs bloqués.')
  return ((data ?? []) as { id: string; name: string | null; blocked_at: string }[]).map((r) => ({
    id: r.id,
    name: r.name || 'Compte sans nom',
    blockedAt: Date.parse(r.blocked_at),
  }))
}

/** Mot à taper pour confirmer la suppression du compte. */
export const DELETE_WORD = 'SUPPRIMER'

/** La saisie confirme-t-elle la suppression (majuscules, espaces aux bouts ignorés) ? */
export function deleteConfirmed(typed: string): boolean {
  return typed.trim().toLocaleUpperCase('fr-FR') === DELETE_WORD
}

/**
 * Supprime mon compte (Edge Function `delete-account`, avec mon jeton) : tout ou rien côté base ; les
 * fichiers sont effacés ensuite (réessayés plus tard s'il le faut). Échec : rien n'est effacé, message clair.
 */
export async function deleteMyAccount(): Promise<void> {
  const { data, error } = await supabase.functions.invoke('delete-account', { method: 'POST' })
  if (error) {
    const status = (error as { context?: { status?: number } }).context?.status
    if (status === 404) throw new Error(NOT_YET)
    throw new Error('La suppression n’a pas pu se faire : rien n’a été effacé. Réessaie dans un instant.')
  }
  if (!(data as { deleted?: boolean } | null)?.deleted) {
    throw new Error('La suppression n’a pas pu se faire : rien n’a été effacé. Réessaie dans un instant.')
  }
}
