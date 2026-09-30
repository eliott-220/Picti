import { useState } from 'react'
import { Icon } from '../components/Icon'
import { DirectionArrow, RoundButton } from '../components/ui'
import { useElementSize } from '../components/useElementSize'
import { useToast } from '../components/toastContext'
import { useImageUrl } from '../data/imageUrls'
import { PremiumCard } from '../components/PremiumCard'
import { canUseDiffere } from '../data/premium'
import { useStore } from '../data/storeContext'
import { usePhoto } from '../data/usePhoto'
import type { GeoPhoto } from '../data/types'
import { bearingDeg, compassPoint, distanceMeters, formatDistance } from '../geo/geodesy'
import { angleDiffDeg } from '../geo/math'
import { coverViewport, focalPx } from '../geo/optics'
import { goBack, navigate } from '../router'
import { useCameraFocal } from '../sensors/cameraFocal'
import { useCamera } from '../sensors/useCamera'
import { useGeolocation } from '../sensors/useGeolocation'
import { useOrientation } from '../sensors/useOrientation'

const FOCAL_MIN = 13
const FOCAL_MAX = 200
const toSlider = (f: number) => Math.log(f / FOCAL_MIN) / Math.log(FOCAL_MAX / FOCAL_MIN)
const fromSlider = (v: number) => FOCAL_MIN * (FOCAL_MAX / FOCAL_MIN) ** v

export function Recaler({ id }: { id: string }) {
  const { isMine, profile } = useStore()
  const { photo, loading } = usePhoto(id)
  const reason = !photo
    ? loading
      ? 'Chargement…'
      : 'Cette photo n’existe plus.'
    : !isMine(photo)
      ? 'Seul l’auteur d’une photo peut la géocadrer.'
      : null
  if (photo && !reason && !canUseDiffere(profile)) {
    return (
      <main className="screen page missing premium-gate">
        <RoundButton icon="back" label="Retour" onClick={goBack} className="back-btn" />
        <PremiumCard reason="Géocadrage en différé : PICTI Premium" />
      </main>
    )
  }
  if (!photo || reason) {
    return (
      <main className="screen page missing">
        <RoundButton icon="back" label="Retour" onClick={goBack} className="back-btn" />
        <p>{reason}</p>
      </main>
    )
  }
  return <RecalerView photo={photo} />
}

/**
 * Géocadrage en différé, sur place : l'utilisateur retrouve le lieu de
 * la prise de vue, superpose le cliché au décor réel puis demande à
 * PICTI de relever position et orientation du téléphone.
 */
function RecalerView({ photo }: { photo: GeoPhoto }) {
  const { updatePhoto } = useStore()
  const url = useImageUrl(photo.id, 'full')
  const { videoRef, status: cameraStatus, size: cameraSize } = useCamera()
  const geo = useGeolocation()
  const orientation = useOrientation()
  const { focal35: cameraFocal35 } = useCameraFocal()
  const toast = useToast()
  const [stageRef, stage] = useElementSize<HTMLDivElement>()
  const [opacity, setOpacity] = useState(0.55)
  const [focal, setFocal] = useState(photo.focal35)

  // La photo est affichée avec son champ de vision réel : même focale
  // apparente que la caméra, centrée, sans rotation par rapport à l'écran.
  const camFocal = cameraSize
    ? coverViewport(cameraSize.width, cameraSize.height, stage.width, stage.height, cameraFocal35).focal
    : focalPx(cameraFocal35, stage.width, stage.height)
  const k = camFocal / focalPx(focal, photo.width, photo.height)
  const w = photo.width * k
  const h = photo.height * k

  const hint = photo.hintPosition
  const hintDistance = hint && geo.fix ? distanceMeters(geo.fix, hint) : null
  const hintBearing = hint && geo.fix && hintDistance! > 1 ? bearingDeg(geo.fix, hint) : null

  const { fix } = geo
  const angles = orientation.angles
  const blocker = !fix
    ? 'En attente de la position GPS…'
    : !angles
      ? orientation.status === 'unsupported'
        ? 'Boussole indispensable : utilisez un smartphone'
        : 'En attente de la boussole…'
      : !orientation.absolute
        ? 'Boussole non référencée au nord sur ce navigateur'
        : null

  async function geoframeHere() {
    if (!fix || !angles || !orientation.absolute) return
    try {
      await updatePhoto({
        ...photo,
        focal35: Math.round(focal * 10) / 10,
        mode: 'differe-manuel',
        geoframe: {
          position: { lat: fix.lat, lon: fix.lon, alt: fix.alt ?? null },
          accuracy: fix.accuracy,
          heading: angles.heading,
          pitch: angles.pitch,
          roll: angles.roll,
          headingSource: 'boussole',
        },
      })
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Enregistrement impossible')
      return
    }
    navigator.vibrate?.(40)
    toast('Photo géocadrée en différé')
    navigate(`/photo/${photo.id}`, { replace: true })
  }

  return (
    <main className="screen recaler" ref={stageRef}>
      <video ref={videoRef} className="camera-video mono" playsInline muted autoPlay />
      {cameraStatus === 'error' && <div className="camera-fallback sky" />}

      {url && stage.width > 0 && (
        <img
          className="align-photo"
          src={url}
          alt=""
          style={{ width: w, height: h, left: (stage.width - w) / 2, top: (stage.height - h) / 2, opacity }}
          draggable={false}
        />
      )}

      <header className="hunt-top">
        <RoundButton icon="close" label="Annuler" onClick={goBack} />
        <div className="guide">
          {hintBearing != null && orientation.angles && (
            <DirectionArrow deg={angleDiffDeg(orientation.angles.heading, hintBearing)} />
          )}
          <div>
            <strong>
              {photo.selfie
                ? 'Visez, depuis la place du téléphone, l’endroit où vous vous teniez'
                : 'Superposez la photo au décor réel'}
            </strong>
            <span>
              {hintDistance != null
                ? `Prise à ${formatDistance(hintDistance)}${hintBearing != null ? ` vers le ${compassPoint(hintBearing)}` : ''}`
                : 'Retrouvez l’endroit exact de la prise de vue'}
            </span>
          </div>
        </div>
      </header>

      {orientation.status === 'needs-permission' && (
        <button type="button" className="btn permission" onClick={() => void orientation.requestPermission()}>
          <Icon name="compass" /> Activer la boussole
        </button>
      )}

      <footer className="hunt-bottom">
        <label className="slider">
          <Icon name="eye" size={18} />
          <input
            type="range"
            min={0.1}
            max={0.9}
            step={0.05}
            value={opacity}
            onChange={(e) => setOpacity(Number(e.target.value))}
            aria-label="Transparence de la photo"
          />
        </label>
        <label className="slider">
          <Icon name="zoom" size={18} />
          <input
            type="range"
            min={0}
            max={1}
            step={0.005}
            value={toSlider(focal)}
            onChange={(e) => setFocal(fromSlider(Number(e.target.value)))}
            aria-label="Cadrage (focale)"
          />
          <span className="slider-value">{Math.round(focal)} mm</span>
        </label>
        <button type="button" className="btn" disabled={!!blocker} onClick={() => void geoframeHere()}>
          <Icon name="scan" /> Géocadrer ici
        </button>
        {blocker && <p className="demo-hint">{blocker}</p>}
      </footer>
    </main>
  )
}
