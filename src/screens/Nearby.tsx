import { useState } from 'react'
import { EmptyState, GuideArrow, PhotoTile, RoundButton } from '../components/ui'
import { Icon } from '../components/Icon'
import { useStore } from '../data/storeContext'
import { useNearbyRefresh } from '../data/useNearbyRefresh'
import { isGeoframed } from '../data/types'
import { compassPoint, formatDistance, type GeoFix } from '../geo/geodesy'
import { guideTo, steadyViewer } from '../geo/guidance'
import { NEARBY_RADIUS } from '../config'
import { goBack, navigate } from '../router'
import { useGeolocation } from '../sensors/useGeolocation'
import { useGuideHeading } from '../sensors/useGuideHeading'

/**
 * Photos géocadrées autour de soi (les miennes et celles des autres utilisateurs, selon leur visibilité),
 * triées par distance. Chaque flèche montre où aller depuis l'endroit où l'on est, quand on tient le
 * téléphone, à plat comme debout (0.24.0 : cap du téléphone et non plus de l'objectif — à plat il était
 * indéfini —, position qui ne suit pas le bruit du GPS, « ici » sous sa précision, même source de cap que
 * le viseur) ; sans cap fiable, nord en haut, avec une petite boussole « N » pour le comprendre.
 */
export function Nearby() {
  const { photos, nearby, captures, isMine } = useStore()
  const { fix, error } = useGeolocation()
  useNearbyRefresh(fix)
  const guide = useGuideHeading()
  const heading = guide.heading
  const captured = new Set(captures.map((c) => c.photoId))
  // Position de référence : les sauts du GPS plus petits que sa précision ne font pas trembler les flèches.
  const [anchor, setAnchor] = useState<GeoFix | null>(null)
  if (fix) {
    const steady = steadyViewer(anchor, fix)
    if (steady !== anchor) setAnchor(steady)
  }
  const viewer = anchor ?? fix

  const items = photos
    // Photos trouvées par la recherche à proximité + mes photos à recaler.
    .filter((p) => nearby.has(p.id) || (isMine(p) && !isGeoframed(p) && p.hintPosition))
    .map((p) => {
      const position = p.geoframe?.position ?? p.hintPosition!
      const step = viewer && fix ? guideTo(viewer, position, fix.accuracy) : null
      return { p, distance: step?.distance ?? nearby.get(p.id) ?? null, bearing: step?.bearing ?? null, here: step != null && step.bearing == null }
    })
    .sort((a, b) => (a.distance ?? Infinity) - (b.distance ?? Infinity))

  // Sa fiche : « Capturer » (ou « Recaler ») en est le premier bouton.
  const open = (id: string) => navigate(`/photo/${id}`)
  const askCompass = guide.status === 'needs-permission' || guide.status === 'denied'

  return (
    <main className="screen page">
      <header className="card red page-header compact">
        <RoundButton icon="back" label="Retour" onClick={goBack} className="back-btn" />
        <h1 className="display">À proximité</h1>
        <p className="subtitle">
          {fix ? `Dans un rayon de ${formatDistance(NEARBY_RADIUS)} · ±${Math.round(fix.accuracy)} m` : (error ?? 'Recherche de votre position…')}
          {heading == null && fix && ' · flèches orientées nord en haut'}
        </p>
        {heading == null && fix && (
          <div className="nearby-north" role="status">
            <span className="nearby-north-badge" aria-hidden="true">
              <Icon name="arrow" size={14} />N
            </span>
            {askCompass ? (
              <button type="button" className="chip action" onClick={() => void guide.requestPermission()}>
                Activer la boussole
              </button>
            ) : (
              <span>Nord en haut : la boussole n’est pas disponible</span>
            )}
          </div>
        )}
      </header>

      <section className="card white">
        {items.length ? (
          <ul className="nearby" data-heading={heading == null ? 'nord' : Math.round(heading)}>
            {items.map(({ p, distance, bearing, here }) => (
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
                {bearing != null ? (
                  <span className="nearby-arrow" data-bearing={Math.round(bearing)}>
                    <GuideArrow heading={heading} bearing={bearing} />
                  </span>
                ) : (
                  here && <span className="nearby-here">ici</span>
                )}
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
