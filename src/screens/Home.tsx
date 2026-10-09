import { useEffect, useMemo, useRef, useState } from 'react'
import { ReproduceCrosshairs } from '../components/ReproduceCrosshairs'
import { viewportCamera, type GeoframedPhoto } from '../components/arProjection'
import { ArSpotsLayer } from '../components/ArSpotsLayer'
import { Icon } from '../components/Icon'
import { PreciseLocationNotice } from '../components/PreciseLocationNotice'
import { SensorStatus } from '../components/SensorStatus'
import { Shutter } from '../components/Shutter'
import { useElementSize } from '../components/useElementSize'
import { useReproduceStatus } from '../components/useReproduceStatus'
import { DirectionArrow, RoundButton, Sheet, Thumb } from '../components/ui'
import { useToast } from '../components/toastContext'
import { CELEBRATION_MS } from '../components/useCapture'
import { useImageUrl } from '../data/imageUrls'
import { unreadCount } from '../data/notifications'
import { createDirectPhoto, type NewPhoto } from '../data/pipeline'
import { viewOf } from '../data/photoSpots'
import { outOfViewMessage, reproduceAlert, vaguePositionMessage, viewpointAt } from '../data/shotWarnings'
import { setShotVisibility, takeVisibilityHint, useShotVisibility } from '../data/shotVisibility'
import { useStore } from '../data/storeContext'
import { isGeoframed, ofName, VISIBLE_BY, type GeoPhoto } from '../data/types'
import { computeAlignment } from '../geo/alignment'
import { distanceMeters, formatDistance } from '../geo/geodesy'
import { angleDiffDeg, clamp } from '../geo/math'
import { coverViewport, focalPx, FRONT_PHONE_FOCAL35 } from '../geo/optics'
import { anglesFromBasis, frontCameraBasis, type CameraAngles } from '../geo/orientation'
import { reproduceStatus, type ReproduceState } from '../geo/reproduce'
import { GPS_GOOD_ACCURACY } from '../geo/tracking'
import { useNearbyRefresh } from '../data/useNearbyRefresh'
import { goBack, navigate } from '../router'
import type { CameraFacing } from '../sensors/useCamera'
import { trackArShot } from '../sensors/arTracking'
import { useViewfinder } from '../sensors/useViewfinder'
import type { NativeArPose } from '../native'
import { ImportSheet } from './ImportSheet'
import { MenuSheet } from './MenuSheet'
import { PhotoSheet } from './PhotoDetail'

/**
 * Prise de vue suspendue à un choix (feuille) : l'image est figée à l'écran dès le déclenchement.
 * - `view` : « Reproduire », déclenché hors de la vue de l'originale ;
 * - `gps` : position imprécise (au-delà de `GPS_GOOD_ACCURACY`).
 */
interface HeldShot {
  kind: 'view' | 'gps'
  shot: NewPhoto
  /** Précision du GPS au déclenchement (m). */
  accuracy: number
  /** Hors de la vue : l'état au déclenchement (distance, cause). */
  check: ReproduceState | null
  /** Suivi visuel : pose de l'image (la photo sera replacée quand le calage s'affine). */
  pose?: NativeArPose
}

/** Miniature de la photo qu'on vient de prendre, dans le coin bas-gauche (ms). */
const LAST_SHOT_MS = 5000

/**
 * Accueil : le viseur, point de départ du géocadrage en direct. Avec `reproduce` (bouton
 * « Reproduire cette photo ») : la photo d'origine en calque semi-transparent et les deux croix
 * d'orientation ; le rattachement reste décidé par les règles existantes.
 */
export function Home({ reproduce }: { reproduce?: GeoframedPhoto }) {
  const [sheet, setSheet] = useState<'import' | 'menu' | null>(null)
  const [flash, setFlash] = useState(false)
  const [busy, setBusy] = useState(false)
  const [reproduceOpacity, setReproduceOpacity] = useState(0.5)
  // Un selfie se reproduit avec la caméra avant.
  const [facing, setFacing] = useState<CameraFacing>(reproduce?.selfie ? 'user' : 'environment')
  const selfie = facing === 'user'
  const [stageRef, stage] = useElementSize<HTMLDivElement>()
  // Caméra, position et orientation : suivi visuel d'ARKit dans l'app iPhone (les photos restent à
  // leur place au centimètre près) ; sinon caméra web, position suivie image par image (et pas à pas)
  // et boussole, avec la focale de la caméra principale mesurée en tournant le téléphone.
  const { camera, geo, orientation, position, focal35, ar } = useViewfinder({ stage: stageRef, facing, calibrateFocal: true })
  const { videoRef, status: cameraStatus, error: cameraError, size: cameraSize, capture } = camera
  const { addPhoto, addCapture, nearby, captures, isMine, photos, friends, notifications } = useStore()
  const unread = unreadCount(notifications)
  const toast = useToast()
  // Mode des prochaines photos (Public · Amis · Privé) : appui long sur le déclencheur, puis glisser.
  const visibility = useShotVisibility()
  // Photo capturée depuis le viseur : sa fiche monte en feuille après la célébration ; « Fiche » la rouvre.
  const [captureSheet, setCaptureSheet] = useState<{ id: string; open: boolean } | null>(null)
  const sheetPhoto = captureSheet ? photos.find((p) => p.id === captureSheet.id) : undefined
  // Photo que je viens de prendre : miniature (comme l'appareil photo de l'iPhone), appui = sa fiche.
  const [lastShot, setLastShot] = useState<string | null>(null)
  useEffect(() => {
    if (!lastShot) return
    const t = setTimeout(() => setLastShot(null), LAST_SHOT_MS)
    return () => clearTimeout(t)
  }, [lastShot])
  // Demandes d'ami reçues : pastille sur le bouton du menu.
  const friendRequests = friends.filter((f) => f.status === 'pending' && !f.outgoing).length
  useNearbyRefresh(geo.fix)

  // Orientation enregistrée avec la photo : celle de l'objectif avant pour un selfie.
  const shotAngles: CameraAngles | null = selfie
    ? orientation.basis && anglesFromBasis(frontCameraBasis(orientation.basis))
    : orientation.angles
  const here = position ?? geo.fix
  // Reproduire : où en est-on par rapport à la vue de l'originale (calculé en continu).
  const parentView = useMemo(() => (reproduce ? viewOf(reproduce) : null), [reproduce])
  const status = useReproduceStatus(parentView, here, orientation.absolute ? shotAngles : null)
  // « Vous avez quitté le lieu » : la carte s'efface sur « Y retourner », jusqu'au retour.
  const [lostSeen, setLostSeen] = useState(false)
  if (lostSeen && status?.view !== 'lost') setLostSeen(false)
  // Image figée et choix en attente ; attente d'un GPS précis (« Attendre »).
  const [frozen, setFrozen] = useState<string | null>(null)
  const [held, setHeld] = useState<HeldShot | null>(null)
  const [waitGps, setWaitGps] = useState(false)
  useEffect(() => () => {
    if (frozen) URL.revokeObjectURL(frozen)
  }, [frozen])
  const release = () => {
    setHeld(null)
    setFrozen(null)
  }
  // « Attendre » : la photo se prend d'elle-même dès que le GPS redevient précis.
  const liveAccuracy = here?.accuracy ?? null
  const shootRef = useRef(shoot)
  useEffect(() => {
    shootRef.current = shoot
  })
  useEffect(() => {
    if (!waitGps || busy || held || liveAccuracy == null || liveAccuracy > GPS_GOOD_ACCURACY) return
    // `shoot` met fin à l'attente.
    void shootRef.current({ skipGps: true })
  }, [waitGps, busy, held, liveAccuracy])

  // Photos d'autres utilisateurs à chasser autour de soi.
  const captured = new Set(captures.map((c) => c.photoId))
  const toHunt = photos.filter((p) => nearby.has(p.id) && !isMine(p) && !captured.has(p.id)).length
  // Toutes les photos géocadrées connues (le viseur ne garde que celles d'alentour) :
  // une photo qu'on vient de prendre y apparaît aussitôt, sans attendre la recherche à proximité.
  const arPhotos = useMemo(() => photos.filter((p): p is GeoframedPhoto => isGeoframed(p)), [photos])

  /**
   * Capture depuis le viseur : la photo visée, d'un autre, s'est agrandie jusqu'à couvrir l'écran
   * (lancée à moins de 5 m de son point de vue, voir `ArSpotsLayer`) ; on l'enregistre, puis sa
   * fiche monte en feuille une fois la célébration passée.
   */
  async function captureHere(p: GeoPhoto): Promise<boolean> {
    if (!isGeoframed(p)) return false
    const started = performance.now()
    const g = p.geoframe
    // Score conservé avec la capture : l'alignement du moment, comme en chasse.
    const { score } = computeAlignment(
      { position: g.position, angles: { heading: g.heading, pitch: g.pitch, roll: g.roll } },
      { position: position ?? geo.fix, angles: orientation.angles },
    )
    try {
      await addCapture(p.id, score)
      // Capturer = aimer sur place : la fiche le dit et propose de la reproduire.
      const wait = Math.max(0, CELEBRATION_MS - (performance.now() - started))
      setTimeout(() => setCaptureSheet({ id: p.id, open: true }), wait)
      return true
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Capture impossible')
      return false
    }
  }

  async function shoot({ skipGps = false }: { skipGps?: boolean } = {}) {
    if (busy || held) return
    setWaitGps(false)
    if (orientation.status === 'needs-permission') {
      // iOS : l'accès à la boussole ne peut être demandé que sur un geste.
      const granted = await orientation.requestPermission()
      toast(granted ? 'Boussole activée : vous pouvez géocadrer' : 'Sans boussole, vos photos seront à géocadrer sur place')
      if (granted) return
    }
    if (cameraStatus !== 'ready') {
      toast(cameraError ?? 'La caméra démarre…')
      return
    }
    setBusy(true)
    setFlash(true)
    setTimeout(() => setFlash(false), 160)
    let kept = false
    try {
      const frame = await capture()
      // Position et orientation du déclenchement : celles qui seront enregistrées.
      const fix = here
      const angles = shotAngles
      const located = fix != null && angles != null && orientation.absolute
      // Reproduire : la règle exacte de `version_of` (`sameView`), pas l'état affiché (amorti).
      const check =
        located && parentView
          ? reproduceStatus({ position: fix, heading: angles.heading, pitch: angles.pitch, time: Date.now() }, parentView, fix.accuracy, null)
          : null
      const kind: HeldShot['kind'] | null =
        check && !check.inView ? 'view' : located && !skipGps && fix.accuracy > GPS_GOOD_ACCURACY ? 'gps' : null
      // Un choix à faire : l'image est figée tout de suite, le moment n'est pas perdu.
      if (kind) setFrozen(URL.createObjectURL(frame.blob))
      const shot = await createDirectPhoto(
        frame,
        { fix, angles, absolute: orientation.absolute },
        // Focale de l'image prise (suivi visuel : celle de l'image haute résolution).
        { selfie, focal35: selfie ? FRONT_PHONE_FOCAL35 : (frame.focal35 ?? focal35) },
      )
      if (kind && fix) {
        setHeld({ kind, shot, accuracy: fix.accuracy, check, pose: frame.pose })
        kept = true
        return
      }
      await save(shot, { pose: frame.pose })
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Capture impossible')
    } finally {
      if (!kept) setFrozen(null)
      setBusy(false)
    }
  }

  /**
   * Enregistre la photo prise ; `classic` : jamais rattachée à l'originale (« Garder en photo
   * classique ») ; `pose` : prise avec le suivi visuel, elle sera replacée quand le calage s'affine.
   */
  async function save({ photo, images }: NewPhoto, { classic = false, pose }: { classic?: boolean; pose?: NativeArPose } = {}) {
    const saved = await addPhoto(photo, images, { visibility, versionOf: classic ? null : reproduce?.id })
    if (pose && saved.geoframe) trackArShot(saved.id, pose, saved.geoframe)
    navigator.vibrate?.(30)
    const kind = selfie ? 'Selfie' : 'Photo'
    if (reproduce && saved.versionOf === reproduce.id) {
      // Reproduction réussie : sa fiche montre l'originale et le curseur avant / après.
      toast(`Reproduction enregistrée · visible par ${VISIBLE_BY[saved.visibility]}`)
      navigate(`/photo/${saved.id}`, { replace: true })
    } else if (reproduce && photo.geoframe) {
      // Gardée hors de la vue, ou refusée comme reproduction par la base (GPS qui a sauté) :
      // elle n'est jamais perdue, et on le dit.
      toast(
        classic
          ? `${selfie ? 'Selfie enregistré' : 'Enregistrée'} comme photo classique`
          : `${selfie ? 'Selfie enregistré' : 'Enregistrée'} comme photo classique : vous n’étiez plus dans la vue de l’originale`,
        { label: 'Voir', to: `/photo/${saved.id}` },
      )
    } else if (photo.geoframe) {
      // Miniature dans le coin (appui = sa fiche, où l'on change la visibilité) : pas de bouton au toast.
      setLastShot(saved.id)
      const accuracy = photo.geoframe.accuracy
      // GPS imprécis (« Prendre quand même ») : la photo pourra paraître décalée.
      const vague = accuracy != null && accuracy > GPS_GOOD_ACCURACY
      // Tombée dans la vue d'une photo existante : c'en est une reproduction (↻).
      const parent = saved.versionOf ? photos.find((p) => p.id === saved.versionOf) : undefined
      const sameView = parent ? ` · ↻ même vue que ${isMine(parent) ? 'votre photo' : `la photo ${ofName(parent.ownerName || 'quelqu’un')}`}` : ''
      const published = `${selfie ? 'Selfie géocadré' : 'Photo géocadrée'} · visible par ${VISIBLE_BY[saved.visibility]}${sameView}`
      // Les premières fois : comment changer de mode, puisque rien ne l'affiche à l'écran.
      const hint = !vague && takeVisibilityHint() ? ' — restez appuyé sur le déclencheur pour changer' : ''
      toast(vague ? `${published} — GPS à ±${Math.round(accuracy!)} m : elle pourra paraître décalée` : published + hint)
    } else {
      const missing = !geo.fix ? 'position GPS' : 'boussole'
      const text = `${kind} ${selfie ? 'gardé' : 'gardée'} sans ${missing} : à géocadrer sur place`
      // En mode « Reproduire », le coin bas-gauche est le bouton ✕ : le toast garde « Voir ».
      if (reproduce) toast(text, { label: 'Voir', to: `/photo/${saved.id}` })
      else {
        setLastShot(saved.id)
        toast(text)
      }
    }
  }

  /** Choix fait sur la feuille : enregistrer l'image figée (`classic` : sans la rattacher). */
  async function keepHeld(classic: boolean) {
    if (!held) return
    const { shot, pose } = held
    setHeld(null)
    setBusy(true)
    try {
      await save(shot, { classic, pose })
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Enregistrement impossible')
    } finally {
      setFrozen(null)
      setBusy(false)
    }
  }

  // Mode « Reproduire » : bandeau, calque pâli hors de la vue, masqué quand le lieu est quitté.
  const away = status?.view === 'out' || status?.view === 'lost'
  const lostCard = status?.view === 'lost' && !lostSeen
  // Sens où l'on regarde (caméra principale, même en selfie : on tient l'écran devant soi).
  const looking = orientation.angles?.heading ?? null
  const alert = status ? reproduceAlert(status) : null
  // Flèche du bandeau : vers le point de vue, ou le sens où tourner / incliner le téléphone.
  const alertArrow = !status || !alert
    ? null
    : status.view === 'out' && status.reason === 'heading'
      ? clamp(status.headingError, -90, 90)
      : status.view === 'out' && status.reason === 'pitch'
        ? status.pitchError > 0 ? 0 : 180
        : status.bearing != null && looking != null
          ? angleDiffDeg(looking, status.bearing)
          : null

  return (
    <main className={`screen viewfinder ${reproduce ? 'reproduce-viewfinder' : ''}`}>
      <div className="camera-stage" ref={stageRef}>
        {/* Monde en couleur ; les photos des autres restent en noir et blanc jusqu'à leur capture.
            Selfie : aperçu en miroir, comme un reflet ; la photo prise, elle, n'est pas inversée. */}
        <video ref={videoRef} className={`camera-video ${selfie ? 'mirror' : ''}`} playsInline muted autoPlay />
        {cameraStatus === 'error' && (
          <div className="camera-fallback">
            <Icon name="image" size={40} />
            <p>{cameraError}</p>
          </div>
        )}
        {reproduce && status?.view !== 'lost' && (
          <ReproduceOverlay
            photo={reproduce}
            stage={stage}
            cameraSize={cameraSize}
            focal35={selfie ? FRONT_PHONE_FOCAL35 : focal35}
            dim={away}
            opacity={reproduceOpacity}
            mirror={selfie}
          />
        )}
        {reproduce && cameraStatus === 'ready' && !sheet && !held && !frozen && !lostCard && !captureSheet?.open && (
          <ReproduceCrosshairs
            target={reproduce.geoframe}
            orientation={orientation}
            cam={viewportCamera(stage, cameraSize, selfie ? FRONT_PHONE_FOCAL35 : focal35)}
            selfie={selfie}
          />
        )}
        {/* Image figée au déclenchement, le temps de choisir. */}
        {frozen && <img className={`frozen-shot ${selfie ? 'mirror' : ''}`} src={frozen} alt="" />}
        {/* Les photos flottent dans le décor vu par la caméra principale, pas dans le selfie. */}
        {!sheet && !selfie && !reproduce && (
          <ArSpotsLayer
            photos={arPhotos}
            fix={position}
            basis={orientation.absolute ? orientation.basis : null}
            cam={viewportCamera(stage, cameraSize, focal35)}
            isMine={isMine}
            onOpen={(p) => navigate(`/photo/${p.id}`)}
            onHunt={(p) => navigate(`/chasse/${p.id}`)}
            onGallery={(p) => navigate(`/galerie/${p.id}`)}
            onCapture={captureHere}
            actionFor={(p) =>
              captureSheet?.id === p.id && !captureSheet.open
                ? { label: 'Fiche', onClick: () => setCaptureSheet({ id: p.id, open: true }) }
                : null
            }
          />
        )}
        {flash && <div className="flash" />}
      </div>
      {reproduce && status?.view !== 'lost' && (
        <label className="slider reproduce-opacity">
          <Icon name="eye" size={18} />
          <input type="range" min={0.1} max={0.9} step={0.05} value={reproduceOpacity}
            onChange={(e) => setReproduceOpacity(Number(e.target.value))} aria-label="Opacité de la photo d’origine" />
        </label>
      )}

      {reproduce ? (
        <ReproduceGuide
          target={reproduce}
          position={here}
          alert={lostCard ? null : alert}
          alertArrow={alertArrow}
          compassAction={orientation.status === 'needs-permission' || orientation.status === 'denied'
            ? () => void orientation.requestPermission() : undefined}
        />
      ) : (
        <SensorStatus geo={geo} orientation={orientation} position={position} visual={ar.oriented} />
      )}

      {!reproduce && (
      <nav className="rail" aria-label="Explorer">
        <RoundButton
          icon="bell"
          label={unread ? `Notifications (${unread} non lue${unread > 1 ? 's' : ''})` : 'Notifications'}
          onClick={() => navigate('/notifications')}
          dim={!!sheet}
          badge={unread}
        />
        <RoundButton
          icon="pin"
          label="Carte des photos"
          onClick={() => navigate('/carte')}
          dim={!!sheet}
          badge={toHunt}
        />
        <RoundButton icon="filter" label="Filtrer" onClick={() => navigate('/recherche?filtres')} dim={!!sheet} />
        <RoundButton icon="search" label="Rechercher" onClick={() => navigate('/recherche')} dim={!!sheet} />
        <RoundButton
          icon="flipCamera"
          label={selfie ? 'Revenir à la caméra principale' : 'Prendre un selfie (caméra avant)'}
          onClick={() => setFacing(selfie ? 'environment' : 'user')}
          dim={!!sheet}
          className={selfie ? 'active' : ''}
        />
      </nav>
      )}

      {selfie && !sheet && !reproduce && (
        <p className="selfie-hint"><strong>Selfie</strong> · on le retrouvera en visant, depuis la place du téléphone, l’endroit où vous vous tenez</p>
      )}

      {waitGps && (
        <div className="gps-wait" role="status">
          <span>
            En attente d’une position précise{liveAccuracy != null && ` (±${Math.round(liveAccuracy)}\u00a0m)`} : la photo
            sera prise dès qu’elle passera sous {GPS_GOOD_ACCURACY}&nbsp;m
          </span>
          <button type="button" onClick={() => setWaitGps(false)}>
            Annuler
          </button>
        </div>
      )}

      <div className="bottom-bar">
        {reproduce ? (
          <RoundButton icon="close" label="Arrêter de reproduire" onClick={goBack} />
        ) : lastShot ? (
          <button
            type="button"
            className="last-shot"
            onClick={() => navigate(`/photo/${lastShot}`)}
            aria-label="Voir la fiche de la photo que vous venez de prendre"
          >
            <Thumb id={lastShot} />
          </button>
        ) : (
          <RoundButton icon="plus" label="Géocadrer en différé (importer)" onClick={() => setSheet('import')} />
        )}
        <Shutter
          visibility={visibility}
          onVisibility={setShotVisibility}
          onShoot={() => void shoot()}
          disabled={busy || !!held}
          warn={away}
          label={`${selfie ? 'Géocadrer en direct (prendre un selfie)' : 'Géocadrer en direct (prendre une photo)'}${away ? ' — hors de la vue de la photo d’origine' : ''}`}
        />
        {reproduce ? (
          <RoundButton
            icon="flipCamera"
            label={selfie ? 'Revenir à la caméra principale' : 'Caméra avant'}
            onClick={() => setFacing(selfie ? 'environment' : 'user')}
            className={selfie ? 'active' : ''}
          />
        ) : (
          <RoundButton icon="grid" label="Menu" onClick={() => setSheet('menu')} badge={friendRequests} />
        )}
      </div>

      {sheet === 'import' && <ImportSheet onClose={() => setSheet(null)} fix={geo.fix} />}
      {sheet === 'menu' && <MenuSheet onClose={() => setSheet(null)} />}
      {captureSheet?.open && sheetPhoto && (
        <PhotoSheet
          photo={sheetPhoto}
          banner={isMine(sheetPhoto) ? 'Retrouvée ✓' : 'Capturée ✓ · aimée sur place'}
          onClose={() => setCaptureSheet({ id: sheetPhoto.id, open: false })}
        />
      )}

      {lostCard && status && (
        <div className="captured" role="alertdialog" aria-label="Lieu de la photo quitté">
          <div className="captured-card lost-card">
            <Icon name="pin" size={32} />
            <h2>Vous avez quitté le lieu de la photo</h2>
            <p>{viewpointAt(status)}</p>
            <div className="captured-actions">
              <button type="button" className="btn" onClick={() => setLostSeen(true)}>
                {status.bearing != null && looking != null && <DirectionArrow deg={angleDiffDeg(looking, status.bearing)} />}
                Y retourner
              </button>
              <button type="button" className="btn ghost" onClick={goBack}>
                Quitter Reproduire
              </button>
            </div>
          </div>
        </div>
      )}

      {held?.kind === 'view' && held.check && (
        <Sheet onClose={release} label="Hors de la vue de la photo d’origine">
          <div className="shot-sheet">
            <Icon name="warning" size={28} />
            <p>{outOfViewMessage(held.check, reproduce?.ownerName ?? '')}</p>
            <button type="button" className="btn" onClick={release}>
              <Icon name="reproduce" /> Revenir au point de vue
            </button>
            <button type="button" className="btn ghost" onClick={() => void keepHeld(true)}>
              Garder en photo classique
            </button>
          </div>
        </Sheet>
      )}
      {held?.kind === 'gps' && (
        <Sheet onClose={release} label="Position imprécise">
          <div className="shot-sheet">
            <Icon name="pin" size={28} />
            <p>{vaguePositionMessage(held.accuracy)}</p>
            <button
              type="button"
              className="btn"
              onClick={() => {
                release()
                setWaitGps(true)
              }}
            >
              Attendre
            </button>
            <button type="button" className="btn ghost" onClick={() => void keepHeld(false)}>
              Prendre quand même
            </button>
          </div>
        </Sheet>
      )}

      <PreciseLocationNotice geo={geo} />
    </main>
  )
}

/**
 * Calque de la photo à reproduire : affichée avec son champ de vision réel, centrée, comme pour le
 * géocadrage sur place (Recaler) — le décor coïncide quand on a retrouvé son cadrage. Opacité
 * réglable au doigt.
 */
function ReproduceOverlay({
  photo,
  stage,
  cameraSize,
  focal35,
  dim,
  opacity,
  mirror,
}: {
  photo: GeoframedPhoto
  stage: { width: number; height: number }
  cameraSize: { width: number; height: number } | null
  focal35: number
  /** Hors de la vue : calque plus pâle. */
  dim: boolean
  opacity: number
  mirror: boolean
}) {
  const url = useImageUrl(photo.id, 'full')
  if (!url || !stage.width) return null
  const camFocal = cameraSize
    ? coverViewport(cameraSize.width, cameraSize.height, stage.width, stage.height, focal35).focal
    : focalPx(focal35, stage.width, stage.height)
  const k = camFocal / focalPx(photo.focal35, photo.width, photo.height)
  const w = photo.width * k
  const h = photo.height * k
  return (
      <img
        className="align-photo reproduce-photo"
        src={url}
        alt=""
        style={{ transform: mirror ? 'scaleX(-1)' : undefined, width: w, height: h, left: (stage.width - w) / 2, top: (stage.height - h) / 2, opacity: dim ? opacity * 0.35 : opacity }}
        draggable={false}
      />
  )
}

/**
 * En-tête du mode « Reproduire » : consigne, bandeau quand on s'éloigne de la vue de l'originale
 * (orange au bord, rouge hors de la vue), pastille du GPS imprécis et distance, indépendantes des croix.
 */
function ReproduceGuide({
  target,
  position,
  alert,
  alertArrow,
  compassAction,
}: {
  target: GeoframedPhoto
  position: Parameters<typeof computeAlignment>[1]['position']
  alert: ReturnType<typeof reproduceAlert>
  alertArrow: number | null
  compassAction?: () => void
}) {
  return (
    <header className="reproduce-guide">
      <div className="guide">
        <Icon name="reproduce" />
        <div>
          <strong>Reproduire la photo</strong>
          <span>Photo {ofName(target.ownerName || 'quelqu’un')} · superposez-la au décor</span>
        </div>
      </div>
      {alert && (
        <div className={`reproduce-alert ${alert.tone}`} role="status">
          {alertArrow != null && <DirectionArrow deg={alertArrow} size={18} />}
          <strong>{alert.text}</strong>
        </div>
      )}
      {position && position.accuracy > GPS_GOOD_ACCURACY && (
        <span className="reproduce-chip" role="status">
          <Icon name="pin" size={14} /> GPS imprécis (±{Math.round(position.accuracy)} m), patientez
        </span>
      )}
      <span className="reproduce-distance">
        <Icon name="pin" size={14} /> {position ? `Point de vue à ${formatDistance(distanceMeters(position, target.geoframe.position))}` : 'Recherche de votre position…'}
      </span>
      {compassAction && <button type="button" className="btn ghost" onClick={compassAction}>Activer la boussole</button>}
    </header>
  )
}
