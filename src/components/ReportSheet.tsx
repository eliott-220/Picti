import { useState } from 'react'
import { blockUser, REPORT_DETAILS_MAX, REPORT_REASONS, reportPhoto, reportUser, type ReportReason } from '../data/moderation'
import { Sheet } from './ui'

/** Cible d'un signalement : une photo, ou un utilisateur (avec son nom, pour les phrases). */
export type ReportTarget = { kind: 'photo'; id: string } | { kind: 'user'; id: string; name: string }

/**
 * Signaler (0.24.0) : fiche d'une photo › « ⋯ » › « Signaler la photo », profil public › « ⋯ » › « Signaler
 * l'utilisateur ». Motif obligatoire, précisions facultatives (300 caractères) ; pour un utilisateur, case
 * « Bloquer aussi ». Une photo signalée disparaît aussitôt pour moi ; `onDone` reçoit ce qui a été fait.
 */
export function ReportSheet({
  target,
  onClose,
  onDone,
}: {
  target: ReportTarget
  onClose: () => void
  onDone: (result: { blocked: boolean }) => void
}) {
  const [reason, setReason] = useState<ReportReason | null>(null)
  const [details, setDetails] = useState('')
  const [alsoBlock, setAlsoBlock] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const title = target.kind === 'photo' ? 'Signaler la photo' : `Signaler ${target.name}`

  async function send() {
    if (!reason || busy) return
    setBusy(true)
    setError(null)
    try {
      if (target.kind === 'photo') await reportPhoto(target.id, reason, details)
      else await reportUser(target.id, reason, details)
      if (target.kind === 'user' && alsoBlock) await blockUser(target.id)
      onDone({ blocked: target.kind === 'user' && alsoBlock })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Envoi impossible')
      setBusy(false)
    }
  }

  return (
    <Sheet onClose={() => !busy && onClose()} label={title} className="above-panes">
      <form
        className="report-sheet"
        onSubmit={(e) => {
          e.preventDefault()
          void send()
        }}
      >
        <h2>{title}</h2>
        <p className="report-intro">
          {target.kind === 'photo'
            ? 'Elle disparaîtra aussitôt pour toi. Nous examinons chaque signalement sous 24 h.'
            : 'Nous examinons chaque signalement sous 24 h. La personne ne saura pas qui l’a signalée.'}
        </p>
        <fieldset className="report-reasons" disabled={busy}>
          <legend>Motif</legend>
          {REPORT_REASONS.map((r) => (
            <label key={r.id} className={`report-reason${reason === r.id ? ' selected' : ''}`}>
              <input type="radio" name="motif" value={r.id} checked={reason === r.id} onChange={() => setReason(r.id)} />
              <span>
                <strong>{r.label}</strong>
                {r.hint && <small>{r.hint}</small>}
              </span>
            </label>
          ))}
        </fieldset>
        <label className="report-details">
          <span>Précisions (facultatif)</span>
          <textarea
            value={details}
            maxLength={REPORT_DETAILS_MAX}
            rows={3}
            disabled={busy}
            placeholder={reason === 'other' ? 'Que se passe-t-il ?' : ''}
            onChange={(e) => setDetails(e.target.value)}
          />
          <small>
            {details.length} / {REPORT_DETAILS_MAX}
          </small>
        </label>
        {target.kind === 'user' && (
          <label className="report-block">
            <input type="checkbox" checked={alsoBlock} disabled={busy} onChange={(e) => setAlsoBlock(e.target.checked)} />
            <span>Bloquer aussi {target.name}</span>
          </label>
        )}
        {error && (
          <p className="form-message error" role="alert">
            {error}
          </p>
        )}
        <button type="submit" className="btn" disabled={!reason || busy}>
          {busy ? 'Envoi…' : 'Envoyer le signalement'}
        </button>
        <button type="button" className="btn ghost" disabled={busy} onClick={onClose}>
          Annuler
        </button>
      </form>
    </Sheet>
  )
}
