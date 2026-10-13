import { useEffect, useState } from 'react'
import { Avatar, EmptyState, RoundButton } from '../components/ui'
import { useToast } from '../components/toastContext'
import { listBlockedUsers, unblockUser, type BlockedUser } from '../data/moderation'
import { useStore } from '../data/storeContext'
import { goBack } from '../router'

/**
 * Paramètres › Confidentialité › « Utilisateurs bloqués » (0.24.0) : la liste, et « Débloquer » — leurs
 * photos peuvent revenir, l'amitié n'est pas rétablie (il faudra refaire une demande).
 */
export function BlockedUsers() {
  const { reloadFriends } = useStore()
  const toast = useToast()
  const [list, setList] = useState<BlockedUser[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    listBlockedUsers()
      .then((l) => alive && setList(l))
      .catch((e: unknown) => alive && setError(e instanceof Error ? e.message : 'Liste indisponible'))
    return () => {
      alive = false
    }
  }, [])

  async function unblock(u: BlockedUser) {
    setBusy(u.id)
    try {
      await unblockUser(u.id)
      setList((l) => (l ?? []).filter((x) => x.id !== u.id))
      void reloadFriends().catch(() => undefined)
      toast(`${u.name} débloqué · l’amitié n’est pas rétablie`)
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Déblocage impossible')
    } finally {
      setBusy(null)
    }
  }

  return (
    <main className="screen page blocked-users">
      <header className="card red page-header compact">
        <RoundButton icon="back" label="Retour" onClick={goBack} className="back-btn" />
        <h1 className="display">Utilisateurs bloqués</h1>
        <p className="subtitle">Vous ne voyez plus vos photos l’un de l’autre</p>
      </header>
      <section className="card white">
        {error ? (
          <p className="form-message error" role="alert">
            {error}
          </p>
        ) : list == null ? (
          <p className="versions-note">Chargement…</p>
        ) : list.length ? (
          <ul className="blocked-list">
            {list.map((u) => (
              <li key={u.id}>
                <Avatar name={u.name} size={44} />
                <strong>{u.name}</strong>
                <button type="button" className="btn small ghost" disabled={busy != null} onClick={() => void unblock(u)}>
                  {busy === u.id ? 'Un instant…' : 'Débloquer'}
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState icon="friends">Personne n’est bloqué.</EmptyState>
        )}
        <p className="settings-note">Débloquer ne rétablit pas l’amitié : il faudra refaire une demande.</p>
      </section>
    </main>
  )
}
