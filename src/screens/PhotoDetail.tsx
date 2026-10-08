import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { createPortal } from 'react-dom'
import { photoTime } from '../components/arProjection'
import { FriendButton } from '../components/FriendButton'
import { Icon } from '../components/Icon'
import { LikeButton, VersionBadge } from '../components/LikeButton'
import { Avatar, IconButton, PhotoTile, RoundButton } from '../components/ui'
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
import { usePublicProfile } from '../data/usePublicProfile'
import { useVersions } from '../data/useVersions'
import { hiddenVersionsText, otherVersionsText, remadeText, timelineOrder } from '../data/versions'
import {
  formatDate,
  formatDateTime,
  isGeoframed,
  ofName,
  MODE_LABEL,
  photoDate,
  photoTitleAndDate,
  SELFIE_DEPTH,
  shotDateText,
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
import { goBack, navigate, useBackCloses } from '../router'

const DEPTHS = [2, 4, 6, 10, 20, 50]
/** Selfie : l'auteur à bout de bras, en plus des distances habituelles. */
const SELFIE_DEPTHS = [SELFIE_DEPTH, ...DEPTHS]

/** Une version ne peut pas être plus visible que sa parente (vérifié aussi par la base). */
const RANK: Record<Visibility, number> = { prive: 0, amis: 1, public: 2 }

/** Glissement vers le bas (px) au-delà duquel la feuille se referme. */
const SHEET_CLOSE_DRAG = 90

const fmt = (x: number, digits = 0) =>
  (Number(x.toFixed(digits)) || 0).toLocaleString('fr-FR', { maximumFractionDigits: digits })

/** Fiche d'une photo (`#/photo/<id>`, `#/photo/<id>/fil` : directement sur « Au fil du temps »). */
export function PhotoDetail({ id, section }: { id: string; section?: 'fil' }) {
  const { photo, loading } = usePhoto(id)
  if (!photo) {
    return (
      <main className="screen page missing">
        <RoundButton icon="back" label="Retour" onClick={goBack} className="back-btn" />
        <p>{loading ? 'Chargement…' : 'Cette photo n’existe plus ou ne vous est pas accessible.'}</p>
      </main>
    )
  }
  return (
    <main className="screen page detail">
      <PhotoDetailView photo={photo} section={section} />
    </main>
  )
}

/**
 * La fiche en feuille, par-dessus la caméra, juste après une capture (chasse, viseur) : même contenu
 * que la page, en-tête « Capturée ✓ · aimée sur place », « Reproduire » en avant. On la redescend
 * d'un glissement (ou ✕, ou le bouton retour du téléphone) pour contempler la photo in situ ; la
 * caméra continue de tourner dessous.
 */
export function PhotoSheet({ photo, banner, onClose }: { photo: GeoPhoto; banner: string; onClose: () => void }) {
  useBackCloses(onClose)
  const [drag, setDrag] = useState<{ y0: number; dy: number } | null>(null)
  const dialog = useRef<HTMLElement>(null)
  const closeRef = useRef(onClose)
  useEffect(() => {
    closeRef.current = onClose
  })
  // Le lecteur d'écran et le clavier entrent dans la feuille ; Échap la referme (sauf l'avant / après ouvert).
  useEffect(() => {
    dialog.current?.focus({ preventScroll: true })
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !document.querySelector('.before-after')) closeRef.current()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
  const grip = {
    onPointerDown: (e: ReactPointerEvent<HTMLElement>) => {
      if ((e.target as Element).closest('button')) return
      e.currentTarget.setPointerCapture(e.pointerId)
      setDrag({ y0: e.clientY, dy: 0 })
    },
    onPointerMove: (e: ReactPointerEvent<HTMLElement>) => {
      if (drag) setDrag({ ...drag, dy: Math.max(0, e.clientY - drag.y0) })
    },
    onPointerUp: () => {
      if (drag && drag.dy > SHEET_CLOSE_DRAG) onClose()
      setDrag(null)
    },
    onPointerCancel: () => setDrag(null),
  }
  return (
    // Les gestes sur la feuille ne pilotent pas l'écran caméra dessous (regard du mode démo…).
    <div className="photo-sheet-layer" onPointerDown={(e) => e.stopPropagation()}>
      <button type="button" className="sheet-backdrop" aria-label="Fermer la fiche" onClick={onClose} />
      <section
        ref={dialog}
        tabIndex={-1}
        className={`photo-sheet ${drag ? 'dragging' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label={`Fiche de la photo · ${banner}`}
        style={drag ? { transform: `translateY(${drag.dy}px)` } : undefined}
      >
        <header className="photo-sheet-head" {...grip}>
          <span className="sheet-grip" aria-hidden="true" />
          <strong>{banner}</strong>
          <IconButton icon="close" label="Fermer la fiche et contempler la photo in situ" onClick={onClose} />
        </header>
        <div className="photo-sheet-scroll">
          <PhotoDetailView photo={photo} sheet onContemplate={onClose} />
        </div>
      </section>
    </div>
  )
}

/**
 * Fiche d'une photo, de haut en bas : la photo en grand (pile du lieu glissable), les actions,
 * l'auteur, la prise de vue, les photos liées, ma photo (réglages), les détails techniques.
 */
function PhotoDetailView({
  photo,
  section,
  sheet = false,
  onContemplate,
}: {
  photo: GeoPhoto
  section?: 'fil'
  /** Dans la feuille d'après capture : pas de pile, pas de chasse (on y est). */
  sheet?: boolean
  onContemplate?: () => void
}) {
  const { captures, isMine, profile } = useStore()
  const url = useImageUrl(photo.id, 'full')
  // Photos prises au même endroit : empilées, on les fait glisser.
  const here = usePhotosHere(photo)
  const deck = !sheet && here.length > 1
  const toast = useToast()
  const body = useRef<HTMLElement>(null)
  const [saving, setSaving] = useState(false)
  const [paywall, setPaywall] = useState(false)
  const mine = isMine(photo)
  const canSave = mine || canSaveOthersPhotos(profile)
  const captured = captures.some((c) => c.photoId === photo.id)
  const canReproduce = captured && isGeoframed(photo) && photo.visibility !== 'prive'
  const reproduce = () => navigate(`/reproduire/${photo.id}`, { replace: sheet })

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

  return (
    <>
      <div
        className={`detail-photo ${sheet ? 'in-sheet' : 'full'}`}
        style={url && !deck ? { backgroundImage: `url(${url})` } : undefined}
      >
        {deck && (
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
        {!sheet && <RoundButton icon="back" label="Retour" onClick={goBack} className="back-btn" />}
        <div className="detail-caption">
          <h1>{mine ? photo.title : photo.ownerName || 'Photo'}</h1>
          <p>{mine ? photoDate(photo) : photoTitleAndDate(photo)}</p>
          <div className="detail-meta">
            <LikeButton photo={photo} className="light" />
            {photo.versionOf && !deck && <VersionBadge className="light" />}
          </div>
        </div>
      </div>

      <section className="card white detail-body" ref={body}>
        {!sheet && (
          <button
            type="button"
            className="detail-handle"
            aria-label="Faire défiler jusqu’à la fiche de la photo"
            onClick={() => body.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
          >
            <span aria-hidden="true" />
          </button>
        )}

        <div className="detail-actions">
          {sheet ? (
            <>
              {canReproduce && (
                <button type="button" className="btn" onClick={reproduce}>
                  <Icon name="reproduce" /> Reproduire cette photo
                </button>
              )}
              <button type="button" className={`btn ${canReproduce ? 'ghost' : ''}`} onClick={onContemplate}>
                <Icon name="eye" /> Contempler in situ
              </button>
            </>
          ) : (
            <>
              {isGeoframed(photo) ? (
                <button type="button" className="btn" onClick={() => navigate(`/chasse/${photo.id}`)}>
                  <Icon name="flag" /> {captured ? 'Revoir in situ' : 'Capturer'}
                </button>
              ) : (
                mine && (
                  <button type="button" className="btn" onClick={() => navigate(`/recaler/${photo.id}`)}>
                    <Icon name="scan" /> Géocadrer sur place
                  </button>
                )
              )}
              {canReproduce && (
                <button type="button" className="btn ghost" onClick={reproduce}>
                  <Icon name="reproduce" /> Reproduire cette photo
                </button>
              )}
            </>
          )}
          <button type="button" className="btn ghost" onClick={() => void save()} disabled={saving}>
            <Icon name="download" /> {saving ? 'Enregistrement…' : 'Enregistrer sur mon téléphone'}
            {!canSave && <span className="premium-tag">Premium</span>}
          </button>
          {paywall && <PremiumCard reason="Enregistrer les photos des autres : PICTI Premium" />}
        </div>

        <AuthorBlock photo={photo} />
        <ShotBlock photo={photo} captured={captured} />

        {photo.versionOf && <ParentSection photo={photo} />}
        {/* Une reproduction n'a sa frise que si elle a elle-même été refaite ; une photo privée ne se reproduit pas. */}
        {isGeoframed(photo) && (photo.versionsCount > 0 || (!photo.versionOf && photo.visibility !== 'prive')) && (
          <TimelineSection photo={photo} focus={section === 'fil'} canReproduce={canReproduce} onReproduce={reproduce} />
        )}

        {mine && <MyPhotoBlock photo={photo} canDelete={!sheet} />}

        <TechnicalDetails photo={photo} mine={mine} />
      </section>
    </>
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

/** Qui a pris la photo : toute la ligne mène à son profil public ; bouton d'amitié à droite. Ma photo : « Vous ». */
function AuthorBlock({ photo }: { photo: GeoPhoto }) {
  const { isMine, profile } = useStore()
  const mine = isMine(photo)
  const author = usePublicProfile(mine ? null : photo.owner)
  const name = photo.ownerName || author?.name || 'Quelqu’un'
  if (mine) {
    return (
      <div className="author-block">
        <div className="author-row">
          <Avatar name={profile?.name ?? ''} size={48} />
          <span className="author-text">
            <strong>Vous</strong>
            {profile?.city && <span>{profile.city}</span>}
          </span>
        </div>
      </div>
    )
  }
  return (
    <div className="author-block">
      <button
        type="button"
        className="author-row link-row"
        onClick={() => navigate(`/personne/${photo.owner}`)}
        aria-label={`Photo ${ofName(name)}${author?.city ? `, ${author.city}` : ''} : voir son profil`}
      >
        <Avatar name={name} size={48} />
        <span className="author-text">
          <strong>{name}</strong>
          {author?.city && <span>{author.city}</span>}
        </span>
        <Icon name="back" size={20} className="chevron" />
      </button>
      <FriendButton person={{ id: photo.owner, name }} />
    </div>
  )
}

/** Date et heure de la prise de vue, distance d'ici, mode, selfie. */
function ShotBlock({ photo, captured }: { photo: GeoPhoto; captured: boolean }) {
  const { fix } = useGeolocation()
  const position = photo.geoframe?.position ?? photo.hintPosition
  const distance = fix && position ? distanceMeters(fix, position) : null
  const details = [
    distance != null ? `à ${formatDistance(distance)} d’ici` : null,
    photo.mode ? MODE_LABEL[photo.mode] : 'À géocadrer sur place',
    photo.selfie ? 'Selfie (caméra avant)' : null,
    captured ? 'Capturée in situ ✓' : null,
  ].filter(Boolean)
  return (
    <div className="shot-block">
      <p className="shot-date">{shotDateText(photo)}</p>
      <p className="shot-meta">{details.join(' · ')}</p>
      {photo.selfie && (
        <p className="shot-help">On le retrouve en visant, depuis la place du téléphone, l’endroit où posait son auteur.</p>
      )}
    </div>
  )
}

/**
 * Reproduction : « D'après la photo de … » — grande vignette de l'originale (auteur, date et heure
 * de prise, likes ; appui → sa fiche), « Avant / après », lien vers ses autres reproductions.
 * Originale supprimée ou devenue invisible : « Reproduction d'une photo qui n'est plus disponible ».
 */
function ParentSection({ photo }: { photo: GeoPhoto }) {
  const { isMine } = useStore()
  const { photo: parent, loading } = usePhoto(photo.versionOf!)
  const [compare, setCompare] = useState(false)
  if (!parent) {
    return (
      <section className="related missing">
        <VersionBadge />
        <span>{loading ? 'Reproduction · chargement de l’originale…' : 'Reproduction d’une photo qui n’est plus disponible'}</span>
      </section>
    )
  }
  const author = isMine(parent) ? 'Vous' : parent.ownerName || 'Quelqu’un'
  const others = otherVersionsText(parent.versionsCount)
  return (
    <section className="related" aria-labelledby="d-apres">
      <h2 className="related-title" id="d-apres">
        <VersionBadge /> {isMine(parent) ? 'D’après votre photo' : `D’après la photo ${ofName(author)}`}
      </h2>
      <PhotoTile
        id={parent.id}
        owner={parent.owner}
        size="wide"
        likes={parent.likesCount}
        version={parent.versionOf != null}
        badge="Originale"
        label={`Originale, ${isMine(parent) ? 'votre photo' : `photo ${ofName(author)}`} : voir sa fiche`}
        caption={
          <>
            <strong>{author}</strong>
            <br />
            {shotDateText(parent)}
          </>
        }
        onClick={() => navigate(`/photo/${parent.id}`)}
      />
      <div className="related-actions">
        <button type="button" className="btn small ghost" onClick={() => setCompare(true)}>
          Avant / après
        </button>
        {others && (
          <button type="button" className="link" onClick={() => navigate(`/photo/${parent.id}/fil`)}>
            {others}
          </button>
        )}
      </div>
      {compare && <BeforeAfter before={parent} after={photo} onClose={() => setCompare(false)} />}
    </section>
  )
}

/**
 * « Au fil du temps » : la photo elle-même, puis ses reproductions (celles que je peux voir), par
 * date de prise ; appui → leur fiche, « Avant / après » avec elle. Aucune : « Personne n'a encore
 * refait cette photo ».
 */
function TimelineSection({
  photo,
  focus,
  canReproduce,
  onReproduce,
}: {
  photo: GeoPhoto
  /** Arrivée par « Voir les autres reproductions » : la section défile jusqu'en haut de l'écran. */
  focus: boolean
  canReproduce: boolean
  onReproduce: () => void
}) {
  const { isMine } = useStore()
  const { versions, error } = useVersions(photo)
  const [compare, setCompare] = useState<GeoPhoto | null>(null)
  const ref = useRef<HTMLElement>(null)
  const ready = versions != null
  useEffect(() => {
    if (focus && ready) ref.current?.scrollIntoView({ block: 'start' })
  }, [focus, ready])

  const list = versions ? timelineOrder(photo, versions) : [photo]
  const visible = list.length - 1
  const hidden = hiddenVersionsText(photo.versionsCount, visible)
  const count = Math.max(photo.versionsCount, visible)
  const firstLabel = photo.versionOf ? 'Cette photo' : 'Originale'
  const who = (p: GeoPhoto) => (isMine(p) ? 'Vous' : p.ownerName || 'Quelqu’un')

  return (
    <section className="related timeline-section" ref={ref} aria-labelledby="au-fil-du-temps">
      <h2 className="related-title" id="au-fil-du-temps">
        Au fil du temps
        {count > 0 && <span> · {remadeText(count)}</span>}
      </h2>
      {!ready && !error ? (
        <p className="versions-note">Chargement…</p>
      ) : visible > 0 ? (
        <>
          <ol className="strip fil" aria-label="La photo et ses reproductions, par date de prise">
            {list.map((p, i) => (
              <li key={p.id} className="fil-item">
                <PhotoTile
                  id={p.id}
                  owner={p.owner}
                  size="strip"
                  likes={p.likesCount}
                  version={i > 0}
                  badge={i === 0 ? firstLabel : undefined}
                  label={`${i === 0 ? firstLabel : 'Reproduction'} ${ofName(who(p))}, ${formatDateTime(photoTime(p))}`}
                  caption={`${who(p)} · ${formatDateTime(photoTime(p), { short: true })}`}
                  onClick={() => navigate(`/photo/${p.id}`)}
                />
                {i > 0 && (
                  <button
                    type="button"
                    className="btn small ghost"
                    onClick={() => setCompare(p)}
                    aria-label={`Avant / après : la reproduction ${ofName(who(p))}`}
                  >
                    Avant / après
                  </button>
                )}
              </li>
            ))}
          </ol>
          {hidden && <p className="versions-note">{hidden}</p>}
        </>
      ) : count > 0 ? (
        <p className="versions-note">
          {count === 1 ? 'Une reproduction' : `${count} reproductions`} que vous ne pouvez pas voir.
        </p>
      ) : (
        <div className="fil-empty">
          <p>Personne n’a encore refait cette photo.</p>
          {canReproduce ? (
            <button type="button" className="btn small" onClick={onReproduce}>
              <Icon name="reproduce" size={18} /> Reproduire
            </button>
          ) : (
            photo.visibility !== 'prive' && (
              <p className="versions-note">
                {isMine(photo) ? 'Retrouvez-la sur place pour pouvoir la reproduire.' : 'Capturez-la sur place pour pouvoir la reproduire.'}
              </p>
            )
          )}
        </div>
      )}
      {error && <p className="versions-note">Reproductions indisponibles pour l’instant.</p>}
      {compare && <BeforeAfter before={photo} after={compare} onClose={() => setCompare(null)} />}
    </section>
  )
}

/** Mes réglages : titre, visibilité, distance du sujet, « Aimée par … », suppression. */
function MyPhotoBlock({ photo, canDelete }: { photo: GeoPhoto; canDelete: boolean }) {
  const { photos, updatePhoto, removePhoto } = useStore()
  const toast = useToast()
  const [renaming, setRenaming] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  // Reproduction : sa parente (chargée par `ParentSection`), qui plafonne sa visibilité.
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
    <section className="my-photo" aria-labelledby="ma-photo">
      <h2 className="related-title" id="ma-photo">
        Ma photo
      </h2>
      {renaming ? (
        <form
          className="rename"
          onSubmit={(e) => {
            e.preventDefault()
            void rename(new FormData(e.currentTarget).get('title') as string)
          }}
        >
          <input
            name="title"
            defaultValue={photo.title}
            aria-label="Titre de la photo"
            autoFocus
            maxLength={120}
            onBlur={(e) => void rename(e.target.value)}
          />
        </form>
      ) : (
        <div className="rename">
          <span>{photo.title || 'Sans titre'}</span>
          <button type="button" className="btn small ghost" onClick={() => setRenaming(true)}>
            <Icon name="pencil" size={16} /> Renommer
          </button>
        </div>
      )}

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

      {photo.likesCount > 0 && <LikersBlock photo={photo} />}

      {canDelete &&
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
  )
}

/** Statut, orientation, position (la mienne seulement), précision, focale, dimensions : repliés. */
function TechnicalDetails({ photo, mine }: { photo: GeoPhoto; mine: boolean }) {
  const g = photo.geoframe
  const position = g?.position ?? photo.hintPosition
  return (
    <details className="tech-details">
      <summary>Détails techniques</summary>
      <dl className="facts">
        <dt>Statut</dt>
        <dd>{photo.mode ? MODE_LABEL[photo.mode] : 'À géocadrer sur place'}</dd>
        {g && (
          <>
            <dt>Cap</dt>
            <dd>
              {fmt(g.heading)}° ({compassPoint(g.heading)}) · {g.headingSource === 'exif' ? 'EXIF' : 'boussole'}
            </dd>
            <dt>Inclinaison</dt>
            <dd>{g.pitchAssumed ? 'Supposée horizontale' : `${fmt(g.pitch)}°`}</dd>
            {!g.pitchAssumed && (
              <>
                <dt>Roulis</dt>
                <dd>{fmt(g.roll)}°</dd>
              </>
            )}
          </>
        )}
        {mine && position && (
          <>
            <dt>Position</dt>
            <dd>
              {fmt(position.lat, 5)}°, {fmt(position.lon, 5)}°
            </dd>
          </>
        )}
        {g?.accuracy != null && (
          <>
            <dt>Précision</dt>
            <dd>±{fmt(g.accuracy)} m</dd>
          </>
        )}
        <dt>Focale</dt>
        <dd>≈ {fmt(photo.focal35)} mm (équiv. 24×36)</dd>
        <dt>Dimensions</dt>
        <dd>
          {photo.width} × {photo.height} px
        </dd>
      </dl>
    </details>
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
          <li key={l.userId}>
            <button
              type="button"
              className="name-link"
              onClick={() => navigate(`/personne/${l.userId}`)}
              title={l.onSite ? 'Aimée sur place (capturée)' : undefined}
              aria-label={`${l.name || 'Quelqu’un'}${l.onSite ? ', aimée sur place' : ''} : voir son profil`}
            >
              {l.name || 'Quelqu’un'}
              {l.onSite && <Icon name="pin" size={12} />}
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}

/** Avant / après : la reproduction glisse sur l'originale (curseur, ou le doigt sur l'image). */
function BeforeAfter({ before, after, onClose }: { before: GeoPhoto; after: GeoPhoto; onClose: () => void }) {
  useBackCloses(onClose)
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
    <div className="before-after" role="dialog" aria-modal="true" aria-label="Avant / après" onPointerDown={(e) => e.stopPropagation()}>
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
      <button type="button" className="btn light" onClick={onClose} autoFocus>
        Fermer
      </button>
    </div>,
    document.getElementById('root') ?? document.body,
  )
}
