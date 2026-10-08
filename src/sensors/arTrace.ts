// Version de test de l'app iOS (`VITE_PICTI_TRACE=1` au build) : enregistre les trajets — relevés GPS
// bruts, poses du suivi visuel, boussole, calage — dans l'app (Documents/traces/*.jsonl), pour les
// rejouer sur le Mac et régler le calage sur de vraies données. Rien n'est envoyé nulle part ; dans
// les versions normales, ce module ne fait rien.

import { ArTracking } from '../native'

export const TRACE_ENABLED = import.meta.env.VITE_PICTI_TRACE === '1'

/** Nom du journal de ce lancement de l'app (date et heure locales). */
const name = (() => {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}-${p(d.getMinutes())}-${p(d.getSeconds())}`
})()

let lines: string[] = []
let timer: ReturnType<typeof setTimeout> | undefined

function flush() {
  timer = undefined
  if (!lines.length) return
  const text = lines.join('')
  lines = []
  void ArTracking.appendTrace({ name, text }).catch(() => undefined)
}

/** Ajoute un évènement au journal (écrit par paquets toutes les 5 s). */
export function trace(kind: string, data: Record<string, unknown>) {
  if (!TRACE_ENABLED) return
  lines.push(JSON.stringify({ k: kind, t: Date.now(), ...data }) + '\n')
  timer ??= setTimeout(flush, 5000)
}

if (TRACE_ENABLED && typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flush()
  })
}
