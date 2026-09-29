import type { Session } from '@supabase/supabase-js'
import { useEffect, useState } from 'react'
import { openedFromRecoveryLink, supabase } from './supabase'

/** Session de l'utilisateur : `undefined` le temps de la vérification initiale. */
export function useSession(): Session | null | undefined {
  const [session, setSession] = useState<Session | null | undefined>(undefined)
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data } = supabase.auth.onAuthStateChange((_event, s) => setSession(s))
    return () => data.subscription.unsubscribe()
  }, [])
  return session
}

/**
 * Vrai quand on arrive par le lien « mot de passe oublié » : l'utilisateur est connecté
 * mais doit choisir un nouveau mot de passe avant d'entrer dans l'app.
 */
export function usePasswordRecovery(): [boolean, () => void] {
  const [recovery, setRecovery] = useState(openedFromRecoveryLink)
  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') setRecovery(true)
      if (event === 'SIGNED_OUT') setRecovery(false)
    })
    return () => data.subscription.unsubscribe()
  }, [])
  return [recovery, () => setRecovery(false)]
}

/** Message affiché quand le lien reçu par e-mail n'est plus valable. */
export function authLinkErrorMessage(code: string): string {
  if (/otp_expired|expired/i.test(code)) return 'Ce lien a expiré ou a déjà servi : demandez-en un nouveau.'
  return 'Ce lien n’est pas valable : demandez-en un nouveau.'
}

/** Messages d'erreur Supabase Auth, en français. */
export function authErrorMessage(message: string): string {
  if (/invalid login credentials/i.test(message)) return 'E-mail ou mot de passe incorrect.'
  if (/email not confirmed/i.test(message)) return 'Confirmez d’abord votre adresse : ouvrez le lien reçu par e-mail.'
  if (/already registered|already exists/i.test(message)) return 'Un compte existe déjà avec cet e-mail : connectez-vous.'
  if (/password should be at least|weak password/i.test(message)) return 'Mot de passe trop court (6 caractères minimum).'
  if (/should be different|same password/i.test(message)) return 'Choisissez un mot de passe différent de l’ancien.'
  if (/rate limit|too many/i.test(message)) return 'Trop de tentatives : réessayez dans quelques minutes.'
  if (/invalid email|unable to validate email/i.test(message)) return 'Adresse e-mail invalide.'
  if (/failed to fetch|network|load failed/i.test(message)) return 'Connexion impossible : vérifiez votre accès à Internet.'
  return message
}
