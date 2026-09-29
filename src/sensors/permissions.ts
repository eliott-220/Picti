// Autorisations déjà accordées par l'utilisateur, gardées d'une ouverture de
// l'app à l'autre (le navigateur, lui, peut les redemander).

export type SensorKind = 'boussole'

const key = (kind: SensorKind) => `picti.autorisation.${kind}`

/** L'utilisateur a déjà autorisé ce capteur (lors d'une ouverture précédente). */
export function isRemembered(kind: SensorKind): boolean {
  try {
    return localStorage.getItem(key(kind)) === 'accordee'
  } catch {
    return false
  }
}

export function remember(kind: SensorKind, granted: boolean) {
  try {
    if (granted) localStorage.setItem(key(kind), 'accordee')
    else localStorage.removeItem(key(kind))
  } catch {
    // Stockage indisponible (navigation privée) : on redemandera.
  }
}
