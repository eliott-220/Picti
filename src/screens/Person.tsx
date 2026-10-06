import { useEffect, useRef, useState } from 'react'
import { photoTime } from '../components/arProjection'
import { FriendButton } from '../components/FriendButton'
import { Avatar, EmptyState, PhotoTile, RoundButton } from '../components/ui'
import { friendState } from '../data/friends'
import { photoPileOrder, spotPointOf } from '../data/photoSpots'
import { useStore } from '../data/storeContext'
import { isGeoframed, memberSince, type GeoPhoto, type PublicProfile } from '../data/types'
import { rememberPublicProfile } from '../data/usePublicProfile'
import { groupBySpot } from '../geo/spots'
import { goBack, navigate } from '../router'

/**
 * Profil public d'un utilisateur (`#/personne/<id>`) : nom, ville, date d'inscription, bouton
 * d'amitié et les photos géocadrées de lui que j'ai le droit de voir. Jamais son code ami, son
 * offre ni son e-mail. Mon propre identifiant : « Moi ».
 */
export function Person({ id }: { id: string }) {
  const { userId, friends, fetchPublicProfile, loadPersonPhotos, reloadFriends } = useStore()
  const self = id === userId
  const [person, setPerson] = useState<PublicProfile | null | undefined>(undefined)
  const [photos, setPhotos] = useState<GeoPhoto[] | null>(null)
  const [failed, setFailed] = useState(false)
  const state = friendState(friends, id)
  // Amitié connue à l'ouverture, comparée à celle de la base (sans relire le profil à chaque changement).
  const stateRef = useRef(state)
  useEffect(() => {
    stateRef.current = state
  })

  useEffect(() => {
    if (self) navigate('/profil', { replace: true })
  }, [self])

  useEffect(() => {
    if (self) return
    let alive = true
    fetchPublicProfile(id)
      .then((p) => {
        if (!alive) return
        setPerson(p)
        if (!p) return
        rememberPublicProfile(userId, p)
        // Demande reçue ou acceptée depuis le chargement de l'app : la liste d'amis est relue.
        if (p.friendship !== stateRef.current) void reloadFriends().catch(() => undefined)
      })
      .catch(() => alive && setFailed(true))
    return () => {
      alive = false
    }
    // Lu une fois par profil ouvert ; l'amitié suit ensuite la liste du store.
  }, [id, self, userId, fetchPublicProfile, reloadFriends])

  // Ses photos visibles (RLS) : relues quand l'amitié change (ses photos « amis » apparaissent).
  useEffect(() => {
    if (self) return
    let alive = true
    loadPersonPhotos(id)
      .then((list) => alive && setPhotos(list))
      .catch(() => alive && setPhotos([]))
    return () => {
      alive = false
    }
  }, [id, self, state, loadPersonPhotos])

  if (self) return null
  if (person === null || failed) {
    return (
      <main className="screen page missing">
        <RoundButton icon="back" label="Retour" onClick={goBack} className="back-btn" />
        <p>{failed ? 'Profil indisponible pour l’instant. Réessayez plus tard.' : 'Ce compte n’existe pas ou plus.'}</p>
        <button type="button" className="btn ghost" onClick={goBack}>
          Retour
        </button>
      </main>
    )
  }

  const name = person?.name || 'Sans nom'
  const geoframed = (photos ?? []).filter(isGeoframed)
  // Une vignette par lieu, comme « Mes photos » (la pile défile dans la fiche).
  const spots = groupBySpot(geoframed, spotPointOf, photoTime, photoPileOrder())

  return (
    <main className="screen page person">
      <header className="card red page-header compact">
        <RoundButton icon="back" label="Retour" onClick={goBack} className="back-btn" />
        {person === undefined ? (
          <p className="subtitle">Chargement…</p>
        ) : (
          <>
            <div className="person-id">
              <Avatar name={person.name} size={72} />
              <div>
                <h1 className="display">{name}</h1>
                {person.city && <p className="subtitle">{person.city}</p>}
                {person.memberSince != null && <p className="person-since">{memberSince(person.memberSince)}</p>}
              </div>
            </div>
            <FriendButton person={{ id, name: person.name }} className="on-red" />
          </>
        )}
      </header>

      <section className="card white">
        <h2 className="section-title">
          {photos == null
            ? 'Photos'
            : `${geoframed.length} photo${geoframed.length > 1 ? 's' : ''} visible${geoframed.length > 1 ? 's' : ''}`}
        </h2>
        {photos == null ? (
          <p className="versions-note">Chargement…</p>
        ) : spots.length ? (
          <div className="grid">
            {spots.map(({ items: [p, ...others] }) => (
              <PhotoTile
                key={p.id}
                id={p.id}
                owner={p.owner}
                stack={1 + others.length}
                likes={p.likesCount}
                version={p.versionOf != null}
                label={others.length ? `${1 + others.length} photos au même endroit` : p.title || undefined}
                onClick={() => navigate(`/photo/${p.id}`)}
              />
            ))}
          </div>
        ) : (
          <EmptyState icon="image">Aucune photo de {name} ne vous est visible pour l’instant.</EmptyState>
        )}
        {state !== 'friends' && photos != null && (
          <p className="person-note">Ses photos réservées aux amis apparaîtront quand vous serez amis.</p>
        )}
      </section>
    </main>
  )
}
