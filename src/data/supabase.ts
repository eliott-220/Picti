import { createClient } from '@supabase/supabase-js'
import { SUPABASE_KEY, SUPABASE_URL } from '../config'

// Lu avant que Supabase n'efface l'adresse : arrivée par le lien « mot de passe oublié »,
// ou lien de l'e-mail expiré / déjà utilisé.
const urlParams = new URLSearchParams(window.location.hash.slice(1))
export const openedFromRecoveryLink = urlParams.get('type') === 'recovery'
export const authLinkError = urlParams.get('error_code') ?? urlParams.get('error')

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
})

export const PHOTO_BUCKET = 'photos'
