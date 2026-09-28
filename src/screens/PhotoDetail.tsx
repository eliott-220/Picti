import { useState } from 'react'
import { Icon } from '../components/Icon'
import { RoundButton } from '../components/ui'
import { useToast } from '../components/toastContext'
import { useImageUrl } from '../data/imageUrls'
import { useStore } from '../data/storeContext'
import { isGeoframed, MODE_LABEL, photoDate } from '../data/types'
import { compassPoint, distanceMeters, formatDistance } from '../geo/geodesy'
import { useGeolocation } from '../sensors/useGeolocation'
import { goBack, navigate } from '../router'

const DEPTHS = [2, 4, 6, 10, 20, 50]

const fmt = (x: number, digits = 0) =>
  (Number(x.toFixed(digits)) || 0).toLocaleString('fr-FR', { maximumFractionDigits: digits })

/** « Une de mes photos géocadrées » : détail, réglages et départ de la chasse. */
export function PhotoDetail({ id }: { id: string }) {
  const { photos, captures, updatePhoto, removePhoto } = useStore()
  const photo = photos.find((p) => p.id === id)
  const url = useImageUrl(id, 'full')
  const { fix } = useGeolocation()
  const toast = useToast()
  const [renaming, setRenaming] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  if (!photo) {
    return (
      <main className="screen page missing">
        <RoundButton icon="back" label="Retour" onClick={goBack} className="back-btn" />
        <p>Cette photo n’existe plus.</p>
      </main>
    )
  }

  const g = photo.geoframe
  const position = g?.position ?? photo.hintPosition
  const distance = fix && position ? distanceMeters(fix, position) : null
  const captured = captures.some((c) => c.photoId === id)

  async function rename(title: string) {
    setRenaming(false)
    if (title.trim() && title.trim() !== photo!.title) await updatePhoto({ ...photo!, title: title.trim() })
  }

  async function remove() {
    await removePhoto(id)
    toast('Photo supprimée')
    goBack()
  }

  return (
    <main className="screen page detail">
      <div className="detail-photo" style={url ? { backgroundImage: `url(${url})` } : undefined}>
        <RoundButton icon="back" label="Retour" onClick={goBack} className="back-btn" />
        <div className="detail-caption">
          {renaming ? (
            <form
              onSubmit={(e) => {
                e.preventDefault()
                void rename(new FormData(e.currentTarget).get('title') as string)
              }}
            >
              <input name="title" defaultValue={photo.title} autoFocus onBlur={(e) => void rename(e.target.value)} />
            </form>
          ) : (
            <h1>{photo.title}</h1>
          )}
          {photoDate(photo) && <p>{photoDate(photo)}</p>}
        </div>
        <RoundButton icon="pencil" label="Renommer" onClick={() => setRenaming(true)} className="detail-edit" />
      </div>

      <section className="card white detail-body">
        {isGeoframed(photo) ? (
          <button type="button" className="btn" onClick={() => navigate(`/chasse/${id}`)}>
            <Icon name="flag" /> {captured ? 'Revoir in situ' : 'Chasser in situ'}
          </button>
        ) : (
          <button type="button" className="btn" onClick={() => navigate(`/recaler/${id}`)}>
            <Icon name="scan" /> Géocadrer sur place
          </button>
        )}

        <dl className="facts">
          <dt>Statut</dt>
          <dd>{photo.mode ? MODE_LABEL[photo.mode] : 'À géocadrer sur place'}</dd>
          {captured && (
            <>
              <dt>Chasse</dt>
              <dd>Capturée in situ ✓</dd>
            </>
          )}
          {position && (
            <>
              <dt>Position</dt>
              <dd>
                {fmt(position.lat, 5)}°, {fmt(position.lon, 5)}°
                {g?.accuracy != null && <> (±{fmt(g.accuracy)} m)</>}
              </dd>
            </>
          )}
          {distance != null && (
            <>
              <dt>Distance</dt>
              <dd>{formatDistance(distance)} d’ici</dd>
            </>
          )}
          {g && (
            <>
              <dt>Cap</dt>
              <dd>
                {fmt(g.heading)}° ({compassPoint(g.heading)}) · {g.headingSource === 'exif' ? 'EXIF' : 'boussole'}
              </dd>
              <dt>Inclinaison</dt>
              <dd>{g.pitchAssumed ? 'Supposée horizontale' : `${fmt(g.pitch)}° · roulis ${fmt(g.roll)}°`}</dd>
            </>
          )}
          <dt>Focale</dt>
          <dd>
            ≈ {fmt(photo.focal35)} mm (équiv. 24×36) · {photo.width}×{photo.height}
          </dd>
        </dl>

        <label className="field">
          Distance du sujet
          <select
            value={photo.depth}
            onChange={(e) => void updatePhoto({ ...photo, depth: Number(e.target.value) })}
          >
            {DEPTHS.map((d) => (
              <option key={d} value={d}>
                {d} m
              </option>
            ))}
          </select>
          <small>Règle la parallaxe : la photo flotte à cette distance du point de vue.</small>
        </label>

        {confirmDelete ? (
          <div className="confirm">
            <span>Supprimer définitivement cette photo ?</span>
            <button type="button" className="btn danger" onClick={() => void remove()}>
              Supprimer
            </button>
            <button type="button" className="btn ghost" onClick={() => setConfirmDelete(false)}>
              Annuler
            </button>
          </div>
        ) : (
          <button type="button" className="btn ghost" onClick={() => setConfirmDelete(true)}>
            <Icon name="trash" /> Supprimer
          </button>
        )}
      </section>
    </main>
  )
}
