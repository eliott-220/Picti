import { useState } from 'react'
import { Icon } from '../components/Icon'
import { Avatar, RoundButton } from '../components/ui'
import { useToast } from '../components/toastContext'
import { useImageUrl } from '../data/imageUrls'
import { usePhotoInColor } from '../data/photoColor'
import { PremiumCard } from '../components/PremiumCard'
import { SwipeDeck } from '../components/SwipeDeck'
import { usePhotosHere } from '../data/usePhotosHere'
import { canSaveOthersPhotos } from '../data/premium'
import { savePhotoToDevice } from '../data/savePhoto'
import { useStore } from '../data/storeContext'
import { usePhoto } from '../data/usePhoto'
import {
  isGeoframed,
  MODE_LABEL,
  photoDate,
  photoTitleAndDate,
  SELFIE_DEPTH,
  VISIBILITIES,
  VISIBILITY_LABEL,
  visibilityHelp,
  type GeoPhoto,
} from '../data/types'
import { compassPoint, distanceMeters, formatDistance } from '../geo/geodesy'
import { useGeolocation } from '../sensors/useGeolocation'
import { goBack, navigate } from '../router'

const DEPTHS = [2, 4, 6, 10, 20, 50]
/** Selfie : l'auteur à bout de bras, en plus des distances habituelles. */
const SELFIE_DEPTHS = [SELFIE_DEPTH, ...DEPTHS]

const fmt = (x: number, digits = 0) =>
  (Number(x.toFixed(digits)) || 0).toLocaleString('fr-FR', { maximumFractionDigits: digits })

export function PhotoDetail({ id }: { id: string }) {
  const { photo, loading } = usePhoto(id)
  if (!photo) {
    return (
      <main className="screen page missing">
        <RoundButton icon="back" label="Retour" onClick={goBack} className="back-btn" />
        <p>{loading ? 'Chargement…' : 'Cette photo n’existe plus ou ne vous est pas accessible.'}</p>
      </main>
    )
  }
  return <PhotoDetailView photo={photo} />
}

/** « Une de mes photos géocadrées » ou la photo d'un autre : détail, réglages, chasse. */
function PhotoDetailView({ photo }: { photo: GeoPhoto }) {
  const { captures, isMine, profile, updatePhoto, removePhoto } = useStore()
  const url = useImageUrl(photo.id, 'full')
  // Photos prises au même endroit : empilées, on les fait glisser.
  const here = usePhotosHere(photo)
  const { fix } = useGeolocation()
  const toast = useToast()
  const [renaming, setRenaming] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [saving, setSaving] = useState(false)
  const [paywall, setPaywall] = useState(false)
  const mine = isMine(photo)
  const canSave = mine || canSaveOthersPhotos(profile)

  async function save() {
    if (!canSave) {
      setPaywall(true)
      return
    }
    setSaving(true)
    try {
      await savePhotoToDevice(photo)
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Enregistrement impossible')
    } finally {
      setSaving(false)
    }
  }

  const g = photo.geoframe
  const position = g?.position ?? photo.hintPosition
  const distance = fix && position ? distanceMeters(fix, position) : null
  const captured = captures.some((c) => c.photoId === photo.id)

  async function saveChanges(changes: Partial<GeoPhoto>) {
    try {
      await updatePhoto({ ...photo, ...changes })
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Enregistrement impossible')
    }
  }

  async function rename(title: string) {
    setRenaming(false)
    if (title.trim() && title.trim() !== photo.title) await saveChanges({ title: title.trim() })
  }

  async function remove() {
    try {
      await removePhoto(photo.id)
      toast('Photo supprimée')
      goBack()
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Suppression impossible')
    }
  }

  return (
    <main className="screen page detail">
      <div className="detail-photo" style={url && here.length < 2 ? { backgroundImage: `url(${url})` } : undefined}>
        {here.length > 1 && (
          <SwipeDeck
            className="detail-deck"
            items={here}
            index={Math.max(0, here.findIndex((p) => p.id === photo.id))}
            onIndexChange={(i) => navigate(`/photo/${here[i].id}`, { replace: true })}
            label="Photos prises au même endroit"
            renderCard={(p) => <DetailCard id={p.id} />}
          />
        )}
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
            <h1>{mine ? photo.title : photo.ownerName || 'Photo'}</h1>
          )}
          <p>{mine ? photoDate(photo) : photoTitleAndDate(photo)}</p>
        </div>
        {mine && <RoundButton icon="pencil" label="Renommer" onClick={() => setRenaming(true)} className="detail-edit" />}
      </div>

      <section className="card white detail-body">
        {isGeoframed(photo) ? (
          <button type="button" className="btn" onClick={() => navigate(`/chasse/${photo.id}`)}>
            <Icon name="flag" /> {captured ? 'Revoir in situ' : 'Chasser in situ'}
          </button>
        ) : (
          mine && (
            <button type="button" className="btn" onClick={() => navigate(`/recaler/${photo.id}`)}>
              <Icon name="scan" /> Géocadrer sur place
            </button>
          )
        )}

        <button type="button" className="btn ghost" onClick={() => void save()} disabled={saving}>
          <Icon name="download" /> {saving ? 'Enregistrement…' : 'Enregistrer sur mon téléphone'}
          {!canSave && <span className="premium-tag">Premium</span>}
        </button>
        {paywall && <PremiumCard reason="Enregistrer les photos des autres : PICTI Premium" />}

        {!mine && (
          <div className="author">
            <Avatar name={photo.ownerName} size={44} />
            <span>
              Photo de <strong>{photo.ownerName || 'quelqu’un'}</strong>
            </span>
          </div>
        )}

        {mine && (
          <div className="visibility">
            Qui peut la découvrir sur place ?
            <div className="chips" role="radiogroup" aria-label="Visibilité">
              {VISIBILITIES.map((v) => (
                <button
                  key={v}
                  type="button"
                  role="radio"
                  aria-checked={photo.visibility === v}
                  className={`chip ${photo.visibility === v ? 'selected' : ''}`}
                  onClick={() => void saveChanges({ visibility: v })}
                >
                  {VISIBILITY_LABEL[v]}
                </button>
              ))}
            </div>
            <small>{visibilityHelp(photo.visibility)}</small>
          </div>
        )}

        <dl className="facts">
          <dt>Statut</dt>
          <dd>{photo.mode ? MODE_LABEL[photo.mode] : 'À géocadrer sur place'}</dd>
          {photo.selfie && (
            <>
              <dt>Selfie</dt>
              <dd>Caméra avant : on le retrouve en visant, depuis la place du téléphone, l’endroit où posait son auteur</dd>
            </>
          )}
          {captured && (
            <>
              <dt>Chasse</dt>
              <dd>Capturée in situ ✓</dd>
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
          {mine && position && (
            <>
              <dt>Position</dt>
              <dd>
                {fmt(position.lat, 5)}°, {fmt(position.lon, 5)}°
                {g?.accuracy != null && <> (±{fmt(g.accuracy)} m)</>}
              </dd>
            </>
          )}
          <dt>Focale</dt>
          <dd>
            ≈ {fmt(photo.focal35)} mm (équiv. 24×36) · {photo.width}×{photo.height}
          </dd>
        </dl>

        {mine && (
          <label className="field">
            Distance du sujet
            <select value={photo.depth} onChange={(e) => void saveChanges({ depth: Number(e.target.value) })}>
              {(photo.selfie ? SELFIE_DEPTHS : DEPTHS).map((d) => (
                <option key={d} value={d}>
                  {d.toLocaleString('fr-FR')} m{d === SELFIE_DEPTH ? ' (à bout de bras)' : ''}
                </option>
              ))}
            </select>
            <small>Règle la parallaxe : la photo flotte à cette distance du point de vue.</small>
          </label>
        )}

        {mine &&
          (confirmDelete ? (
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
          ))}
      </section>
    </main>
  )
}

/** Carte de la pile d'en-tête : la photo en grand. */
function DetailCard({ id }: { id: string }) {
  const url = useImageUrl(id, 'full')
  // Photo d'un autre pas encore capturée : noir et blanc (la capture lui rend ses couleurs).
  const inColor = usePhotoInColor(id)
  return <div className={`detail-card ${inColor ? '' : 'mono'}`} style={url ? { backgroundImage: `url(${url})` } : undefined} />
}
