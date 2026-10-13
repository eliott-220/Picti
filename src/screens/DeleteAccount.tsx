import { useState } from 'react'
import { Icon } from '../components/Icon'
import { RoundButton } from '../components/ui'
import { DELETE_WORD, deleteConfirmed, deleteMyAccount } from '../data/moderation'
import { supabase } from '../data/supabase'
import { goBack, navigate } from '../router'

/** Après la suppression : l'écran de connexion l'annonce (lu une fois). */
export const ACCOUNT_DELETED_KEY = 'picti.compte-supprime'

/**
 * Paramètres › Compte › « Supprimer mon compte » (0.24.0, règle 5.1.1 v d'Apple) : ce qui est effacé, ce qui
 * reste, confirmation en tapant SUPPRIMER. L'Edge Function `delete-account` efface tout ou rien (le compte et
 * toutes ses lignes en une transaction, puis les fichiers) ; ensuite déconnexion, retour à la connexion,
 * « Compte supprimé ».
 */
export function DeleteAccount() {
  const [typed, setTyped] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const ok = deleteConfirmed(typed)

  async function confirm() {
    if (!ok || busy) return
    setBusy(true)
    setError(null)
    try {
      await deleteMyAccount()
      try {
        sessionStorage.setItem(ACCOUNT_DELETED_KEY, 'oui')
      } catch {
        // Sans stockage : pas d'annonce, la déconnexion suffit.
      }
      navigate('/', { replace: true })
      await supabase.auth.signOut().catch(() => undefined)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Suppression impossible : rien n’a été effacé.')
      setBusy(false)
    }
  }

  return (
    <main className="screen page delete-account">
      <header className="card red page-header compact">
        <RoundButton icon="back" label="Retour" onClick={goBack} className="back-btn" />
        <h1 className="display">Supprimer mon compte</h1>
      </header>
      <section className="card white">
        <h2 className="section-title">Ce qui sera effacé</h2>
        <ul className="delete-list">
          <li>Mes photos (originaux et vignettes), leurs likes et leurs notifications</li>
          <li>Mes captures, mes likes et mes notifications</li>
          <li>Mes amis, demandes, signalements et blocages</li>
          <li>Mon profil, mon e-mail et mon mot de passe</li>
        </ul>
        <h2 className="section-title">Ce qui reste</h2>
        <p className="delete-note">
          Les reproductions faites par d’autres à partir de mes photos restent à eux : elles s’afficheront « d’après une
          photo supprimée ». C’est définitif : rien ne pourra être récupéré.
        </p>
        <label className="delete-confirm">
          <span>
            Pour confirmer, tape <strong>{DELETE_WORD}</strong>
          </span>
          <input
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            autoCapitalize="characters"
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            disabled={busy}
            aria-label={`Tape ${DELETE_WORD} pour confirmer`}
          />
        </label>
        {error && (
          <p className="form-message error" role="alert">
            {error}
          </p>
        )}
        <button type="button" className="btn" disabled={!ok || busy} onClick={() => void confirm()}>
          <Icon name="trash" /> {busy ? 'Suppression…' : 'Supprimer définitivement'}
        </button>
        <button type="button" className="btn ghost" disabled={busy} onClick={goBack}>
          Annuler
        </button>
      </section>
    </main>
  )
}
