// Mise à jour de l'application : on compare la version en cours avec celle
// publiée (`version.json`) au retour dans l'app et toutes les 5 minutes.

import { useEffect, useState } from 'react'

const CHECK_EVERY = 5 * 60_000

export const APP_VERSION = __APP_VERSION__
export const APP_BUILT_AT = __APP_BUILT_AT__

async function publishedVersion(): Promise<string | null> {
  try {
    const res = await fetch(`/version.json?t=${Date.now()}`, { cache: 'no-store' })
    if (!res.ok) return null
    const data = (await res.json()) as { version?: string }
    return data.version ?? null
  } catch {
    return null
  }
}

/** Vrai quand une version plus récente de PICTI est en ligne. */
export function useUpdateAvailable(): boolean {
  const [available, setAvailable] = useState(false)
  useEffect(() => {
    let alive = true
    const check = async () => {
      const v = await publishedVersion()
      if (alive && v && v !== APP_VERSION) setAvailable(true)
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

export function formatVersion(): string {
  const d = new Date(APP_BUILT_AT)
  const when = Number.isNaN(d.getTime())
    ? ''
    : d.toLocaleString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
  return `Version ${APP_VERSION.length === 7 ? APP_VERSION : 'locale'}${when ? ` · ${when}` : ''}`
}
