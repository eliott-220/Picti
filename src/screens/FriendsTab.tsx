import { useEffect, useState } from 'react'
import { Icon } from '../components/Icon'
import { AvatarRow, EmptyState, IconButton, PersonLink } from '../components/ui'
import { useToast } from '../components/toastContext'
import { inviteLink } from '../data/invite'
import { useStore } from '../data/storeContext'
import type { PersonResult } from '../data/types'
import { navigate } from '../router'
import { NotificationList } from './Notifications'

/**
 * Onglet Amis de la barre du bas (0.23.1, entre la carte et le bouton rouge) : les notifications (qui a
 * aimé ou capturé mes photos) juste au-dessus de la liste d'amis, puis invitations, demandes et mes
 * chasseurs. Pas de flèche retour : on en sort en glissant (carte à gauche, viseur à droite) ou par la
 * barre. `active` : affiché (les notifications sont relues à l'arrivée).
 */
export function FriendsTab({ active }: { active: boolean }) {
  const { hunters } = useStore()
  // Mes chasseurs : ceux qui ont capturé au moins une de mes photos.
  const byHunter = new Map<string, { id: string; name: string; count: number }>()
  for (const c of hunters) {
    const h = byHunter.get(c.hunter) ?? { id: c.hunter, name: c.hunterName, count: 0 }
    h.count++
    byHunter.set(c.hunter, h)
  }
  const chasseurs = [...byHunter.values()].map((h) => ({
    ...h,
    detail: `${h.count} capture${h.count > 1 ? 's' : ''}`,
  }))
  return (
    <main className="screen page tab-screen">
      <header className="card red page-header compact tab-header">
        <h1 className="display">Amis</h1>
      </header>
      <section className="card white tab-body">
        <NotificationList active={active} />
        <Friends />
        <h2 className="section-title">Mes chasseurs ({chasseurs.length})</h2>
        {chasseurs.length ? (
          <AvatarRow people={chasseurs} onOpen={(id) => navigate(`/personne/${id}`)} />
        ) : (
          <EmptyState icon="user">Quand quelqu’un retrouvera l’une de tes photos sur place, il apparaîtra ici.</EmptyState>
        )}
      </section>
    </main>
  )
}

/** Mes amis : invitation (lien, QR code), ajout par code ou par nom, demandes reçues. */
function Friends() {
  const { profile, friends, addFriend, acceptFriend, removeFriend } = useStore()
  const toast = useToast()
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [showQr, setShowQr] = useState(false)

  const accepted = friends.filter((f) => f.status === 'accepted')
  const incoming = friends.filter((f) => f.status === 'pending' && !f.outgoing)
  const outgoing = friends.filter((f) => f.status === 'pending' && f.outgoing)
  const link = profile ? inviteLink(profile.friendCode) : ''

  async function run(action: () => Promise<string | void>) {
    setBusy(true)
    try {
      const message = await action()
      if (message) toast(message)
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Action impossible')
    } finally {
      setBusy(false)
    }
  }

  async function invite() {
    const text = `Ajoute-moi en ami sur PICTI (mon code : ${profile?.friendCode}) :`
    if (navigator.share) {
      try {
        await navigator.share({ title: 'PICTI', text, url: link })
        return
      } catch (err) {
        // Partage annulé : rien à faire ; autre échec : on copie le lien.
        if (err instanceof DOMException && err.name === 'AbortError') return
      }
    }
    try {
      await navigator.clipboard.writeText(`${text} ${link}`)
      toast('Lien d’invitation copié')
    } catch {
      toast(link)
    }
  }

  return (
    <div className="friends">
      <h2 className="section-title">
        Mes amis ({accepted.length})
      </h2>

      <div className="friend-code">
        <div>
          <span>Mon code ami</span>
          <br />
          <strong>{profile?.friendCode}</strong>
        </div>
        <div className="friend-code-actions">
          <button type="button" className="btn small light" onClick={() => void invite()}>
            <Icon name="share" size={18} /> Inviter
          </button>
          <IconButton
            icon="qr"
            label={showQr ? 'Masquer le QR code' : 'Afficher le QR code de mon lien'}
            className="qr-toggle"
            active={showQr}
            expanded={showQr}
            onClick={() => setShowQr((v) => !v)}
          />
        </div>
      </div>
      {showQr && link && <InviteQr link={link} />}

      <form
        className="friend-add"
        onSubmit={(e) => {
          e.preventDefault()
          void run(async () => {
            const message = await addFriend(code)
            setCode('')
            return message
          })
        }}
      >
        <input
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="Code d’un ami"
          aria-label="Code d’un ami"
          maxLength={6}
          autoCapitalize="characters"
        />
        <button type="submit" className="btn small" disabled={busy || !code.trim()}>
          Ajouter
        </button>
      </form>

      <FriendSearch />

      {incoming.map((f) => (
        <div className="friend-row" key={f.userId}>
          <PersonLink id={f.userId} name={f.name} detail="veut devenir votre ami" />
          <button type="button" className="btn small" disabled={busy} onClick={() => void run(() => acceptFriend(f.userId))}>
            Accepter
          </button>
          <IconButton icon="close" label="Refuser" disabled={busy} onClick={() => void run(() => removeFriend(f.userId))} />
        </div>
      ))}

      {accepted.map((f) => (
        <div className="friend-row" key={f.userId}>
          <PersonLink id={f.userId} name={f.name} detail={f.city || undefined} />
        </div>
      ))}

      {outgoing.map((f) => (
        <div className="friend-row" key={f.userId}>
          <PersonLink id={f.userId} name={f.name} detail="demande envoyée" />
          <IconButton
            icon="close"
            label="Annuler la demande"
            disabled={busy}
            onClick={() => void run(() => removeFriend(f.userId))}
          />
        </div>
      ))}
    </div>
  )
}

/** QR code du lien d'invitation, à scanner avec l'appareil photo (bibliothèque chargée à la demande). */
function InviteQr({ link }: { link: string }) {
  const [svg, setSvg] = useState<{ link: string; markup: string | null } | null>(null)

  useEffect(() => {
    let alive = true
    import('qrcode')
      .then((qr) =>
        qr.toString(link, {
          type: 'svg',
          margin: 1,
          errorCorrectionLevel: 'M',
          color: { dark: '#141414', light: '#ffffff' },
        }),
      )
      .then((markup) => alive && setSvg({ link, markup }))
      .catch(() => alive && setSvg({ link, markup: null }))
    return () => {
      alive = false
    }
  }, [link])

  const markup = svg?.link === link ? svg.markup : undefined
  return (
    <div className="invite-qr">
      {markup ? (
        <img src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(markup)}`} alt="QR code de mon lien d’invitation" />
      ) : (
        <span className="invite-qr-placeholder">{markup === null ? 'QR code indisponible' : 'Chargement…'}</span>
      )}
      <small>À scanner avec l’appareil photo du téléphone de votre ami.</small>
    </div>
  )
}

/** Chercher un ami par nom (3 lettres au moins) : ni moi, ni mes amis. */
function FriendSearch() {
  const { friends, searchPeople, requestFriend, acceptFriend } = useStore()
  const toast = useToast()
  const [query, setQuery] = useState('')
  const [found, setFound] = useState<{ query: string; people: PersonResult[] } | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const q = query.trim()
  const active = q.length >= 3
  const people = found?.query === q ? found.people : null

  useEffect(() => {
    if (!active) return
    let alive = true
    const t = setTimeout(() => {
      searchPeople(q)
        .then((list) => alive && setFound({ query: q, people: list }))
        .catch((err: unknown) => {
          if (!alive) return
          setFound({ query: q, people: [] })
          toast(err instanceof Error ? err.message : 'Recherche impossible')
        })
    }, 300)
    return () => {
      alive = false
      clearTimeout(t)
    }
  }, [q, active, searchPeople, toast])

  async function act(person: PersonResult, action: () => Promise<string | void>) {
    setBusy(person.id)
    try {
      const message = await action()
      if (message) toast(message)
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Action impossible')
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="friend-search">
      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Chercher un ami par nom"
        aria-label="Chercher un ami par nom"
        autoComplete="off"
        enterKeyHint="search"
      />
      {active &&
        (people == null ? (
          <p className="friend-search-note">Recherche…</p>
        ) : people.length === 0 ? (
          <p className="friend-search-note">Personne de ce nom (hors vos amis).</p>
        ) : (
          people.map((p) => {
            const link = friends.find((f) => f.userId === p.id)
            return (
              <div className="friend-row" key={p.id}>
                <PersonLink id={p.id} name={p.name} detail={p.city || undefined} />
                {link?.status === 'accepted' ? (
                  <span className="friend-state">Ami</span>
                ) : link?.outgoing ? (
                  <span className="friend-state">Demande envoyée</span>
                ) : link ? (
                  <button
                    type="button"
                    className="btn small"
                    disabled={busy === p.id}
                    onClick={() => void act(p, () => acceptFriend(p.id))}
                  >
                    Accepter
                  </button>
                ) : (
                  <button
                    type="button"
                    className="btn small"
                    disabled={busy === p.id}
                    onClick={() => void act(p, () => requestFriend(p))}
                  >
                    Ajouter
                  </button>
                )}
              </div>
            )
          })
        ))}
    </div>
  )
}
