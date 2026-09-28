// Mises à jour de l'app : une fois installée sur l'écran d'accueil, PICTI reste ouverte en
// arrière-plan et ne se recharge pas d'elle-même. On compare donc régulièrement la version
// embarquée à celle publiée en ligne (`/version.json`, écrit à chaque build).
import { useSyncExternalStore } from 'react'

export const BUILD_ID = __BUILD_ID__

/** Intervalle entre deux vérifications tant que l'app est à l'écran (ms). */
const CHECK_EVERY = 5 * 60 * 1000

let available = false
const listeners = new Set<() => void>()

async function fetchLatestVersion(): Promise<string | null> {
  try {
    const res = await fetch(`/version.json?t=${Date.now()}`, { cache: 'no-store' })
    if (!res.ok) return null
    const { version } = (await res.json()) as { version?: unknown }
    return typeof version === 'string' ? version : null
  } catch {
    return null
  }
}

/** Interroge le serveur ; renvoie `true` si une nouvelle version est en ligne. */
export async function checkForUpdate(): Promise<boolean> {
  // En développement, Vite recharge déjà la page et `/version.json` n'existe pas.
  if (!import.meta.env.PROD || available) return available
  const latest = await fetchLatestVersion()
  if (latest && latest !== BUILD_ID) {
    available = true
    listeners.forEach((l) => l())
  }
  return available
}

/** Vérifie au lancement, à chaque retour de l'app au premier plan, puis toutes les 5 min. */
export function startUpdateChecks() {
  const check = () => {
    if (document.visibilityState === 'visible') void checkForUpdate()
  }
  check()
  document.addEventListener('visibilitychange', check)
  window.addEventListener('pageshow', check)
  setInterval(check, CHECK_EVERY)
}

export function useUpdateAvailable(): boolean {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => available,
  )
}

/** Recharge l'app : la page est redemandée au serveur, donc à la dernière version. */
export function reloadApp() {
  location.reload()
}

/** Date du build, lisible (« 28 sept. 2026, 14:05 »). */
export function buildLabel(): string {
  const date = new Date(BUILD_ID)
  if (Number.isNaN(date.getTime())) return BUILD_ID
  return date.toLocaleString('fr-FR', { dateStyle: 'medium', timeStyle: 'short' })
}
