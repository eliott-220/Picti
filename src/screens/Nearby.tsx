import { DirectionArrow, EmptyState, PhotoTile, RoundButton } from '../components/ui'
import { useStore } from '../data/storeContext'
import { useNearbyRefresh } from '../data/useNearbyRefresh'
import { isGeoframed } from '../data/types'
import { bearingDeg, compassPoint, distanceMeters, formatDistance } from '../geo/geodesy'
import { angleDiffDeg } from '../geo/math'
import { NEARBY_RADIUS } from '../config'
import { goBack, navigate } from '../router'
import { useGeolocation } from '../sensors/useGeolocation'
import { useOrientation } from '../sensors/useOrientation'

/**
 * Photos géocadrées autour de soi (les miennes et celles des autres
 * utilisateurs, selon leur visibilité), triées par distance.
 */
export function Nearby() {
  const { photos, nearby, captures, isMine } = useStore()
  const { fix, error } = useGeolocation()
  useNearbyRefresh(fix)
  const orientation = useOrientation()
  const heading = orientation.absolute ? (orientation.angles?.heading ?? null) : null
  const captured = new Set(captures.map((c) => c.photoId))

  const items = photos
    // Photos trouvées par la recherche à proximité + mes photos à recaler.
    .filter((p) => nearby.has(p.id) || (isMine(p) && !isGeoframed(p) && p.hintPosition))
    .map((p) => {
      const position = p.geoframe?.position ?? p.hintPosition!
      const distance = fix ? distanceMeters(fix, position) : (nearby.get(p.id) ?? null)
      const bearing = fix && distance! > 1 ? bearingDeg(fix, position) : null
      return { p, distance, bearing }
    })
    .sort((a, b) => (a.distance ?? Infinity) - (b.distance ?? Infinity))

  // Sa fiche : « Capturer » (ou « Géocadrer sur place ») en est le premier bouton.
  const open = (id: string) => navigate(`/photo/${id}`)

  return (
    <main className="screen page">
      <header className="card red page-header compact">
        <RoundButton icon="back" label="Retour" onClick={goBack} className="back-btn" />
        <h1 className="display">À proximité</h1>
        <p className="subtitle">
          {fix ? `Dans un rayon de ${formatDistance(NEARBY_RADIUS)} · ±${Math.round(fix.accuracy)} m` : (error ?? 'Recherche de votre position…')}
          {heading == null && fix && ' · flèches orientées nord en haut'}
        </p>
      </header>

      <section className="card white">
        {items.length ? (
          <ul className="nearby">
            {items.map(({ p, distance, bearing }) => (
              <li key={p.id}>
                <PhotoTile id={p.id} size="strip" onClick={() => open(p.id)} />
                <button type="button" className="nearby-text" onClick={() => open(p.id)}>
                  <strong>{isMine(p) ? p.title : `Photo de ${p.ownerName || 'quelqu’un'}`}</strong>
                  <span>
                    {distance != null ? formatDistance(distance) : '…'}
                    {bearing != null && ` · ${compassPoint(bearing)}`}
                    {!isGeoframed(p) ? ' · à géocadrer' : captured.has(p.id) ? ' · capturée ✓' : ''}
                  </span>
                </button>
                {bearing != null && <DirectionArrow deg={heading != null ? angleDiffDeg(heading, bearing) : bearing} />}
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState icon="pin">
            {fix
              ? 'Aucune photo géocadrée autour de vous pour l’instant. Soyez le premier : prenez-en une !'
              : 'Activez la localisation pour découvrir les photos autour de vous.'}
          </EmptyState>
        )}
      </section>
    </main>
  )
}
