import { DirectionArrow, EmptyState, PhotoTile, RoundButton } from '../components/ui'
import { useStore } from '../data/storeContext'
import { isGeoframed } from '../data/types'
import { bearingDeg, compassPoint, distanceMeters, formatDistance } from '../geo/geodesy'
import { angleDiffDeg } from '../geo/math'
import { goBack, navigate } from '../router'
import { useGeolocation } from '../sensors/useGeolocation'
import { useOrientation } from '../sensors/useOrientation'

/** Photos géocadrées autour de soi, triées par distance, avec leur direction. */
export function Nearby() {
  const { photos } = useStore()
  const { fix, error } = useGeolocation()
  const orientation = useOrientation()
  const heading = orientation.absolute ? (orientation.angles?.heading ?? null) : null

  const items = photos
    .map((p) => {
      const position = p.geoframe?.position ?? p.hintPosition
      const distance = fix && position ? distanceMeters(fix, position) : null
      const bearing = fix && position && distance! > 1 ? bearingDeg(fix, position) : null
      return { p, position, distance, bearing }
    })
    .filter((x) => x.position)
    .sort((a, b) => (a.distance ?? Infinity) - (b.distance ?? Infinity))

  return (
    <main className="screen page">
      <header className="card red page-header compact">
        <RoundButton icon="back" label="Retour" onClick={goBack} className="back-btn" />
        <h1 className="display">À proximité</h1>
        <p className="subtitle">
          {fix ? `Position à ±${Math.round(fix.accuracy)} m` : (error ?? 'Recherche de votre position…')}
          {heading == null && fix && ' · flèches orientées nord en haut'}
        </p>
      </header>

      <section className="card white">
        {items.length ? (
          <ul className="nearby">
            {items.map(({ p, distance, bearing }) => (
              <li key={p.id}>
                <PhotoTile
                  id={p.id}
                  size="strip"
                  onClick={() => navigate(isGeoframed(p) ? `/chasse/${p.id}` : `/recaler/${p.id}`)}
                />
                <button
                  type="button"
                  className="nearby-text"
                  onClick={() => navigate(isGeoframed(p) ? `/chasse/${p.id}` : `/recaler/${p.id}`)}
                >
                  <strong>{p.title}</strong>
                  <span>
                    {distance != null ? formatDistance(distance) : '…'}
                    {bearing != null && ` · ${compassPoint(bearing)}`}
                    {!isGeoframed(p) && ' · à géocadrer'}
                  </span>
                </button>
                {bearing != null && <DirectionArrow deg={heading != null ? angleDiffDeg(heading, bearing) : bearing} />}
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState icon="pin">Aucune photo géolocalisée pour l’instant.</EmptyState>
        )}
      </section>
    </main>
  )
}
