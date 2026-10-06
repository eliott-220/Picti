import { useEffect, useMemo, useState } from 'react'
import { photoTime } from '../components/arProjection'
import { EmptyState, PhotoTile, RoundButton } from '../components/ui'
import { useStore } from '../data/storeContext'
import { usePhoto } from '../data/usePhoto'
import { usePhotosHere } from '../data/usePhotosHere'
import { formatDateTime, type GeoPhoto } from '../data/types'
import { goBack, navigate } from '../router'

type GallerySort = 'aimees' | 'recentes' | 'prise'

const SORTS: { value: GallerySort; label: string }[] = [
  { value: 'aimees', label: 'Les plus aimées' },
  { value: 'recentes', label: 'Les plus récentes' },
  { value: 'prise', label: 'Date de prise' },
]

const SORT_KEY = 'picti.galerie.tri'

function savedSort(): GallerySort {
  try {
    const v = localStorage.getItem(SORT_KEY)
    return v === 'recentes' || v === 'prise' ? v : 'aimees'
  } catch {
    return 'aimees'
  }
}

/** Les plus aimées (puis la plus récente) ; les plus récemment ajoutées ; par date de prise de vue. */
const COMPARE: Record<GallerySort, (a: GeoPhoto, b: GeoPhoto) => number> = {
  aimees: (a, b) => b.likesCount - a.likesCount || photoTime(b) - photoTime(a),
  recentes: (a, b) => b.addedAt - a.addedAt,
  prise: (a, b) => photoTime(b) - photoTime(a),
}

/** Galerie plein écran de toutes les photos d'un lieu (appui sur les points d'une pile). */
export function Gallery({ id }: { id: string }) {
  const { photo, loading } = usePhoto(id)
  if (!photo) {
    return (
      <main className="screen page missing">
        <RoundButton icon="back" label="Retour" onClick={goBack} className="back-btn" />
        <p>{loading ? 'Chargement…' : 'Cette photo n’existe plus ou ne vous est pas accessible.'}</p>
      </main>
    )
  }
  return <GalleryView photo={photo} />
}

function GalleryView({ photo }: { photo: GeoPhoto }) {
  const { loadSpot, isMine } = useStore()
  const here = usePhotosHere(photo)
  const [sort, setSort] = useState<GallerySort>(savedSort)
  const position = photo.geoframe?.position

  // Ouverte depuis la carte : les autres photos du lieu ne sont pas forcément connues.
  useEffect(() => {
    if (position) void loadSpot(position)
  }, [position, loadSpot])

  const sorted = useMemo(() => [...here].sort(COMPARE[sort]), [here, sort])

  function choose(next: GallerySort) {
    setSort(next)
    try {
      localStorage.setItem(SORT_KEY, next)
    } catch {
      // Stockage indisponible : le tri vaut pour cette visite.
    }
  }

  return (
    <main className="screen page gallery">
      <header className="card red page-header compact">
        <RoundButton icon="back" label="Retour" onClick={goBack} className="back-btn" />
        <h1 className="display">Le lieu</h1>
        <p className="subtitle">
          {sorted.length} photo{sorted.length > 1 ? 's' : ''} prise{sorted.length > 1 ? 's' : ''} ici
        </p>
      </header>
      <section className="card white">
        <div className="chips gallery-sort" role="radiogroup" aria-label="Trier les photos">
          {SORTS.map((s) => (
            <button
              key={s.value}
              type="button"
              role="radio"
              aria-checked={sort === s.value}
              className={`chip ${sort === s.value ? 'selected' : ''}`}
              onClick={() => choose(s.value)}
            >
              {s.label}
            </button>
          ))}
        </div>
        {sorted.length ? (
          <div className="grid">
            {sorted.map((p) => (
              <PhotoTile
                key={p.id}
                id={p.id}
                owner={p.owner}
                likes={p.likesCount}
                version={p.versionOf != null}
                caption={`${isMine(p) ? 'Moi' : p.ownerName || 'Quelqu’un'} · ${formatDateTime(
                  sort === 'recentes' ? p.addedAt : photoTime(p),
                  { short: true },
                )}`}
                onClick={() => navigate(`/photo/${p.id}`)}
              />
            ))}
          </div>
        ) : (
          <EmptyState icon="image">Aucune photo.</EmptyState>
        )}
      </section>
    </main>
  )
}
