// Mise à jour de l'application : on compare la version en cours avec celle
// publiée (`version.json`) au retour dans l'app et toutes les 5 minutes.

import { useEffect, useState } from 'react'
import { formatVersionNumber } from './versionNumber'

const CHECK_EVERY = 5 * 60_000

export const APP_VERSION = __APP_VERSION__
export const APP_BUILT_AT = __APP_BUILT_AT__
/** Numéro de version affiché, ex. « 0.008.1 ». */
export const APP_NUMBER = formatVersionNumber(__APP_NUMBER__)

async function publishedVersion(): Promise<{ version: string; number: string | null } | null> {
  try {
    const res = await fetch(`/version.json?t=${Date.now()}`, { cache: 'no-store' })
    if (!res.ok) return null
    const data = (await res.json()) as { version?: string; number?: string }
    return data.version ? { version: data.version, number: data.number ? formatVersionNumber(data.number) : null } : null
  } catch {
    return null
  }
}

/**
 * Version plus récente de PICTI en ligne : son numéro (ex. « 0.009.0 »),
 * chaîne vide si elle n'en a pas, null s'il n'y en a pas.
 */
export function useUpdateAvailable(): string | null {
  const [available, setAvailable] = useState<string | null>(null)
  useEffect(() => {
    let alive = true
    const check = async () => {
      const v = await publishedVersion()
      if (alive && v && v.version !== APP_VERSION) setAvailable(v.number ?? '')
    }
    void check()
    const timer = setInterval(check, CHECK_EVERY)
    const onVisible = () => document.visibilityState === 'visible' && void check()
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      alive = false
      clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [])
  return available
}

/** Recharge l'application (nouvelle version et données à jour). */
export function reloadApp() {
  window.location.reload()
}

/** Ligne de version du menu, ex. « Version 0.015.1 · 6 oct. » (jour de la mise à jour, sans l'heure). */
export function formatVersion(): string {
  const d = new Date(APP_BUILT_AT)
  const when = Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })
  return `Version ${APP_NUMBER}${APP_VERSION.length === 7 ? '' : ' (locale)'}${when ? ` · ${when}` : ''}`
}
