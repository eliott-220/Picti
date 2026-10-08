import { useState, type FormEvent } from 'react'
import { Logo } from '../components/Icon'
import { authErrorMessage } from '../data/auth'
import { supabase } from '../data/supabase'
import { useDarkStatusBar } from '../native'

/** Arrivée par le lien « mot de passe oublié » : choix du nouveau mot de passe. */
export function NewPassword({ onDone }: { onDone: () => void }) {
  useDarkStatusBar()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (password !== confirm) {
      setError('Les deux mots de passe ne sont pas identiques.')
      return
    }
    setBusy(true)
    setError(null)
    const { error } = await supabase.auth.updateUser({ password })
    setBusy(false)
    if (error) setError(authErrorMessage(error.message))
    else onDone()
  }

  return (
    <main className="welcome">
      <header className="welcome-hero">
        <Logo size={72} />
        <h1>PICTI</h1>
        <p>Choisissez votre nouveau mot de passe.</p>
      </header>

      <form className="card white welcome-form" onSubmit={submit}>
        <label>
          Nouveau mot de passe
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
            minLength={6}
            required
          />
        </label>
        <label>
          Confirmez-le
          <input
            type="password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            autoComplete="new-password"
            minLength={6}
            required
          />
        </label>

        {error && <p className="form-message error">{error}</p>}

        <button type="submit" className="btn" disabled={busy}>
          {busy ? 'Un instant…' : 'Enregistrer et continuer'}
        </button>
        <button type="button" className="text-link" onClick={() => void supabase.auth.signOut()}>
          Annuler
        </button>
      </form>
    </main>
  )
}
