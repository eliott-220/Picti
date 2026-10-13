import { photoTime } from '../components/arProjection'
import { EmptyState, PhotoTile, PhotoTilePile } from '../components/ui'
import { photoPileOrder, spotPointOf } from '../data/photoSpots'
import { useStore } from '../data/storeContext'
import { isGeoframed } from '../data/types'
import { groupBySpot } from '../geo/spots'
import { navigate } from '../router'

/**
 * Onglet Mes photos de la barre du bas (0.23.1, entre le bouton rouge et le profil) : une pile glissable par
 * lieu (symbole du mode en haut à gauche), puis les photos à géocadrer sur place. Pas de flèche retour : on
 * en sort en glissant (viseur à gauche, profil à droite) ou par la barre.
 */
export function MyPhotosTab() {
  const { myPhotos } = useStore()
  const geoframed = myPhotos.filter(isGeoframed)
  // Photos prises au même endroit : une seule vignette, empilée (on les fait défiler dans le détail).
  const spots = groupBySpot(geoframed, spotPointOf, photoTime, photoPileOrder())
  const pending = myPhotos.filter((p) => !isGeoframed(p))
  return (
    <main className="screen page tab-screen">
      <header className="card red page-header compact tab-header">
        <h1 className="display">Mes photos</h1>
      </header>
      <section className="card white tab-body">
        <h2 className="section-title">Géocadrées ({geoframed.length})</h2>
        {geoframed.length ? (
          <div className="grid">
            {spots.map(({ items }) => (
              <PhotoTilePile key={items[0].id} photos={items} showVisibility onOpen={(p) => navigate(`/photo/${p.id}`)} />
            ))}
          </div>
        ) : (
          <EmptyState icon="scan">Prends une photo avec le bouton rouge pour la géocadrer en direct.</EmptyState>
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
