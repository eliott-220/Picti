import { useMemo, useState } from 'react'
import { viewportCamera, type GeoframedPhoto } from '../components/arProjection'
import { ArSpotsLayer } from '../components/ArSpotsLayer'
import { Icon } from '../components/Icon'
import { SensorStatus } from '../components/SensorStatus'
import { useElementSize } from '../components/useElementSize'
import { RoundButton } from '../components/ui'
import { useToast } from '../components/toastContext'
import { VisibilityPill } from '../components/VisibilityPill'
import { createDirectPhoto } from '../data/pipeline'
import { setShotVisibility, useShotVisibility } from '../data/shotVisibility'
import { useStore } from '../data/storeContext'
import { isGeoframed, VISIBLE_BY, type GeoPhoto } from '../data/types'
import { computeAlignment } from '../geo/alignment'
import { FRONT_PHONE_FOCAL35 } from '../geo/optics'
import { anglesFromBasis, frontCameraBasis } from '../geo/orientation'
import { useNearbyRefresh } from '../data/useNearbyRefresh'
import { navigate } from '../router'
import { useCameraFocal } from '../sensors/cameraFocal'
import { useCamera, type CameraFacing } from '../sensors/useCamera'
import { useFocalCalibration } from '../sensors/useFocalCalibration'
import { useGeolocation } from '../sensors/useGeolocation'
import { useLivePosition } from '../sensors/useLivePosition'
import { useOrientation } from '../sensors/useOrientation'
import { ImportSheet } from './ImportSheet'
import { MenuSheet } from './MenuSheet'

/** Précision GPS (m) au-delà de laquelle une photo prise risque d'être mal placée. */
const PRECISE_FIX = 15

/** Accueil : le viseur, point de départ du géocadrage en direct. */
export function Home() {
  const [sheet, setSheet] = useState<'import' | 'menu' | null>(null)
  const [flash, setFlash] = useState(false)
  const [busy, setBusy] = useState(false)
  const [facing, setFacing] = useState<CameraFacing>('environment')
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
  const { addPhoto, addCapture, nearby, captures, isMine, photos, profile, friends } = useStore()
  const toast = useToast()
  // Visibilité de la prochaine photo : réglage du profil, ou choix fait avec la pastille.
  const visibility = useShotVisibility(profile?.defaultVisibility ?? 'amis')
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
   * (lancée à moins de 5 m de son point de vue, voir `ArSpotsLayer`) ; on l'enregistre.
   */
  async function captureHere(p: GeoPhoto): Promise<boolean> {
    if (!isGeoframed(p)) return false
    const g = p.geoframe
    // Score conservé avec la capture : l'alignement du moment, comme en chasse.
    const { score } = computeAlignment(
      { position: g.position, angles: { heading: g.heading, pitch: g.pitch, roll: g.roll } },
      { position: position ?? geo.fix, angles: orientation.angles },
    )
    try {
      await addCapture(p.id, score)
      toast('Photo capturée', { label: 'Voir', to: `/photo/${p.id}` })
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
      const saved = await addPhoto(photo, images, visibility)
      navigator.vibrate?.(30)
      if (photo.geoframe) {
        const accuracy = photo.geoframe.accuracy
        // GPS encore imprécis (premières secondes, intérieur) : la photo pourra paraître décalée.
        const vague = accuracy != null && accuracy > PRECISE_FIX
        // Où elle est publiée ; « Modifier » ouvre le détail (choix de la visibilité).
        const published = `${selfie ? 'Selfie géocadré' : 'Photo géocadrée'} · visible par ${VISIBLE_BY[saved.visibility]}`
        toast(vague ? `${published} — GPS à ±${Math.round(accuracy!)} m : elle pourra paraître décalée` : published, {
          label: 'Modifier',
          to: `/photo/${photo.id}`,
        })
      } else {
        const missing = !geo.fix ? 'position GPS' : 'boussole'
        const kind = selfie ? 'Selfie gardé' : 'Photo gardée'
        toast(`${kind} sans ${missing} : à géocadrer sur place`, { label: 'Voir', to: `/photo/${photo.id}` })
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
      {/* Les photos flottent dans le décor vu par la caméra principale, pas dans le selfie. */}
      {!sheet && !selfie && (
        <ArSpotsLayer
          photos={arPhotos}
          fix={position}
          basis={orientation.absolute ? orientation.basis : null}
          cam={viewportCamera(stage, cameraSize, focal35)}
          isMine={isMine}
          onOpen={(p) => navigate(`/chasse/${p.id}`)}
          onCapture={captureHere}
        />
      )}
      {flash && <div className="flash" />}

      <SensorStatus geo={geo} orientation={orientation} />

      <nav className="rail" aria-label="Explorer">
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

      {selfie && !sheet && (
        <p className="selfie-hint"><strong>Selfie</strong> · on le retrouvera en visant, depuis la place du téléphone, l’endroit où vous vous tenez</p>
      )}

      <div className="bottom-bar">
        <RoundButton icon="plus" label="Géocadrer en différé (importer)" onClick={() => setSheet('import')} />
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
        <RoundButton icon="grid" label="Menu" onClick={() => setSheet('menu')} badge={friendRequests} />
      </div>

      {sheet === 'import' && <ImportSheet onClose={() => setSheet(null)} fix={geo.fix} />}
      {sheet === 'menu' && <MenuSheet onClose={() => setSheet(null)} />}
    </main>
  )
}
