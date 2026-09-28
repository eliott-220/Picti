import { Map as MapLibreMap, setWorkerUrl } from 'maplibre-gl'
import mapWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'
import 'maplibre-gl/dist/maplibre-gl.css'
import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import Supercluster, { type ClusterFeature, type ClusterProperties, type PointFeature } from 'supercluster'
import { Icon } from '../components/Icon'
import { SwipeDeck } from '../components/SwipeDeck'
import { EmptyState, PhotoTile, RoundButton } from '../components/ui'
import { registerThumbs, useImageUrl } from '../data/imageUrls'
import { useStore } from '../data/storeContext'
import { supabase } from '../data/supabase'
import { formatDateTime } from '../data/types'
import { distanceMeters, formatDistance } from '../geo/geodesy'
import { groupBySpot } from '../geo/spots'
import { goBack, navigate } from '../router'
import { useGeolocation } from '../sensors/useGeolocation'

// MapLibre charge son processus de fond à côté de son propre fichier, que
// l'assemblage de Vite ne conserve pas : on lui fournit la version assemblée.
setWorkerUrl(mapWorkerUrl)

/** Fond de carte libre et gratuit (OpenStreetMap), sans clé d'API. */
const MAP_STYLE = 'https://tiles.openfreemap.org/styles/liberty'
/** Au-delà de ce zoom, les photos d'un même endroit restent groupées. */
const CLUSTER_MAX_ZOOM = 19

interface MapPhoto {
  id: string
  owner: string
  ownerName: string
  lat: number
  lon: number
  heading: number | null
  /** Date de prise de vue (ou d'ajout), en ms. */
  time: number
  thumbPath: string
}

/** Un point de la carte = un endroit (photos prises à quelques mètres près). */
interface PointProps {
  /** Photo la plus récente de l'endroit (affichée en vignette, identifie l'endroit). */
  id: string
  time: number
  /** Nombre de photos prises à cet endroit. */
  count: number
}
interface ClusterProps {
  /** Photo la plus récente du groupe (affichée en vignette). */
  id: string
  time: number
  /** Nombre total de photos du groupe. */
  count: number
}

type Feature = ClusterFeature<ClusterProps> | PointFeature<PointProps>

interface Selection {
  photos: MapPhoto[]
  clusterId: number | null
  /** Toutes les photos ont été prises au même endroit : elles s'empilent. */
  sameSpot: boolean
  lngLat: [number, number]
}

interface InBoundsRow {
  id: string
  owner: string
  owner_name: string
  lat: number
  lon: number
  heading: number | null
  taken_at: string | null
  created_at: string
  thumb_path: string
}

/**
 * Carte du monde : toutes les photos géocadrées visibles, regroupées quand
 * on voit de loin (la plus récente du groupe en vignette), à leur position
 * exacte quand on zoome.
 */
export default function WorldMap() {
  const { userId } = useStore()
  const mine = (owner: string) => owner === userId
  const { fix } = useGeolocation()
  const container = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<MapLibreMap | null>(null)
  const [map, setMap] = useState<MapLibreMap | null>(null)
  const [photos, setPhotos] = useState<Map<string, MapPhoto>>(() => new Map())
  const [view, setView] = useState<{ bbox: [number, number, number, number]; zoom: number } | null>(null)
  const [, setFrame] = useState(0)
  const [selection, setSelection] = useState<Selection | null>(null)
  const [deckIndex, setDeckIndex] = useState(0)
  const [loading, setLoading] = useState(false)
  const centeredOnUser = useRef(false)

  // Création de la carte.
  useEffect(() => {
    if (!container.current) return
    const map = new MapLibreMap({
      container: container.current,
      style: MAP_STYLE,
      center: [2.35, 46.6],
      zoom: 2,
      attributionControl: { compact: true },
      dragRotate: false,
      pitchWithRotate: false,
    })
    map.touchZoomRotate.disableRotation()
    mapRef.current = map
    // Rendu des vignettes dès que la carte existe (même si le fond ne charge pas).
    const ready = setTimeout(() => setMap(map))
    let raf = 0
    const redraw = () => {
      if (!raf)
        raf = requestAnimationFrame(() => {
          raf = 0
          setFrame((f) => f + 1)
        })
    }
    const updateView = () => {
      const b = map.getBounds()
      setView({ bbox: [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()], zoom: map.getZoom() })
    }
    map.on('move', redraw)
    map.on('moveend', updateView)
    map.on('load', updateView)
    map.once('idle', updateView)
    return () => {
      clearTimeout(ready)
      cancelAnimationFrame(raf)
      map.remove()
      mapRef.current = null
    }
  }, [])

  // Premier affichage : centré sur ma position, vue régionale (photos groupées).
  useEffect(() => {
    if (!fix || centeredOnUser.current || !mapRef.current) return
    centeredOnUser.current = true
    mapRef.current.jumpTo({ center: [fix.lon, fix.lat], zoom: 5 })
  }, [fix])

  // Chargement des photos de la zone visible (après chaque déplacement).
  useEffect(() => {
    if (!view) return
    let alive = true
    const t = setTimeout(async () => {
      const [w, s, e, n] = view.bbox
      const wide = e - w >= 360
      const wrap = (lng: number) => ((((lng + 180) % 360) + 360) % 360) - 180
      setLoading(true)
      const { data } = await supabase.rpc('photos_in_bounds', {
        p_south: Math.max(-90, s),
        p_west: wide ? -180 : wrap(w),
        p_north: Math.min(90, n),
        p_east: wide ? 180 : wrap(e),
        p_limit: 2000,
      })
      if (!alive) return
      setLoading(false)
      if (!data) return
      const rows = data as InBoundsRow[]
      registerThumbs(rows.map((r) => ({ id: r.id, thumbPath: r.thumb_path })))
      setPhotos((prev) => {
        const next = new Map(prev)
        for (const r of rows) {
          next.set(r.id, {
            id: r.id,
            owner: r.owner,
            ownerName: r.owner_name,
            lat: r.lat,
            lon: r.lon,
            heading: r.heading,
            time: Date.parse(r.taken_at ?? r.created_at),
            thumbPath: r.thumb_path,
          })
        }
        return next
      })
    }, 250)
    return () => {
      alive = false
      clearTimeout(t)
    }
  }, [view])

  // Photos d'un même endroit, empilées : elles ne se séparent jamais, même au zoom maximal.
  const spots = useMemo(() => {
    const list = groupBySpot([...photos.values()], (p) => p, (p) => p.time)
    return new Map(list.map((s) => [s.items[0].id, s]))
  }, [photos])

  // Index de regroupement : chaque groupe retient sa photo la plus récente.
  const index = useMemo(() => {
    const sc = new Supercluster<PointProps, ClusterProps>({
      radius: 64,
      maxZoom: CLUSTER_MAX_ZOOM,
      map: (p) => ({ id: p.id, time: p.time, count: p.count }),
      reduce: (acc, p) => {
        acc.count += p.count
        if (p.time > acc.time) {
          acc.time = p.time
          acc.id = p.id
        }
      },
    })
    sc.load(
      [...spots.values()].map((s) => ({
        type: 'Feature' as const,
        properties: { id: s.items[0].id, time: s.items[0].time, count: s.items.length },
        geometry: { type: 'Point' as const, coordinates: [s.position.lon, s.position.lat] },
      })),
    )
    return sc
  }, [spots])

  const features: Feature[] = useMemo(
    () => (view ? index.getClusters(view.bbox, Math.floor(view.zoom)) : []),
    [index, view],
  )

  function select(f: Feature) {
    const [lon, lat] = f.geometry.coordinates as [number, number]
    setDeckIndex(0)
    if ('cluster' in f.properties && f.properties.cluster) {
      const clusterId = (f.properties as ClusterProperties).cluster_id
      const leaves = index
        .getLeaves(clusterId, Infinity)
        .flatMap((l) => spots.get(l.properties.id)?.items ?? [])
        .sort((a, b) => b.time - a.time)
      setSelection({ photos: leaves, clusterId, sameSpot: false, lngLat: [lon, lat] })
    } else {
      const spot = spots.get((f.properties as PointProps).id)
      if (spot) setSelection({ photos: spot.items, clusterId: null, sameSpot: true, lngLat: [lon, lat] })
    }
  }

  function zoomInto(sel: Selection) {
    if (!map) return
    const zoom = sel.clusterId != null ? Math.min(index.getClusterExpansionZoom(sel.clusterId), 20) : 19
    map.easeTo({ center: sel.lngLat, zoom })
    setSelection(null)
  }

  function locate() {
    if (map && fix) map.easeTo({ center: [fix.lon, fix.lat], zoom: 16 })
  }

  const me = fix && map ? map.project([fix.lon, fix.lat]) : null

  return (
    <main className="screen world-map">
      <div ref={container} className="map-canvas" />

      {/* Vignettes placées dans la carte : pincer ou glisser dessus déplace aussi la carte. */}
      {map &&
        createPortal(
          <div className="map-markers">
            {features.map((f) => {
              const [lon, lat] = f.geometry.coordinates as [number, number]
              const pt = map.project([lon, lat])
              const isCluster = 'cluster' in f.properties && f.properties.cluster
              const count = (f.properties as ClusterProps).count
              const latestId = (f.properties as ClusterProps).id
              const single = !isCluster && count === 1 ? photos.get(latestId) : null
              return (
                <div
                  key={isCluster ? `c${(f.properties as ClusterProperties).cluster_id}` : latestId}
                  className={`map-marker ${single && mine(single.owner) ? 'mine' : ''} ${count > 1 ? 'stacked' : ''}`}
                  style={{ transform: `translate(${pt.x}px, ${pt.y}px)` }}
                >
                  <PhotoTile
                    id={latestId}
                    size="mini"
                    onClick={() => select(f)}
                    label={
                      count > 1 ? `${count} photos${isCluster ? '' : ' au même endroit'}` : `Photo de ${single?.ownerName ?? ''}`
                    }
                  />
                  {count > 1 && <span className="map-count">{count > 999 ? '999+' : count}</span>}
                  {single?.heading != null && (
                    <span className="map-heading" style={{ transform: `rotate(${single.heading}deg)` }} />
                  )}
                </div>
              )
            })}
            {me && <span className="map-me" style={{ transform: `translate(${me.x}px, ${me.y}px)` }} />}
          </div>,
          map.getCanvasContainer(),
        )}

      <header className="map-top">
        <RoundButton icon="back" label="Retour" onClick={goBack} />
        <div className="map-title">
          <strong>Carte des photos</strong>
          <span>
            {loading
              ? 'Chargement…'
              : `${photos.size} photo${photos.size > 1 ? 's' : ''} chargée${photos.size > 1 ? 's' : ''}`}
          </span>
        </div>
      </header>

      <nav className="map-actions" aria-label="Carte">
        <RoundButton icon="compass" label="Ma position" onClick={locate} />
        <RoundButton icon="grid" label="Liste à proximité" onClick={() => navigate('/proximite')} />
      </nav>

      {selection && (
        <section className="map-sheet" role="dialog" aria-label="Photos sélectionnées">
          <div className="map-sheet-head">
            <div>
              <strong>
                {selection.photos.length > 1
                  ? `${selection.photos.length} photos ${selection.sameSpot ? 'au même endroit' : 'ici'}`
                  : `Photo de ${mine(selection.photos[0]?.owner ?? '') ? 'moi' : selection.photos[0]?.ownerName || 'quelqu’un'}`}
              </strong>
              <span>
                {selection.sameSpot && selection.photos.length > 1
                  ? 'Faites glisser pour voir les autres'
                  : 'De la plus récente à la plus ancienne'}
                {fix &&
                  ` · ${formatDistance(distanceMeters(fix, { lat: selection.lngLat[1], lon: selection.lngLat[0] }))}`}
              </span>
            </div>
            <button type="button" className="icon-btn" aria-label="Fermer" onClick={() => setSelection(null)}>
              <Icon name="close" />
            </button>
          </div>
          {selection.sameSpot && selection.photos.length > 1 ? (
            <SwipeDeck
              className="map-deck"
              items={selection.photos}
              index={Math.min(deckIndex, selection.photos.length - 1)}
              onIndexChange={setDeckIndex}
              label="Photos prises à cet endroit"
              renderCard={(p) => (
                <MapDeckCard
                  photo={p}
                  caption={`${formatDateTime(p.time, { short: true })}${mine(p.owner) ? '' : ` · ${p.ownerName}`}`}
                />
              )}
            />
          ) : selection.photos.length ? (
            <div className="strip">
              {selection.photos.map((p) => (
                <PhotoTile
                  key={p.id}
                  id={p.id}
                  size="strip"
                  caption={`${formatDateTime(p.time, { short: true })}${mine(p.owner) ? '' : ` · ${p.ownerName}`}`}
                  onClick={() => navigate(`/photo/${p.id}`)}
                />
              ))}
            </div>
          ) : (
            <EmptyState icon="image">Aucune photo.</EmptyState>
          )}
          <div className="map-sheet-actions">
            <button type="button" className="btn ghost" onClick={() => zoomInto(selection)}>
              <Icon name="zoom" /> Zoomer ici
            </button>
            {selection.photos[0] && (
              <button
                type="button"
                className="btn"
                onClick={() =>
                  navigate(`/chasse/${selection.photos[selection.sameSpot ? Math.min(deckIndex, selection.photos.length - 1) : 0].id}`)
                }
              >
                <Icon name="flag" /> Chasser
              </button>
            )}
          </div>
        </section>
      )}
    </main>
  )
}

/** Carte de la pile : la photo entière (vignette), appui = détail. */
function MapDeckCard({ photo, caption }: { photo: MapPhoto; caption: string }) {
  const url = useImageUrl(photo.id, 'thumb')
  return (
    <button type="button" className="deck-photo" onClick={() => navigate(`/photo/${photo.id}`)} aria-label={caption}>
      {url ? <img src={url} alt="" draggable={false} /> : <span className="tile-placeholder" />}
      <span className="tile-caption">{caption}</span>
    </button>
  )
}
