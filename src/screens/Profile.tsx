import { useState, type FormEvent } from 'react'
import { photoTime } from '../components/arProjection'
import { Icon } from '../components/Icon'
import { PremiumCard } from '../components/PremiumCard'
import { Avatar, AvatarRow, EmptyState, PhotoTile, RoundButton } from '../components/ui'
import { useToast } from '../components/toastContext'
import { useImageUrl } from '../data/imageUrls'
import { useStore } from '../data/storeContext'
import { isGeoframed, VISIBILITY_LABEL } from '../data/types'
import { groupBySpot } from '../geo/spots'
import { goBack, navigate } from '../router'

/** « Moi » : profil, chasseurs, amis et photos géocadrées. */
export function Profile() {
  const { profile, myPhotos, hunters, saveProfile } = useStore()
  const toast = useToast()
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(profile?.name ?? '')
  const [city, setCity] = useState(profile?.city ?? '')

  const geoframed = myPhotos.filter(isGeoframed)
  // Photos prises au même endroit : une seule vignette, empilée (on les fait défiler dans le détail).
  const spots = groupBySpot(geoframed, (p) => p.geoframe.position, photoTime)
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
          <AvatarRow people={chasseurs} />
        ) : (
          <EmptyState icon="user">
            Quand quelqu’un retrouvera l’une de vos photos sur place, il apparaîtra ici.
          </EmptyState>
        )}
        <Friends />
      </section>

      <section className="card white">
        <PremiumCard />
        <h2 className="section-title">
          Mes photos géocadrées ({geoframed.length})
        </h2>
        {geoframed.length ? (
          <div className="grid">
            {spots.map(({ items: [p, ...others] }) => (
              <PhotoTile
                key={p.id}
                id={p.id}
                badge={p.visibility !== 'public' ? VISIBILITY_LABEL[p.visibility] : undefined}
                stack={1 + others.length}
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

/** Mes amis : code à partager, ajout par code, demandes reçues. */
function Friends() {
  const { profile, friends, addFriend, acceptFriend, removeFriend } = useStore()
  const toast = useToast()
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)

  const accepted = friends.filter((f) => f.status === 'accepted')
  const incoming = friends.filter((f) => f.status === 'pending' && !f.outgoing)
  const outgoing = friends.filter((f) => f.status === 'pending' && f.outgoing)

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

  async function share() {
    const text = `Ajoute-moi sur PICTI avec mon code ami : ${profile?.friendCode}`
    if (navigator.share) {
      await navigator.share({ title: 'PICTI', text, url: window.location.origin }).catch(() => undefined)
    } else {
      await navigator.clipboard?.writeText(text)
      toast('Code copié')
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
        <button type="button" className="btn small light" onClick={() => void share()}>
          Partager
        </button>
      </div>

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

      {incoming.map((f) => (
        <div className="friend-row" key={f.userId}>
          <Avatar name={f.name} size={44} />
          <div className="friend-text">
            <strong>{f.name}</strong>
            <span>veut devenir votre ami</span>
          </div>
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
          <Avatar name={f.name} size={44} />
          <div className="friend-text">
            <strong>{f.name}</strong>
            {f.city && <span>{f.city}</span>}
          </div>
        </div>
      ))}

      {outgoing.map((f) => (
        <div className="friend-row" key={f.userId}>
          <Avatar name={f.name} size={44} />
          <div className="friend-text">
            <strong>{f.name}</strong>
            <span>demande envoyée</span>
          </div>
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
