// Invitations : un lien https://picti.vercel.app/#/ami/<CODE> ouvre la fiche « X veut être
// votre ami sur PICTI ». Le code ami du profil sert de jeton (le même qu'on peut saisir à la main).

import { APP_URL } from '../config'

/** Code ami tel qu'enregistré en base (6 caractères, majuscules). */
export function normalizeFriendCode(raw: string): string {
  return raw.trim().toUpperCase()
}

/** Lien d'invitation à partager (toujours vers l'application en ligne). */
export function inviteLink(code: string, base = APP_URL): string {
  return `${base.replace(/\/+$/, '')}/#/ami/${encodeURIComponent(normalizeFriendCode(code))}`
}

// Lien ouvert avant d'être connecté : le code survit à l'écran de connexion / création de
// compte (et au lien de confirmation reçu par e-mail, qui ramène à l'accueil).
const PENDING_KEY = 'picti.invitation'

export function rememberInvite(code: string): void {
  try {
    localStorage.setItem(PENDING_KEY, normalizeFriendCode(code))
  } catch {
    // Stockage indisponible (navigation privée) : le lien reste dans l'adresse.
  }
}

/** Invitation en attente, retirée de la mémoire une fois lue. */
export function takePendingInvite(): string | null {
  try {
    const code = localStorage.getItem(PENDING_KEY)
    localStorage.removeItem(PENDING_KEY)
    return code || null
  } catch {
    return null
  }
}
