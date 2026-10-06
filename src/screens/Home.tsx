import { useEffect, useMemo, useState } from 'react'
import { AlignGauges } from '../components/ar'
import { viewportCamera, type GeoframedPhoto } from '../components/arProjection'
import { ArSpotsLayer } from '../components/ArSpotsLayer'
import { Icon } from '../components/Icon'
import { SensorStatus } from '../components/SensorStatus'
import { useElementSize } from '../components/useElementSize'
import { RoundButton, Thumb } from '../components/ui'
import { useToast } from '../components/toastContext'
import { CELEBRATION_MS } from '../components/useCapture'
import { VisibilityPill } from '../components/VisibilityPill'
import { useImageUrl } from '../data/imageUrls'
import { unreadCount } from '../data/notifications'
import { createDirectPhoto } from '../data/pipeline'
import { setShotVisibility, useShotVisibility } from '../data/shotVisibility'
import { useStore } from '../data/storeContext'
import { isGeoframed, ofName, VISIBLE_BY, type GeoPhoto } from '../data/types'
import { computeAlignment, guidance } from '../geo/alignment'
import { coverViewport, focalPx, FRONT_PHONE_FOCAL35 } from '../geo/optics'
import { anglesFromBasis, frontCameraBasis } from '../geo/orientation'
import { useNearbyRefresh } from '../data/useNearbyRefresh'
import { goBack, navigate } from '../router'
import { useCameraFocal } from '../sensors/cameraFocal'
import { useCamera, type CameraFacing } from '../sensors/useCamera'
import { useFocalCalibration } from '../sensors/useFocalCalibration'
import { useGeolocation } from '../sensors/useGeolocation'
import { useLivePosition } from '../sensors/useLivePosition'
import { useOrientation } from '../sensors/useOrientation'
import { ImportSheet } from './ImportSheet'
import { MenuSheet } from './MenuSheet'
import { PhotoSheet } from './PhotoDetail'

/** Précision GPS (m) au-delà de laquelle une photo prise risque d'être mal placée. */
const PRECISE_FIX = 15

/** Miniature de la photo qu'on vient de prendre, dans le coin bas-gauche (ms). */
const LAST_SHOT_MS = 5000

/**
 * Accueil : le viseur, point de départ du géocadrage en direct. Avec `reproduce` (bouton
 * « Reproduire cette photo ») : la photo d'origine en calque semi-transparent et les jauges
 * d'alignement de la chasse ; la photo prise en devient une version.
 */
export function Home({ reproduce }: { reproduce?: GeoframedPhoto }) {
  const [sheet, setSheet] = useState<'import' | 'menu' | null>(null)
  const [flash, setFlash] = useState(false)
  const [busy, setBusy] = useState(false)
  // Un selfie se reproduit avec la caméra avant.
  const [facing, setFacing] = useState<CameraFacing>(reproduce?.selfie ? 'user' : 'environment')
  const selfie = facing === 'user'
  const { videoRef, status: cameraStatus, error: cameraError, size: cameraSize, capture } = useCamera(true, facing)
  const [stageRef, stage] = useElementSize<HTMLElement>()
  const geo = useGeolocation()
  const orientation = useOrientation()
  // Position suivie image par image (et pas à pas) : les photos restent à leur place quand on marche.
  const position = useLivePosition(geo.track, orientation.absolute ? orientation.basis : null)
  // Focale de la caméra principale, mesurée en tournant le téléphone.
  const { focal35 } = useCameraFocal()
  useFocalCalibration(videoRef, orientation.angles, !selfie && cameraStatus === 'ready' && orientation.absolute)
  const { addPhoto, addCapture, nearby, captures, isMine, photos, profile, friends, notifications } = useStore()
  const unread = unreadCount(notifications)
  const toast = useToast()
  // Visibilité de la prochaine photo : réglage du profil, ou choix fait avec la pastille.
  const visibility = useShotVisibility(profile?.defaultVisibility ?? 'amis')
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

  async function shoot() {
    if (busy) return
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
    try {
      const frame = await capture()
      // Selfie : on géocadre l'objectif avant, qui regarde à l'opposé du téléphone.
      const angles = selfie
        ? orientation.basis && anglesFromBasis(frontCameraBasis(orientation.basis))
        : orientation.angles
      const { photo, images } = await createDirectPhoto(
        frame,
        { fix: position ?? geo.fix, angles, absolute: orientation.absolute },
        { selfie, focal35: selfie ? FRONT_PHONE_FOCAL35 : focal35 },
      )
      const saved = await addPhoto(photo, images, { visibility, versionOf: reproduce?.id })
      navigator.vibrate?.(30)
      if (reproduce && saved.versionOf === reproduce.id) {
        // Reproduction réussie : sa fiche montre l'originale et le curseur avant / après.
        toast(`Reproduction enregistrée · visible par ${VISIBLE_BY[saved.visibility]}`)
        navigate(`/photo/${saved.id}`, { replace: true })
      } else if (reproduce && photo.geoframe) {
        toast(`${selfie ? 'Selfie' : 'Photo'} enregistrée, mais trop loin du cadrage de l’originale : pas rattachée`, {
          label: 'Voir',
          to: `/photo/${saved.id}`,
        })
      } else if (photo.geoframe) {
        setLastShot(saved.id)
        const accuracy = photo.geoframe.accuracy
        // GPS encore imprécis (premières secondes, intérieur) : la photo pourra paraître décalée.
        const vague = accuracy != null && accuracy > PRECISE_FIX
        // Où elle est publiée (la miniature ouvre sa fiche, où l'on change la visibilité).
        // Tombée dans la vue d'une photo existante : c'en est une reproduction (↻).
        const parent = saved.versionOf ? photos.find((p) => p.id === saved.versionOf) : undefined
        const sameView = parent ? ` · ↻ même vue que ${isMine(parent) ? 'votre photo' : `la photo ${ofName(parent.ownerName || 'quelqu’un')}`}` : ''
        const published = `${selfie ? 'Selfie géocadré' : 'Photo géocadrée'} · visible par ${VISIBLE_BY[saved.visibility]}${sameView}`
        toast(vague ? `${published} — GPS à ±${Math.round(accuracy!)} m : elle pourra paraître décalée` : published)
      } else {
        const missing = !geo.fix ? 'position GPS' : 'boussole'
        const kind = selfie ? 'Selfie gardé' : 'Photo gardée'
        const text = `${kind} sans ${missing} : à géocadrer sur place`
        if (reproduce) toast(text, { label: 'Voir', to: `/photo/${saved.id}` })
        else {
          setLastShot(saved.id)
          toast(text)
        }
      }
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Capture impossible')
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="screen viewfinder" ref={stageRef}>
      {/* Monde en couleur ; les photos des autres restent en noir et blanc jusqu'à leur capture.
          Selfie : aperçu en miroir, comme un reflet ; la photo prise, elle, n'est pas inversée. */}
      <video ref={videoRef} className={`camera-video ${selfie ? 'mirror' : ''}`} playsInline muted autoPlay />
      {cameraStatus === 'error' && (
        <div className="camera-fallback">
          <Icon name="image" size={40} />
          <p>{cameraError}</p>
        </div>
      )}
      {reproduce && <ReproduceOverlay photo={reproduce} stage={stage} cameraSize={cameraSize} focal35={selfie ? FRONT_PHONE_FOCAL35 : focal35} />}
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

      {reproduce ? (
        <ReproduceGuide target={reproduce} position={position ?? geo.fix} angles={orientation.angles} absolute={orientation.absolute} />
      ) : (
        <SensorStatus geo={geo} orientation={orientation} />
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

      {selfie && !sheet && (
        <p className="selfie-hint"><strong>Selfie</strong> · on le retrouvera en visant, depuis la place du téléphone, l’endroit où vous vous tenez</p>
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
        <div className="shutter-group">
          {!sheet && <VisibilityPill value={visibility} onChange={setShotVisibility} className="shutter-visibility" />}
          <button
            type="button"
            className="shutter"
            onClick={shoot}
            disabled={busy}
            aria-label={selfie ? 'Géocadrer en direct (prendre un selfie)' : 'Géocadrer en direct (prendre une photo)'}
          >
            <Icon name="scan" size={40} />
          </button>
        </div>
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
}: {
  photo: GeoframedPhoto
  stage: { width: number; height: number }
  cameraSize: { width: number; height: number } | null
  focal35: number
}) {
  const url = useImageUrl(photo.id, 'full')
  const [opacity, setOpacity] = useState(0.5)
  if (!url || !stage.width) return null
  const camFocal = cameraSize
    ? coverViewport(cameraSize.width, cameraSize.height, stage.width, stage.height, focal35).focal
    : focalPx(focal35, stage.width, stage.height)
  const k = camFocal / focalPx(photo.focal35, photo.width, photo.height)
  const w = photo.width * k
  const h = photo.height * k
  return (
    <>
      <img
        className="align-photo reproduce-photo"
        src={url}
        alt=""
        style={{ width: w, height: h, left: (stage.width - w) / 2, top: (stage.height - h) / 2, opacity }}
        draggable={false}
      />
      <label className="slider reproduce-opacity">
        <Icon name="eye" size={18} />
        <input
          type="range"
          min={0.1}
          max={0.9}
          step={0.05}
          value={opacity}
          onChange={(e) => setOpacity(Number(e.target.value))}
          aria-label="Opacité de la photo d’origine"
        />
      </label>
    </>
  )
}

/** En-tête du mode « Reproduire » : consigne et jauges d'alignement de la chasse. */
function ReproduceGuide({
  target,
  position,
  angles,
  absolute,
}: {
  target: GeoframedPhoto
  position: Parameters<typeof computeAlignment>[1]['position']
  angles: Parameters<typeof computeAlignment>[1]['angles']
  absolute: boolean
}) {
  const g = target.geoframe
  const al = computeAlignment(
    { position: g.position, angles: { heading: g.heading, pitch: g.pitch, roll: g.roll } },
    { position, angles },
  )
  return (
    <header className="reproduce-guide">
      <div className={`guide ${al.aligned ? 'ok' : ''}`}>
        <Icon name="reproduce" />
        <div>
          <strong>{al.aligned ? 'Cadrage retrouvé : déclenchez' : guidance(al, absolute)}</strong>
          <span>Reproduire la photo {ofName(target.ownerName || 'quelqu’un')} · superposez-la au décor</span>
        </div>
      </div>
      <AlignGauges al={al} />
    </header>
  )
}
