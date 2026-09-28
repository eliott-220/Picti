import { useState } from 'react'
import { Icon } from '../components/Icon'
import { EmptyState, PhotoTile, RoundButton } from '../components/ui'
import { useStore } from '../data/storeContext'
import { isGeoframed, type GeoPhoto } from '../data/types'
import { goBack, navigate } from '../router'

type Filter = 'toutes' | 'direct' | 'selfies' | 'differe' | 'a-geocadrer' | 'capturees'

const FILTERS: { id: Filter; label: string }[] = [
  { id: 'toutes', label: 'Toutes' },
  { id: 'direct', label: 'En direct' },
  { id: 'selfies', label: 'Selfies' },
  { id: 'differe', label: 'En différé' },
  { id: 'a-geocadrer', label: 'À géocadrer' },
  { id: 'capturees', label: 'Capturées' },
]

const fold = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()

export function Search({ filters }: { filters: boolean }) {
  const { photos, captures } = useStore()
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<Filter>('toutes')
  const captured = new Set(captures.map((c) => c.photoId))

  const matches = (p: GeoPhoto) => {
    switch (filter) {
      case 'direct':
        if (p.mode !== 'direct') return false
        break
      case 'selfies':
        if (!p.selfie) return false
        break
      case 'differe':
        if (p.mode !== 'differe-auto' && p.mode !== 'differe-manuel') return false
        break
      case 'a-geocadrer':
        if (isGeoframed(p)) return false
        break
      case 'capturees':
        if (!captured.has(p.id)) return false
        break
    }
    return !query.trim() || fold(p.title).includes(fold(query.trim()))
  }
  const results = photos.filter(matches)

  return (
    <main className="screen page">
      <header className="card white search-header">
        <div className="search-row">
          <RoundButton icon="back" label="Retour" onClick={goBack} />
          <label className="search-field">
            <Icon name="search" size={20} />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Rechercher une photo"
              autoFocus={!filters}
            />
          </label>
        </div>
        <div className="chips" role="radiogroup" aria-label="Filtrer">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              type="button"
              role="radio"
              aria-checked={filter === f.id}
              className={`chip ${filter === f.id ? 'selected' : ''}`}
              onClick={() => setFilter(f.id)}
            >
              {f.label}
            </button>
          ))}
        </div>

        {results.length ? (
          <div className="grid">
            {results.map((p) => (
              <PhotoTile key={p.id} id={p.id} caption={p.title} onClick={() => navigate(`/photo/${p.id}`)} />
            ))}
          </div>
        ) : (
          <EmptyState icon="search">Aucune photo ne correspond.</EmptyState>
        )}
      </header>
    </main>
  )
}
