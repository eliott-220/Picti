// Tutoriel du premier lancement (0.22.0) : montré une seule fois, avant la création du compte.
// Drapeau `onboardingDone` : `localStorage` (lu tout de suite) et, dans l'app, Capacitor
// Preferences (iOS peut vider les données de la WebView ; un tutoriel revu par erreur serait
// pénible). On peut toujours le revoir depuis le menu ou l'écran de connexion.

import { loadPreference, savePreference } from '../native'

const KEY = 'picti.onboardingDone'

/** Lu sans attendre : vrai si le tutoriel a déjà été vu (ou passé) dans ce navigateur. */
export function onboardingDoneNow(): boolean {
  try {
    return localStorage.getItem(KEY) === '1'
  } catch {
    return false
  }
}

/** Dans l'app, interroge aussi Capacitor Preferences. */
export async function loadOnboardingDone(): Promise<boolean> {
  if (onboardingDoneNow()) return true
  return (await loadPreference(KEY)) === '1'
}

/** Tutoriel vu, passé, ou utilisateur déjà connecté sur cet appareil : on ne le remontre plus. */
export function markOnboardingDone(): void {
  try {
    localStorage.setItem(KEY, '1')
  } catch {
    // Navigation privée : le drapeau de l'app suffit (ou il sera remontré, sans gravité).
  }
  void savePreference(KEY, '1')
}
