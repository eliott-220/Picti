import { useEffect, useMemo, useRef, useState, type PointerEvent } from 'react'
import { Icon } from '../components/Icon'
import { DirectionArrow, RoundButton } from '../components/ui'
import { useElementSize } from '../components/useElementSize'
import { useImageUrl } from '../data/imageUrls'
import { useStore } from '../data/storeContext'
import { usePhoto } from '../data/usePhoto'
import { isGeoframed, photoDate, type GeoPhoto } from '../data/types'
import { ALIGN_TOLERANCE, computeAlignment, guidance, parallaxEye } from '../geo/alignment'
import { formatDistance, toENU, type GeoFix } from '../geo/geodesy'
import { add, angleDiffDeg, clamp, dot, scale, sub, type Vec3 } from '../geo/math'
import { coverViewport, DEFAULT_PHONE_FOCAL35, focalPx, type ViewportCamera } from '../geo/optics'
import { basisFromAngles, type CameraAngles } from '../geo/orientation'
import { photoPlaneCorners, projectPhoto, quadTransform } from '../geo/projection'
import { goBack } from '../router'
import { useCamera } from '../sensors/useCamera'
import { useGeolocation } from '../sensors/useGeolocation'
import { useOrientation } from '../sensors/useOrientation'

/** Temps d'alignement continu requis pour capturer une photo (ms). */
const HOLD_MS = 1500
/** Largeur de rendu de la photo superposée (px CSS, avant transformation). */
const OVERLAY_W = 1000

export function Hunt({ id }: { id: string }) {
  const { photo, loading } = usePhoto(id)
  if (!photo || !isGeoframed(photo)) {
    return (
      <main className="screen page missing">
        <RoundButton icon="back" label="Retour" onClick={goBack} className="back-btn" />
        <p>{loading ? 'Chargement…' : 'Cette photo n’est pas (encore) géocadrée ou ne vous est pas accessible.'}</p>
      </main>
    )
  }
  return <HuntView photo={photo} />
}

/**
 * Chasse in situ : le téléphone devient une fenêtre sur le passé. La
 * photo flotte dans l'espace augmenté, de biais et lointaine quand on
 * est loin, puis se confond avec le décor une fois le point de vue exact
 * retrouvé — la photo est alors « capturée ».
 */
function HuntView({ photo }: { photo: GeoPhoto & { geoframe: NonNullable<GeoPhoto['geoframe']> } }) {
  const { captures, addCapture, isMine } = useStore()
  const url = useImageUrl(photo.id, 'full')
  const { videoRef, status: cameraStatus, size: cameraSize } = useCamera()
  const geo = useGeolocation()
  const orientation = useOrientation()
  const [stageRef, stage] = useElementSize<HTMLDivElement>()
  const [opacity, setOpacity] = useState(0.8)
  // chasse → capturée (célébration) → contemplation (photo retrouvée)
  const [phase, setPhase] = useState<'hunting' | 'captured' | 'contemplating'>('hunting')
  const [firstCapture, setFirstCapture] = useState(false)
  const alreadyCaptured = captures.some((c) => c.photoId === photo.id)

  const g = photo.geoframe
  const target = useMemo(
    () => ({ position: g.position, angles: { heading: g.heading, pitch: g.pitch, roll: g.roll } }),
    [g],
  )
  const targetBasis = useMemo(() => basisFromAngles(target.angles), [target])
  const corners = useMemo(() => photoPlaneCorners(targetBasis, photo), [targetBasis, photo])

  // Mode démonstration (ordinateur, capteurs refusés) : on se place au point
  // de vue et on regarde autour de soi en faisant glisser l'image.
  const demo = orientation.status === 'unsupported' || orientation.status === 'denied'
  const [look, setLook] = useState<CameraAngles>(() => ({
    heading: g.heading + 35,
    pitch: g.pitch - 8,
    roll: 0,
  }))
  const drag = useRef<{ x: number; y: number } | null>(null)
  function onPointerDown(e: PointerEvent) {
    if (!demo) return
    drag.current = { x: e.clientX, y: e.clientY }
    ;(e.target as Element).setPointerCapture?.(e.pointerId)
  }
  function onPointerMove(e: PointerEvent) {
    if (!drag.current) return
    const dx = e.clientX - drag.current.x
    const dy = e.clientY - drag.current.y
    drag.current = { x: e.clientX, y: e.clientY }
    setLook((l) => ({ ...l, heading: l.heading - dx * 0.12, pitch: clamp(l.pitch + dy * 0.12, -80, 80) }))
  }
  const onPointerUp = () => (drag.current = null)

  const viewerAngles = demo ? look : orientation.angles
  const viewerBasis = demo ? basisFromAngles(look) : orientation.basis
  const viewerFix: GeoFix | null = demo ? { ...g.position, accuracy: 3, timestamp: 0 } : geo.fix

  const al = computeAlignment(target, { position: viewerFix, angles: viewerAngles })

  // Caméra de l'écran : le flux vidéo couvre la scène.
  const cam: ViewportCamera | null = stage.width
    ? cameraSize
      ? coverViewport(cameraSize.width, cameraSize.height, stage.width, stage.height, DEFAULT_PHONE_FOCAL35)
      : { width: stage.width, height: stage.height, focal: focalPx(DEFAULT_PHONE_FOCAL35, stage.width, stage.height) }
    : null

  const eyeRaw: Vec3 = viewerFix ? toENU(g.position, viewerFix) : [0, 0, 0]
  const eye = al.distance != null ? parallaxEye(eyeRaw, al.distance, al.radius) : eyeRaw
  const projection = cam && viewerBasis ? projectPhoto(corners, eye, viewerBasis, cam) : null
  const overlayH = (OVERLAY_W * photo.height) / photo.width
  const transform = projection?.inFront ? quadTransform(OVERLAY_W, overlayH, projection.corners) : null

  // Flèche de bord d'écran : où se trouve la photo quand elle est hors champ.
  let edgeArrow: number | null = null
  if (viewerBasis && projection && !projection.onScreen) {
    const center: Vec3 = scale(add(corners[0], corners[2]), 0.5)
    const d = sub(center, eye)
    edgeArrow = (Math.atan2(dot(d, viewerBasis.r), dot(d, viewerBasis.u)) * 180) / Math.PI
  }

  // Capture : alignement maintenu pendant HOLD_MS.
  const scoreRef = useRef(al.score)
  useEffect(() => {
    scoreRef.current = al.score
  })
  useEffect(() => {
    if (!al.aligned || phase !== 'hunting') return
    const t = setTimeout(() => {
      setPhase('captured')
      setFirstCapture(!alreadyCaptured)
      navigator.vibrate?.([60, 40, 120])
      if (!alreadyCaptured) void addCapture(photo.id, scoreRef.current).catch(() => undefined)
    }, HOLD_MS)
    return () => clearTimeout(t)
  }, [al.aligned, phase, alreadyCaptured, addCapture, photo.id])

  const hasOrientation = demo || (orientation.status === 'active' && orientation.absolute)
  const message = phase === 'hunting' ? guidance(al, hasOrientation) : 'Photo retrouvée ✓'
  const approachArrow =
    !al.onSpot && al.bearing != null && viewerAngles ? angleDiffDeg(viewerAngles.heading, al.bearing) : null

  return (
    <main
      className={`screen hunt ${demo ? 'demo' : ''}`}
      ref={stageRef}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      <video ref={videoRef} className="camera-video" playsInline muted autoPlay />
      {cameraStatus === 'error' && <div className="camera-fallback sky" />}

      {url && transform && (
        <img
          className="overlay-photo"
          src={url}
          alt=""
          width={OVERLAY_W}
          height={overlayH}
          style={{ transform, opacity: al.aligned ? Math.max(opacity, 0.95) : opacity }}
          draggable={false}
        />
      )}

      {edgeArrow != null && (
        <div
          className="edge-arrow"
          style={{
            left: `calc(50% + ${Math.sin((edgeArrow * Math.PI) / 180) * 38}%)`,
            top: `calc(50% - ${Math.cos((edgeArrow * Math.PI) / 180) * 38}%)`,
          }}
        >
          <DirectionArrow deg={edgeArrow} size={28} />
        </div>
      )}

      <header className="hunt-top">
        <RoundButton icon="close" label="Quitter la chasse" onClick={goBack} />
        <div className={`guide ${al.aligned || phase !== 'hunting' ? 'ok' : ''}`}>
          {approachArrow != null && <DirectionArrow deg={approachArrow} />}
          <div>
            <strong>{message}</strong>
            <span>
              {[isMine(photo) ? photo.title : `Photo de ${photo.ownerName || 'quelqu’un'}`, photoDate(photo)]
                .filter(Boolean)
                .join(' · ')}
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
        <div className="gauges">
          <Gauge
            label="Distance"
            value={al.distance != null ? formatDistance(al.distance) : '…'}
            ok={al.onSpot}
          />
          <Gauge
            label="Cap"
            value={al.headingError != null ? `${al.headingError > 0 ? '+' : ''}${Math.round(al.headingError)}°` : '…'}
            ok={al.headingError != null && Math.abs(al.headingError) <= ALIGN_TOLERANCE.heading}
          />
          <Gauge
            label="Inclinaison"
            value={al.pitchError != null ? `${al.pitchError > 0 ? '+' : ''}${Math.round(al.pitchError)}°` : '…'}
            ok={al.pitchError != null && Math.abs(al.pitchError) <= ALIGN_TOLERANCE.pitch}
          />
        </div>
        <div className="score-bar" aria-label="Qualité de l’alignement">
          <span style={{ width: `${Math.round(al.score * 100)}%` }} className={al.aligned ? 'holding' : ''} />
        </div>
        <label className="slider">
          <Icon name="eye" size={18} />
          <input
            type="range"
            min={0.15}
            max={1}
            step={0.05}
            value={opacity}
            onChange={(e) => setOpacity(Number(e.target.value))}
            aria-label="Opacité de la photo"
          />
        </label>
        {demo && <p className="demo-hint">Mode démo : faites glisser pour regarder autour de vous.</p>}
      </footer>

      {phase === 'captured' && (
        <div className="captured" role="alertdialog" aria-label="Photo capturée">
          <div className="captured-card">
            <Icon name="flag" size={36} />
            <h2>{firstCapture ? 'Capturée !' : 'Retrouvée !'}</h2>
            <p>Vous êtes à l’endroit précis et sous l’angle exact où cette photo a été prise.</p>
            <div className="captured-actions">
              <button type="button" className="btn light" onClick={() => setPhase('contemplating')}>
                Contempler
              </button>
              <button type="button" className="btn ghost" onClick={goBack}>
                Terminer
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  )
}

function Gauge({ label, value, ok }: { label: string; value: string; ok: boolean }) {
  return (
    <div className={`gauge ${ok ? 'ok' : ''}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  )
}
