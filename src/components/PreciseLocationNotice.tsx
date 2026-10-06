import { useEffect, useState } from 'react'
import type { GeoFix } from '../geo/geodesy'
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

/** Explication « Position exacte » sur iPhone, affichée une fois (bouton « Compris », mémorisé). */
export function PreciseLocationNotice({ fix }: { fix: GeoFix | null }) {
  const [enabled] = useState(() => isIos() && !understood() && !shown)
  const [open, setOpen] = useState(false)
  const [done, setDone] = useState(false)
  const vague = fix != null && fix.accuracy > APPROXIMATE_ACCURACY

  // Le délai repart à chaque fois que la précision redevient mauvaise.
  useEffect(() => {
    if (!enabled || done || !vague) return
    const t = setTimeout(() => {
      shown = true
      setOpen(true)
    }, APPROXIMATE_MS)
    return () => clearTimeout(t)
  }, [enabled, done, vague])

  if (!open || done) return null
  return (
    <div className="notice-layer" role="alertdialog" aria-label="Position approximative">
      <div className="notice-card">
        <Icon name="pin" size={28} />
        <p>
          Votre iPhone donne une position approximative. Activez Réglages › Confidentialité et sécurité › Service de
          localisation › Sites web Safari › Position exacte.
        </p>
        <button
          type="button"
          className="btn"
          onClick={() => {
            remember()
            setDone(true)
          }}
        >
          Compris
        </button>
      </div>
    </div>
  )
}
