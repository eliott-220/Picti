import { useState, type FormEvent } from 'react'
import { Icon } from '../components/Icon'
import { EmptyState, PhotoTile, RoundButton } from '../components/ui'
import { useImageUrl } from '../data/imageUrls'
import { useStore } from '../data/storeContext'
import { isGeoframed } from '../data/types'
import { goBack, navigate } from '../router'

/** « Moi » : profil, chasseurs et photos géocadrées. */
export function Profile() {
  const { profile, photos, saveProfile } = useStore()
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(profile?.name ?? '')
  const [city, setCity] = useState(profile?.city ?? '')

  const geoframed = photos.filter(isGeoframed)
  const pending = photos.filter((p) => !isGeoframed(p))
  const heroUrl = useImageUrl(geoframed[0]?.id ?? photos[0]?.id, 'full')

  function submit(e: FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    saveProfile({ name: name.trim(), city: city.trim() })
    setEditing(false)
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
              <h1 className="display">{profile?.name}</h1>
              {profile?.city && <p className="subtitle">{profile.city}</p>}
            </div>
            <RoundButton icon="pencil" label="Modifier le profil" onClick={() => setEditing(true)} />
          </div>
        )}
      </section>

      <section className="card salmon">
        <h2 className="section-title">Mes chasseurs</h2>
        <EmptyState icon="user">
          Vos amis pourront bientôt vous suivre et partir à la chasse de vos photos géocadrées, sur les lieux mêmes où
          vous les avez prises.
        </EmptyState>
      </section>

      <section className="card white">
        <h2 className="section-title">
          Mes {geoframed.length} photo{geoframed.length > 1 ? 's' : ''} géocadrée{geoframed.length > 1 ? 's' : ''}
        </h2>
        {geoframed.length ? (
          <div className="grid">
            {geoframed.map((p) => (
              <PhotoTile key={p.id} id={p.id} onClick={() => navigate(`/photo/${p.id}`)} />
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
                <PhotoTile
                  key={p.id}
                  id={p.id}
                  badge="À recaler"
                  onClick={() => navigate(`/photo/${p.id}`)}
                />
              ))}
            </div>
          </>
        )}
      </section>
    </main>
  )
}
