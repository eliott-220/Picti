import { useState, type FormEvent } from 'react'
import { CaptureGrid } from '../components/CaptureGrid'
import { Icon } from '../components/Icon'
import { EmptyState, RoundButton } from '../components/ui'
import { useToast } from '../components/toastContext'
import { useImageUrl } from '../data/imageUrls'
import { useStore } from '../data/storeContext'
import { isGeoframed } from '../data/types'
import { navigate } from '../router'

/**
 * Mon profil (bouton Profil au bout de la barre, 0.23.1) : pictogramme, pseudo, ville, « n photos ·
 * n captures · n amis », puis Mes captures (appui long : retirer une capture). ⚙️ en haut à droite :
 * Paramètres. Pas de flèche retour : on en sort en glissant vers la droite (Mes photos) ou par la barre.
 * Mes photos et Amis ont leur propre onglet dans la barre.
 */
export function Profile() {
  const { profile, myPhotos, captures, photos, friends, saveProfile } = useStore()
  const toast = useToast()
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(profile?.name ?? '')
  const [city, setCity] = useState(profile?.city ?? '')

  const geoframed = myPhotos.filter(isGeoframed)
  const heroUrl = useImageUrl(geoframed[0]?.id ?? myPhotos[0]?.id, 'full')
  const byId = new Map(photos.map((p) => [p.id, p]))
  const myCaptures = captures.flatMap((c) => {
    const photo = byId.get(c.photoId)
    return photo ? [{ capture: c, photo }] : []
  })
  const friendCount = friends.filter((f) => f.status === 'accepted').length
  const plural = (n: number, word: string) => `${n} ${word}${n > 1 ? 's' : ''}`

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
    <main className="screen page profile-screen">
      <div className="hero" style={heroUrl ? { backgroundImage: `url(${heroUrl})` } : undefined}>
        <RoundButton icon="settings" label="Paramètres" onClick={() => navigate('/parametres')} className="settings-btn" />
      </div>

      <section className="card red profile-head">
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
            <span className="profile-picto" aria-hidden="true">
              <Icon name="user" size={36} />
            </span>
            <div className="profile-id">
              <h1 className="display">{profile?.name || 'Moi'}</h1>
              {profile?.city && <p className="subtitle">{profile.city}</p>}
              <p className="profile-stats">
                {plural(myPhotos.length, 'photo')} · {plural(myCaptures.length, 'capture')} · {plural(friendCount, 'ami')}
              </p>
            </div>
            <RoundButton icon="pencil" label="Modifier le profil" onClick={() => setEditing(true)} />
          </div>
        )}
      </section>

      <section className="card white profile-body">
        <h2 className="section-title">Mes captures ({myCaptures.length})</h2>
        {myCaptures.length ? (
          <>
            <p className="tab-help">Reste appuyé sur une capture pour la retirer.</p>
            <CaptureGrid captures={myCaptures} />
          </>
        ) : (
          <EmptyState icon="flag">
            Rends-toi sur le lieu d’une photo géocadrée et aligne-toi sur son point de vue pour la capturer.
          </EmptyState>
        )}
      </section>
    </main>
  )
}
