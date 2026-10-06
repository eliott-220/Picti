import { useEffect, useState } from 'react'
import { Logo } from '../components/Icon'
import { Avatar } from '../components/ui'
import { useToast } from '../components/toastContext'
import { normalizeFriendCode, takePendingInvite } from '../data/invite'
import { useStore } from '../data/storeContext'
import type { PersonResult } from '../data/types'
import { navigate } from '../router'

/**
 * Lien d'invitation `#/ami/<code>` : « <Nom> (<ville>) veut être votre ami sur PICTI ».
 * « Ajouter » envoie la demande (ou l'accepte si cette personne m'a déjà demandé).
 */
export function Invite({ code }: { code: string }) {
  const { profile, friends, findByFriendCode, requestFriend } = useStore()
  const toast = useToast()
  const [found, setFound] = useState<{ person: PersonResult | null } | null>(null)
  const [busy, setBusy] = useState(false)
  const normalized = normalizeFriendCode(code)
  const own = normalized === profile?.friendCode

  useEffect(() => {
    // Le lien est arrivé : plus besoin de le garder pour après la connexion.
    takePendingInvite()
    if (own) return
    let alive = true
    findByFriendCode(normalized)
      .then((person) => alive && setFound({ person }))
      .catch(() => alive && setFound({ person: null }))
    return () => {
      alive = false
    }
  }, [normalized, own, findByFriendCode])

  async function add(person: PersonResult) {
    setBusy(true)
    try {
      toast(await requestFriend(person))
      navigate('/profil/amis', { replace: true })
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Demande impossible')
      setBusy(false)
    }
  }

  const later = () => navigate('/', { replace: true })
  const person = found?.person
  const link = person ? friends.find((f) => f.userId === person.id) : undefined

  let body
  if (own) {
    body = (
      <>
        <h1 className="display">C’est votre lien</h1>
        <p>Partagez-le : vos amis qui l’ouvrent pourront vous ajouter sur PICTI.</p>
        <button type="button" className="btn" onClick={() => navigate('/profil/amis', { replace: true })}>
          Mes amis
        </button>
      </>
    )
  } else if (!found) {
    body = <p>Chargement de l’invitation…</p>
  } else if (!person) {
    body = (
      <>
        <h1 className="display">Invitation introuvable</h1>
        <p>Ce lien n’est pas valable, ou le compte qui l’a partagé n’existe plus.</p>
        <button type="button" className="btn" onClick={later}>
          Aller à l’accueil
        </button>
      </>
    )
  } else {
    const who = person.city ? `${person.name || 'Quelqu’un'} (${person.city})` : person.name || 'Quelqu’un'
    body = (
      <>
        <Avatar name={person.name} size={72} />
        <h1 className="display">{who}</h1>
        {link?.status === 'accepted' ? (
          <>
            <p>est déjà votre ami sur PICTI.</p>
            <button type="button" className="btn" onClick={() => navigate('/profil/amis', { replace: true })}>
              Mes amis
            </button>
          </>
        ) : link?.outgoing ? (
          <>
            <p>a déjà reçu votre demande d’ami : elle attend sa réponse.</p>
            <button type="button" className="btn" onClick={later}>
              Aller à l’accueil
            </button>
          </>
        ) : (
          <>
            <p>veut être votre ami sur PICTI : une fois amis, chacun verra les photos que l’autre réserve à ses amis.</p>
            <div className="invite-actions">
              <button type="button" className="btn" disabled={busy} onClick={() => void add(person)}>
                {busy ? 'Un instant…' : 'Ajouter'}
              </button>
              <button type="button" className="btn ghost" disabled={busy} onClick={later}>
                Plus tard
              </button>
            </div>
          </>
        )}
      </>
    )
  }

  return (
    <main className="screen page invite">
      <header className="invite-head">
        <Logo size={48} />
        <span>Invitation PICTI</span>
      </header>
      <section className="card white invite-card">{body}</section>
    </main>
  )
}
