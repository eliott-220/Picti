import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { photoTime } from '../components/arProjection'
import { Icon } from '../components/Icon'
import { LikeButton, VersionBadge } from '../components/LikeButton'
import { Avatar, PhotoTile, RoundButton, Thumb } from '../components/ui'
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
  formatDate,
  formatDateTime,
  isGeoframed,
  ofName,
  MODE_LABEL,
  photoDate,
  photoTitleAndDate,
  SELFIE_DEPTH,
  VISIBILITIES,
  VISIBILITY_LABEL,
  visibilityHelp,
  type GeoPhoto,
  type Liker,
  type Visibility,
} from '../data/types'
import { clamp } from '../geo/math'
import { compassPoint, distanceMeters, formatDistance } from '../geo/geodesy'
import { useGeolocation } from '../sensors/useGeolocation'
import { goBack, navigate } from '../router'

const DEPTHS = [2, 4, 6, 10, 20, 50]
/** Selfie : l'auteur à bout de bras, en plus des distances habituelles. */
const SELFIE_DEPTHS = [SELFIE_DEPTH, ...DEPTHS]

/** Une version ne peut pas être plus visible que sa parente (vérifié aussi par la base). */
const RANK: Record<Visibility, number> = { prive: 0, amis: 1, public: 2 }

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
  const { captures, isMine, profile, photos, updatePhoto, removePhoto } = useStore()
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
  // Reproduction : sa parente (chargée par `ParentBlock`), qui plafonne sa visibilité.
  const parent = photo.versionOf ? photos.find((p) => p.id === photo.versionOf) : undefined
  const tooVisible = (v: Visibility) => !!parent && parent.visibility !== 'prive' && RANK[v] > RANK[parent.visibility]

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
            rings={here.map((p) => p.versionOf != null)}
            onDots={() => navigate(`/galerie/${photo.id}`)}
            renderCard={(p) => <DetailCard photo={p} />}
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
          <div className="detail-meta">
            <LikeButton photo={photo} className="light" />
            {photo.versionOf && here.length < 2 && <VersionBadge className="light" />}
          </div>
        </div>
        {mine && <RoundButton icon="pencil" label="Renommer" onClick={() => setRenaming(true)} className="detail-edit" />}
      </div>

      <section className="card white detail-body">
        {photo.versionOf && <ParentBlock photo={photo} />}
        {photo.versionsCount > 0 && <VersionsBlock photo={photo} />}
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

        {captured && isGeoframed(photo) && photo.visibility !== 'prive' && (
          <button type="button" className="btn ghost" onClick={() => navigate(`/reproduire/${photo.id}`)}>
            <Icon name="reproduce" /> Reproduire cette photo
          </button>
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

        {mine && photo.likesCount > 0 && <LikersBlock photo={photo} />}

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
                  disabled={tooVisible(v)}
                  onClick={() => void saveChanges({ visibility: v })}
                >
                  {VISIBILITY_LABEL[v]}
                </button>
              ))}
            </div>
            <small>
              {visibilityHelp(photo.visibility)}
              {parent && parent.visibility === 'amis' && ' Reproduction d’une photo réservée aux amis : elle ne peut pas être publique.'}
            </small>
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

/** Carte de la pile d'en-tête : la photo en grand (↻ si c'est une reproduction). */
function DetailCard({ photo }: { photo: GeoPhoto }) {
  const url = useImageUrl(photo.id, 'full')
  // Photo d'un autre pas encore capturée : noir et blanc (la capture lui rend ses couleurs).
  const inColor = usePhotoInColor(photo.id)
  return (
    <div className={`detail-card ${inColor ? '' : 'mono'}`} style={url ? { backgroundImage: `url(${url})` } : undefined}>
      {photo.versionOf && <VersionBadge className="light detail-card-version" />}
    </div>
  )
}

/**
 * Reproduction : « ↻ Reproduction de la photo de … » avec la vignette de la photo parente (date,
 * likes ; appui → son détail) et le curseur avant / après. Parente supprimée ou devenue invisible :
 * « Reproduction d'une photo qui n'est plus disponible ».
 */
function ParentBlock({ photo }: { photo: GeoPhoto }) {
  const { isMine } = useStore()
  const { photo: parent, loading } = usePhoto(photo.versionOf!)
  const [compare, setCompare] = useState(false)
  if (!parent) {
    return (
      <div className="version-block missing">
        <VersionBadge />
        <span>{loading ? 'Reproduction · chargement de l’originale…' : 'Reproduction d’une photo qui n’est plus disponible'}</span>
      </div>
    )
  }
  const author = isMine(parent) ? 'vous' : parent.ownerName || 'quelqu’un'
  return (
    <div className="version-block">
      <button type="button" className="version-parent" onClick={() => navigate(`/photo/${parent.id}`)}>
        <Thumb id={parent.id} owner={parent.owner} className="version-thumb" />
        <span className="version-text">
          <strong>
            <VersionBadge /> Reproduction de la photo {ofName(author)}
          </strong>
          <span>
            {formatDateTime(photoTime(parent), { short: true })} · {parent.likesCount} like{parent.likesCount > 1 ? 's' : ''}
          </span>
        </span>
      </button>
      <button type="button" className="btn small ghost" onClick={() => setCompare(true)}>
        Avant / après
      </button>
      {compare && <BeforeAfter before={parent} after={photo} onClose={() => setCompare(false)} />}
    </div>
  )
}

/** Photo reproduite : « ↻ Reproduite n fois », et la liste de ses reproductions visibles. */
function VersionsBlock({ photo }: { photo: GeoPhoto }) {
  const { loadVersions } = useStore()
  const toast = useToast()
  const [open, setOpen] = useState(false)
  const [list, setList] = useState<GeoPhoto[] | null>(null)
  const n = photo.versionsCount
  function toggle() {
    setOpen((o) => !o)
    if (list) return
    loadVersions(photo.id)
      .then(setList)
      .catch((err: unknown) => {
        setList([])
        toast(err instanceof Error ? err.message : 'Reproductions indisponibles')
      })
  }
  return (
    <div className="versions-block">
      <button type="button" className="btn small ghost" aria-expanded={open} onClick={toggle}>
        <VersionBadge /> Reproduite {n} fois
      </button>
      {open &&
        (list == null ? (
          <p className="versions-note">Chargement…</p>
        ) : list.length ? (
          <div className="strip">
            {list.map((v) => (
              <PhotoTile
                key={v.id}
                id={v.id}
                owner={v.owner}
                size="strip"
                likes={v.likesCount}
                version
                caption={`${v.ownerName || 'Quelqu’un'} · ${formatDateTime(photoTime(v), { short: true })}`}
                onClick={() => navigate(`/photo/${v.id}`)}
              />
            ))}
          </div>
        ) : (
          <p className="versions-note">Ses reproductions ne vous sont pas visibles.</p>
        ))}
    </div>
  )
}

/** « Aimée par … » : seul l'auteur voit qui a aimé sa photo (épingle : aimée sur place, en la capturant). */
function LikersBlock({ photo }: { photo: GeoPhoto }) {
  const { fetchLikers } = useStore()
  const [likers, setLikers] = useState<Liker[] | null>(null)
  useEffect(() => {
    let alive = true
    fetchLikers(photo.id)
      .then((l) => alive && setLikers(l))
      .catch(() => alive && setLikers([]))
    return () => {
      alive = false
    }
  }, [photo.id, photo.likesCount, fetchLikers])
  if (!likers?.length) return null
  return (
    <div className="likers">
      <span>
        <Icon name="heart" size={16} /> Aimée par
      </span>
      <ul>
        {likers.map((l) => (
          <li key={l.userId} title={l.onSite ? 'Aimée sur place (capturée)' : undefined}>
            {l.name || 'Quelqu’un'}
            {l.onSite && <Icon name="pin" size={12} />}
          </li>
        ))}
      </ul>
    </div>
  )
}

/** Avant / après : la reproduction glisse sur l'originale (curseur, ou le doigt sur l'image). */
function BeforeAfter({ before, after, onClose }: { before: GeoPhoto; after: GeoPhoto; onClose: () => void }) {
  const beforeUrl = useImageUrl(before.id, 'full')
  const afterUrl = useImageUrl(after.id, 'full')
  const beforeInColor = usePhotoInColor(before.id, before.owner)
  const [pos, setPos] = useState(50)
  const stage = useRef<HTMLDivElement>(null)
  const move = (x: number) => {
    const r = stage.current?.getBoundingClientRect()
    if (r && r.width) setPos(clamp(((x - r.left) / r.width) * 100, 0, 100))
  }
  // Par-dessus tout l'écran de l'application, pas seulement la carte du détail.
  return createPortal(
    <div className="before-after" role="dialog" aria-modal="true" aria-label="Avant / après">
      <div
        ref={stage}
        className="ba-stage"
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId)
          move(e.clientX)
        }}
        onPointerMove={(e) => e.buttons && move(e.clientX)}
      >
        {beforeUrl && <img src={beforeUrl} alt="" className={`ba-img ${beforeInColor ? '' : 'mono'}`} draggable={false} />}
        {afterUrl && (
          <img src={afterUrl} alt="" className="ba-img" style={{ clipPath: `inset(0 0 0 ${pos}%)` }} draggable={false} />
        )}
        <span className="ba-line" style={{ left: `${pos}%` }} />
        <span className="ba-label left">Avant · {formatDate(photoTime(before))}</span>
        <span className="ba-label right">Après · {formatDate(photoTime(after))}</span>
      </div>
      <input
        type="range"
        min={0}
        max={100}
        value={pos}
        onChange={(e) => setPos(Number(e.target.value))}
        aria-label="Curseur avant / après"
      />
      <button type="button" className="btn light" onClick={onClose}>
        Fermer
      </button>
    </div>,
    document.getElementById('root') ?? document.body,
  )
}
