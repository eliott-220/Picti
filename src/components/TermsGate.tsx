import { useEffect, useState, type ReactNode } from 'react'
import { acceptTerms, loadTermsState, type TermsState } from '../data/terms'
import { supabase } from '../data/supabase'
import { Logo } from './Icon'

/**
 * Comptes existants (0.24.0) : à la première ouverture après la mise à jour, accepter les conditions
 * d'utilisation et la politique de confidentialité pour continuer (date notée par le serveur). Les liens
 * ouvrent les deux pages (`reading` : lisibles sans passer la porte). Rien ne bloque si la base ne sait pas encore le noter.
 */
export function TermsGate({ userId, children, reading }: { userId: string; children: ReactNode; reading: ReactNode }) {
  const [state, setState] = useState<TermsState | 'loading'>('loading')
  const [checked, setChecked] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    loadTermsState(userId)
      .then((s) => alive && setState(s))
      .catch(() => alive && setState('unknown'))
    return () => {
      alive = false
    }
  }, [userId])

  // Pendant la lecture, l'app s'affiche déjà (rien à cacher) ; seul « à accepter » l'arrête — sauf pour lire
  // les conditions elles-mêmes (`reading`).
  if (state !== 'required') return children
  if (reading) return reading

  async function accept() {
    if (!checked || busy) return
    setBusy(true)
    setError(null)
    try {
      await acceptTerms()
      setState('accepted')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Enregistrement impossible')
      setBusy(false)
    }
  }

  return (
    <main className="screen page terms-gate">
      <section className="card white">
        <Logo size={56} />
        <h1>Nouvelles conditions</h1>
        <p>
          Avant d’ouvrir PICTI à plus de monde, voici les règles du jeu : ce qui est interdit (tolérance zéro), comment
          signaler et bloquer, et ce que deviennent tes données.
        </p>
        <label className="legal-consent">
          <input type="checkbox" checked={checked} disabled={busy} onChange={(e) => setChecked(e.target.checked)} />
          <span>
            J’accepte les <a href="#/cgu">conditions d’utilisation</a> et la <a href="#/confidentialite">politique de confidentialité</a>.
          </span>
        </label>
        {error && (
          <p className="form-message error" role="alert">
            {error}
          </p>
        )}
        <button type="button" className="btn" disabled={!checked || busy} onClick={() => void accept()}>
          {busy ? 'Un instant…' : 'Continuer'}
        </button>
        <button type="button" className="btn ghost" disabled={busy} onClick={() => void supabase.auth.signOut()}>
          Se déconnecter
        </button>
      </section>
    </main>
  )
}
