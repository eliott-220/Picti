// Configuration de l'application.

// Projet Supabase « picti ». La clé publiable est faite pour être embarquée
// dans le client : les accès sont protégés par les règles RLS de la base.
export const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL ?? 'https://fiybbfiyrnptnpwqkrji.supabase.co'
export const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_KEY ?? 'sb_publishable_1QvmuyoDl00cdBoW11MEPw_Ddb0S4DK'

/**
 * Le géocadrage en différé (import de photos existantes) deviendra payant.
 * Passer à `true` pour le réserver aux comptes « premium ».
 */
export const DIFFERE_PREMIUM_REQUIRED = false

/** Rayon de recherche des photos à proximité (m). */
export const NEARBY_RADIUS = 500
