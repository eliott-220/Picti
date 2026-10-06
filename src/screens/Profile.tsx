import { useEffect, useRef, useState, type FormEvent, type Ref } from 'react'
import { photoTime } from '../components/arProjection'
import { Icon } from '../components/Icon'
import { PremiumCard } from '../components/PremiumCard'
import { AvatarRow, EmptyState, PersonLink, PhotoTile, RoundButton } from '../components/ui'
import { useToast } from '../components/toastContext'
import { useImageUrl } from '../data/imageUrls'
import { inviteLink } from '../data/invite'
import { setShotVisibility } from '../data/shotVisibility'
import { useStore } from '../data/storeContext'
import {
  isGeoframed,
  VISIBILITIES,
  VISIBILITY_AUDIENCE,
  VISIBILITY_LABEL,
  visibilityHelp,
  type PersonResult,
  type Visibility,
} from '../data/types'
import { groupBySpot } from '../geo/spots'
import { photoPileOrder, spotPointOf } from '../data/photoSpots'
import { goBack, navigate } from '../router'

/** « Moi » : profil, chasseurs, amis et photos géocadrées. */
export function Profile({ section }: { section?: 'amis' }) {
  const { profile, myPhotos, hunters, saveProfile } = useStore()
  const toast = useToast()
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(profile?.name ?? '')
  const [city, setCity] = useState(profile?.city ?? '')
  const friendsRef = useRef<HTMLDivElement>(null)
  const defaultVisibility = profile?.defaultVisibility ?? 'amis'

  // Arrivée par « Mes amis » (menu, carte) : directement sur la liste d'amis.
  useEffect(() => {
    if (section === 'amis') friendsRef.current?.scrollIntoView({ block: 'start' })
  }, [section])

  const geoframed = myPhotos.filter(isGeoframed)
  // Photos prises au même endroit : une seule vignette, empilée (on les fait défiler dans le détail).
  const spots = groupBySpot(geoframed, spotPointOf, photoTime, photoPileOrder())
  const pending = myPhotos.filter((p) => !isGeoframed(p))
  const heroUrl = useImageUrl(geoframed[0]?.id ?? myPhotos[0]?.id, 'full')

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

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    try {
      await saveProfile({ name: name.trim(), city: city.trim() })
      setEditing(false)
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Enregistrement impossible')
    }
  }

  async function chooseDefault(v: Visibility) {
    if (v === defaultVisibility) return
    try {
      await saveProfile({ defaultVisibility: v })
      // La pastille du viseur repart du nouveau réglage.
      setShotVisibility(null)
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Enregistrement impossible')
    }
  }

  return (
    <main className="screen page">
      <div className="hero" style={heroUrl ? { backgroundImage: `url(${heroUrl})` } : undefined}>
        <RoundButton icon="back" label="Retour" onClick={goBack} className="back-btn" />
      </div>

      <section className="card red">
        {editing ? (
          <form className="profile-form" onSubmit={submit}>
            <input value={name} onChange={(e) => setName(e.target.value)} aria-label="Prénom" required autoFocus />
            <input value={city} onChange={(e) => setCity(e.target.value)} aria-label="Ville" placeholder="Ville" />
            <button type="submit" className="round-btn" aria-label="Enregistrer">
              <Icon name="check" />
            </button>
          </form>
        ) : (
          <div className="card-title-row">
            <div>
              <h1 className="display">{profile?.name || 'Moi'}</h1>
              {profile?.city && <p className="subtitle">{profile.city}</p>}
            </div>
            <RoundButton icon="pencil" label="Modifier le profil" onClick={() => setEditing(true)} />
          </div>
        )}
      </section>

      <section className="card salmon">
        <h2 className="section-title">
          Mes chasseurs ({chasseurs.length})
        </h2>
        {chasseurs.length ? (
          <AvatarRow people={chasseurs} onOpen={(id) => navigate(`/personne/${id}`)} />
        ) : (
          <EmptyState icon="user">
            Quand quelqu’un retrouvera l’une de vos photos sur place, il apparaîtra ici.
          </EmptyState>
        )}
        <Friends ref={friendsRef} />
      </section>

      <section className="card white">
        <PremiumCard />
        <div className="visibility default-visibility">
          Mes nouvelles photos sont visibles par :
          <div className="chips" role="radiogroup" aria-label="Visibilité par défaut de mes nouvelles photos">
            {VISIBILITIES.map((v) => (
              <button
                key={v}
                type="button"
                role="radio"
                aria-checked={defaultVisibility === v}
                className={`chip ${defaultVisibility === v ? 'selected' : ''}`}
                onClick={() => void chooseDefault(v)}
              >
                {VISIBILITY_AUDIENCE[v]}
              </button>
            ))}
          </div>
          <small>
            {visibilityHelp(defaultVisibility, { plural: true })} Vous pouvez changer avant chaque photo (pastille au-dessus
            du déclencheur) ou après coup, dans le détail de la photo.
          </small>
        </div>
        <h2 className="section-title">
          Mes photos géocadrées ({geoframed.length})
        </h2>
        {geoframed.length ? (
          <div className="grid">
            {spots.map(({ items: [p, ...others] }) => (
              <PhotoTile
                key={p.id}
                id={p.id}
                // Seules les photos qui ne suivent pas mon réglage par défaut sont signalées.
                badge={p.visibility !== defaultVisibility ? VISIBILITY_LABEL[p.visibility] : undefined}
                stack={1 + others.length}
                likes={p.likesCount}
                version={p.versionOf != null}
                label={others.length ? `${1 + others.length} photos au même endroit` : undefined}
                onClick={() => navigate(`/photo/${p.id}`)}
              />
            ))}
          </div>
        ) : (
          <EmptyState icon="scan">Prenez une photo depuis l’accueil pour la géocadrer en direct.</EmptyState>
        )}

        {pending.length > 0 && (
          <>
            <h2 className="section-title">À géocadrer sur place ({pending.length})</h2>
            <div className="grid">
              {pending.map((p) => (
                <PhotoTile key={p.id} id={p.id} badge="À recaler" onClick={() => navigate(`/photo/${p.id}`)} />
              ))}
            </div>
          </>
        )}
      </section>
    </main>
  )
}

/** Mes amis : invitation (lien, QR code), ajout par code ou par nom, demandes reçues. */
function Friends({ ref }: { ref?: Ref<HTMLDivElement> }) {
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
    <div className="friends" ref={ref}>
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
          <button
            type="button"
            className={`icon-btn qr-toggle ${showQr ? 'active' : ''}`}
            aria-label={showQr ? 'Masquer le QR code' : 'Afficher le QR code de mon lien'}
            aria-expanded={showQr}
            onClick={() => setShowQr((v) => !v)}
          >
            <Icon name="qr" />
          </button>
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
          <button
            type="button"
            className="icon-btn"
            aria-label="Refuser"
            disabled={busy}
            onClick={() => void run(() => removeFriend(f.userId))}
          >
            <Icon name="close" />
          </button>
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
          <button
            type="button"
            className="icon-btn"
            aria-label="Annuler la demande"
            disabled={busy}
            onClick={() => void run(() => removeFriend(f.userId))}
          >
            <Icon name="close" />
          </button>
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
