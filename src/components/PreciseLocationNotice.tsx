import { useEffect, useState } from 'react'
import { preciseLocationText } from '../data/shotWarnings'
import { hasNativePosition } from '../native'
import { openAppSettings } from '../sensors/positionSource'
import type { GeolocationState } from '../sensors/useGeolocation'
import { Icon } from './Icon'

/**
 * Position « approximative » : un iPhone réglé ainsi ne donne qu'une zone de plusieurs
 * centaines de mètres. Si la précision reste au-delà de ce seuil (m) pendant ce délai (ms), on
 * explique où activer la position exacte.
 */
export const APPROXIMATE_ACCURACY = 100
export const APPROXIMATE_MS = 15_000
const UNDERSTOOD_KEY = 'picti.position-exacte.compris'

/** Déjà affichée pendant cette visite (si `localStorage` ne la retient pas). */
let shown = false

const isIos = () =>
  /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)

function understood(): boolean {
  try {
    return localStorage.getItem(UNDERSTOOD_KEY) === '1'
  } catch {
    return false
  }
}

function remember() {
  try {
    localStorage.setItem(UNDERSTOOD_KEY, '1')
  } catch {
    // Navigation privée, stockage refusé : elle ne reviendra pas pendant cette visite.
  }
}

/**
 * Explication « Position exacte » sur iPhone. Dans le navigateur : déduite d'une précision restée
 * mauvaise, affichée une fois (« Compris », mémorisé). Dans l'app : iOS dit lui-même que la position
 * exacte est désactivée (et l'a déjà proposée une fois) ; affichée une fois par lancement, avec un
 * bouton vers les réglages de l'app.
 */
export function PreciseLocationNotice({ geo }: { geo: GeolocationState }) {
  const [inApp] = useState(hasNativePosition)
  const [enabled] = useState(() => (inApp || (isIos() && !understood())) && !shown)
  const [done, setDone] = useState(false)
  const [timedOut, setTimedOut] = useState(false)
  const vague = geo.fix != null && geo.fix.accuracy > APPROXIMATE_ACCURACY
  // L'app sait que la position exacte est désactivée : tout de suite ; sinon, une précision
  // restée mauvaise (le délai repart à chaque fois qu'elle le redevient).
  const open = enabled && !done && (geo.precise === 'reduced' || timedOut)

  useEffect(() => {
    if (open) shown = true
  }, [open])

  useEffect(() => {
    if (!enabled || done || !vague || geo.precise === 'full' || geo.precise === 'asking') return
    const t = setTimeout(() => setTimedOut(true), APPROXIMATE_MS)
    return () => clearTimeout(t)
  }, [enabled, done, vague, geo.precise])

  if (!open) return null
  const close = () => {
    if (!inApp) remember()
    setDone(true)
  }
  return (
    <div className="notice-layer" role="alertdialog" aria-label="Position approximative">
      <div className="notice-card">
        <Icon name="pin" size={28} />
        <p>{preciseLocationText(inApp)}</p>
        {inApp ? (
          <>
            <button
              type="button"
              className="btn"
              onClick={() => {
                openAppSettings()
                setDone(true)
              }}
            >
              Ouvrir les réglages
            </button>
            <button type="button" className="btn ghost" onClick={close}>
              Plus tard
            </button>
          </>
        ) : (
          <button type="button" className="btn" onClick={close}>
            Compris
          </button>
        )}
      </div>
    </div>
  )
}
