import { useState, type FormEvent } from 'react'
import { useStore } from '../data/storeContext'
import { Icon } from './Icon'

/**
 * PICTI Premium : avantages et moyens d'y accéder — paiement (à venir) ou
 * code administrateur, vérifié côté serveur.
 */
export function PremiumCard({ reason }: { reason?: string }) {
  const { profile, redeemPremiumCode } = useStore()
  const [open, setOpen] = useState(false)
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null)

  if (profile?.plan === 'premium') {
    return (
      <div className="premium-card active">
        <strong>
          <Icon name="check" size={18} /> PICTI Premium
        </strong>
        <span>Votre compte profite de toutes les fonctions Premium.</span>
      </div>
    )
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setMessage(null)
    try {
      const r = await redeemPremiumCode(code)
      setMessage({ text: r.message, ok: r.ok })
      if (r.ok) setCode('')
    } catch (err) {
      setMessage({ text: err instanceof Error ? err.message : 'Vérification impossible', ok: false })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="premium-card">
      <strong>{reason ?? 'PICTI Premium'}</strong>
      <ul>
        <li>Enregistrer sur votre téléphone les photos des autres utilisateurs</li>
        <li>Géocadrer en différé vos anciennes photos (bientôt réservé à Premium)</li>
      </ul>
      <div className="premium-options">
        <button type="button" className="btn" disabled>
          Payer (bientôt)
        </button>
        <button type="button" className="btn ghost" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
          J’ai un code
        </button>
      </div>
      {open && (
        <form className="premium-code" onSubmit={submit}>
          <input
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="PICTI-XXXX-XXXX-XXXX"
            aria-label="Code Premium"
            autoCapitalize="characters"
            autoComplete="off"
            spellCheck={false}
          />
          <button type="submit" className="btn small" disabled={busy || !code.trim()}>
            {busy ? '…' : 'Valider'}
          </button>
        </form>
      )}
      {message && <p className={`form-message ${message.ok ? '' : 'error'}`}>{message.text}</p>}
    </div>
  )
}
