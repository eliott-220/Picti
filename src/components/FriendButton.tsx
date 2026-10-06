import { useEffect, useRef, useState } from 'react'
import { FRIEND_BUTTON_LABEL, friendState } from '../data/friends'
import { useStore } from '../data/storeContext'
import type { FriendState } from '../data/types'
import { useToast } from './toastContext'

/**
 * Bouton d'amitié (fiche d'une photo, profil public) : « Ajouter en ami » → « Demande envoyée »
 * (appui : annuler la demande) ; demande reçue → « Accepter » / « Refuser » ; « Amis ✓ » (appui :
 * retirer de mes amis, avec confirmation). L'état vient de la liste d'amis du store ; il change
 * aussitôt (optimiste) et revient en arrière si la base refuse.
 */
export function FriendButton({ person, className = '' }: { person: { id: string; name: string }; className?: string }) {
  const { userId, friends, requestFriend, acceptFriend, removeFriend } = useStore()
  const toast = useToast()
  const [optimistic, setOptimistic] = useState<FriendState | null>(null)
  const [menu, setMenu] = useState<'cancel' | 'friends' | 'remove' | null>(null)
  const wrap = useRef<HTMLDivElement>(null)
  const state = optimistic ?? friendState(friends, person.id)
  const name = person.name || 'cette personne'

  // Menu ouvert : Échap ou un appui ailleurs le referme.
  useEffect(() => {
    if (!menu) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setMenu(null)
    const onDown = (e: PointerEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setMenu(null)
    }
    // Phase de capture : vu même si la feuille de la fiche arrête la propagation.
    window.addEventListener('keydown', onKey)
    window.addEventListener('pointerdown', onDown, true)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('pointerdown', onDown, true)
    }
  }, [menu])

  if (person.id === userId) return null

  async function run(next: FriendState, action: () => Promise<string | void>, done: string) {
    setMenu(null)
    setOptimistic(next)
    try {
      toast((await action()) || done)
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Action impossible')
    } finally {
      // Réussite : la liste d'amis du store est déjà relue ; échec : retour à l'état d'avant.
      setOptimistic(null)
    }
  }

  const busy = optimistic != null
  const add = () => void run('outgoing', () => requestFriend(person), `Demande envoyée à ${name}.`)
  const accept = () => void run('friends', () => acceptFriend(person.id), `Vous êtes maintenant ami avec ${name}.`)
  const refuse = () => void run('none', () => removeFriend(person.id), 'Demande refusée.')
  const cancel = () => void run('none', () => removeFriend(person.id), 'Demande annulée.')
  const unfriend = () => void run('none', () => removeFriend(person.id), `${person.name || 'Cette personne'} n’est plus votre ami.`)

  return (
    <div className={`friend-btn ${className}`} ref={wrap}>
      {state === 'none' && (
        <button type="button" className="btn small" onClick={add} disabled={busy}>
          {FRIEND_BUTTON_LABEL.none}
        </button>
      )}
      {state === 'incoming' && (
        <>
          <button type="button" className="btn small" onClick={accept} disabled={busy} aria-label={`Accepter la demande d’ami de ${name}`}>
            {FRIEND_BUTTON_LABEL.incoming}
          </button>
          <button type="button" className="btn small ghost" onClick={refuse} disabled={busy} aria-label={`Refuser la demande d’ami de ${name}`}>
            Refuser
          </button>
        </>
      )}
      {(state === 'outgoing' || state === 'friends') && (
        <button
          type="button"
          className="btn small ghost"
          disabled={busy}
          aria-haspopup="true"
          aria-expanded={menu != null}
          onClick={() => setMenu((m) => (m ? null : state === 'outgoing' ? 'cancel' : 'friends'))}
        >
          {FRIEND_BUTTON_LABEL[state]}
        </button>
      )}
      {menu && (
        <div className="friend-menu" role="group" aria-label={`Amitié avec ${name}`}>
          {menu === 'cancel' && (
            <>
              <p>Annuler la demande ?</p>
              <button type="button" className="btn small" onClick={cancel} autoFocus>
                Annuler la demande
              </button>
              <button type="button" className="btn small ghost" onClick={() => setMenu(null)}>
                Garder
              </button>
            </>
          )}
          {menu === 'friends' && (
            <button type="button" className="btn small ghost" onClick={() => setMenu('remove')} autoFocus>
              Retirer de mes amis
            </button>
          )}
          {menu === 'remove' && (
            <>
              <p>Retirer {name} de vos amis ? Vous ne verrez plus ses photos réservées aux amis.</p>
              <button type="button" className="btn small danger" onClick={unfriend} autoFocus>
                Retirer
              </button>
              <button type="button" className="btn small ghost" onClick={() => setMenu(null)}>
                Annuler
              </button>
            </>
          )}
        </div>
      )}
    </div>
  )
}
