// Configuration de l'application.

// Projet Supabase « picti ». La clé publiable est faite pour être embarquée
// dans le client : les accès sont protégés par les règles RLS de la base.
export const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL ?? 'https://fiybbfiyrnptnpwqkrji.supabase.co'
export const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_KEY ?? 'sb_publishable_1QvmuyoDl00cdBoW11MEPw_Ddb0S4DK'

/**
 * Géocadrage en différé (import de photos déjà prises) : réservé à PICTI Premium
 * (activé par paiement ou par code). Doublé côté serveur par la règle RLS des photos.
 */
export const DIFFERE_PREMIUM_REQUIRED = true

/** Enregistrer sur son téléphone la photo d'un autre utilisateur : réservé à PICTI Premium. */
export const SAVE_OTHERS_PREMIUM_REQUIRED = true

/** Rayon de recherche des photos à proximité (m). */
export const NEARBY_RADIUS = 500
