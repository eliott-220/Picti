import { useEffect, useMemo, useRef, useState, type PointerEvent } from 'react'
import { AlignGauges, ArPhoto, CaptureCard, SpotTimeline } from '../components/ar'
import {
  coverTransform,
  overlayScale,
  photoTime,
  projectGeoPhoto,
  viewportCamera,
  type GeoframedPhoto,
} from '../components/arProjection'
import { Icon } from '../components/Icon'
import { PreciseLocationNotice } from '../components/PreciseLocationNotice'
import { DirectionArrow, RoundButton } from '../components/ui'
import { useElementSize } from '../components/useElementSize'
import { CELEBRATION_MS, useCapture } from '../components/useCapture'
import { useSpotCalibration } from '../components/useSpotCalibration'
import { useStore } from '../data/storeContext'
import { huntSaturation, usePhotoInColor } from '../data/photoColor'
import { usePhoto } from '../data/usePhoto'
import { formatDateTime, isGeoframed, photoTitleAndDate } from '../data/types'
import { CAPTURE_RADIUS, computeAlignment, guidance, viewerEye } from '../geo/alignment'
import type { GeoFix } from '../geo/geodesy'
import { add, angleDiffDeg, clamp, dot, scale, sub, type Vec3 } from '../geo/math'
import { basisFromAngles, type CameraAngles } from '../geo/orientation'
import { sameSpot } from '../geo/spots'
import { photoPileOrder, spotPointOf } from '../data/photoSpots'
import { goBack, navigate } from '../router'
import { useViewfinder } from '../sensors/useViewfinder'
import { PhotoSheet } from './PhotoDetail'

/**
 * Alignement tenu (ms) au bout duquel la capture se lance d'elle-même (même déroulé qu'un appui
 * sur « Capturer ») : évite de la lancer en passant simplement par l'alignement.
 */
const AUTO_CAPTURE_MS = 500

export function Hunt({ id }: { id: string }) {
  const { photos } = useStore()
  const { photo: base, loading } = usePhoto(id)
  const [currentId, setCurrentId] = useState(id)
  if (!base || !isGeoframed(base)) {
    return (
      <main className="screen page missing">
        <RoundButton icon="back" label="Retour" onClick={goBack} className="back-btn" />
        <p>{loading ? 'Chargement…' : 'Cette photo n’est pas (encore) géocadrée ou ne vous est pas accessible.'}</p>
      </main>
    )
  }
  // Photos du même lieu, dans l'ordre de la pile (les plus aimées devant).
  const here = spotPointOf(base)
  const stack = photos
    .filter((p): p is GeoframedPhoto => isGeoframed(p) && (p.id === base.id || sameSpot(here, spotPointOf(p))))
    .sort(photoPileOrder())
  const current = stack.find((p) => p.id === currentId) ?? base
  return <HuntView photo={current} stack={stack} onSelect={(p) => setCurrentId(p.id)} />
}

/**
 * Chasse in situ : la photo flotte dans l'espace augmenté comme une carte,
 * de biais et lointaine quand on est loin. Une fois sur place (à moins de
 * 5 m du point de vue), on la capture : on ne bouge plus et c'est elle qui
 * vient à nous, en s'agrandissant jusqu'à couvrir l'écran (`useCapture`).
 */
function HuntView({
  photo,
  stack,
  onSelect,
}: {
  photo: GeoframedPhoto
  /** Photos du même lieu (dont celle-ci), dans l'ordre de la pile. */
  stack: GeoframedPhoto[]
  onSelect: (photo: GeoframedPhoto) => void
}) {
  const { captures, addCapture, isMine } = useStore()
  const [stageRef, stage] = useElementSize<HTMLDivElement>()
  // Suivi visuel dans l'app iPhone, sinon caméra web, GPS suivi et boussole (voir `useViewfinder`).
  const { camera, geo, orientation, position, focal35 } = useViewfinder({ stage: stageRef, calibrateFocal: true })
  const { videoRef, status: cameraStatus, size: cameraSize } = camera
  const [opacity, setOpacity] = useState(0.8)
  // chasse → capturée (célébration) → fiche en feuille → contemplation, pour la photo affichée.
  type Phase = 'hunting' | 'captured' | 'sheet' | 'contemplating'
  const [phaseState, setPhaseState] = useState<{ id: string; phase: Phase; first: boolean }>({
    id: photo.id,
    phase: 'hunting',
    first: false,
  })
  const phase: Phase = phaseState.id === photo.id ? phaseState.phase : 'hunting'
  const firstCapture = phaseState.id === photo.id && phaseState.first
  const setPhase = (next: Phase, first = firstCapture) => setPhaseState({ id: photo.id, phase: next, first })
  const alreadyCaptured = captures.some((c) => c.photoId === photo.id)
  // Couleurs inversées : une photo d'un autre pas encore capturée est en noir et blanc.
  const inColor = usePhotoInColor(photo.id, photo.owner)
  // En chassant, la couleur revient à mesure qu'on s'aligne (jusqu'à 40 %). Capture : la
  // couleur envahit la photo pendant qu'elle s'agrandit.

  const g = photo.geoframe
  const target = useMemo(
    () => ({ position: g.position, angles: { heading: g.heading, pitch: g.pitch, roll: g.roll } }),
    [g],
  )

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
  const viewerFix: GeoFix | null = demo ? { ...g.position, accuracy: 3, timestamp: 0 } : position

  const al = computeAlignment(target, { position: viewerFix, angles: viewerAngles })
  // Photo alignée, avant sa capture : on se considère au point de vue exact et
  // l'écart restant est attribué au GPS. La photo se confond alors avec le
  // décor ; ensuite elle garde sa place quand on se déplace.
  const offset = useSpotCalibration(viewerFix && viewerEye(g.position, viewerFix), phase === 'hunting' && al.aligned)

  const cam = viewportCamera(stage, cameraSize, focal35)
  const ar = cam && viewerBasis ? projectGeoPhoto(photo, viewerFix, viewerBasis, cam, offset) : null
  const transform = ar?.transform ?? null

  // Flèche de bord d'écran : où se trouve la photo quand elle est hors champ.
  let edgeArrow: number | null = null
  if (viewerBasis && ar && ar.facing && !ar.projection.onScreen) {
    const center: Vec3 = scale(add(ar.corners[0], ar.corners[2]), 0.5)
    const d = sub(center, ar.eye)
    edgeArrow = (Math.atan2(dot(d, viewerBasis.r), dot(d, viewerBasis.u)) * 180) / Math.PI
  }

  // Capture : d'un appui sur « Capturer », ou alignement tenu AUTO_CAPTURE_MS. La photo
  // s'agrandit jusqu'à couvrir l'écran ; elle n'est capturée qu'à 100 % (immobile jusque-là).
  const scoreRef = useRef(al.score)
  useEffect(() => {
    scoreRef.current = al.score
  })
  const capture = useCapture((id) => {
    if (id !== photo.id) return
    setPhaseState({ id, phase: 'captured', first: !alreadyCaptured })
    navigator.vibrate?.([60, 40, 120])
    if (!alreadyCaptured) void addCapture(id, scoreRef.current).catch(() => undefined)
  })
  useEffect(() => {
    capture.sync({ angles: viewerAngles, place: (id) => (id === photo.id ? transform : null) })
  })
  const startCapture = () => {
    if (transform) capture.start(photo.id, transform)
  }
  const startRef = useRef(startCapture)
  useEffect(() => {
    startRef.current = startCapture
  })
  // Après la célébration, la fiche monte en feuille (la capture est déjà enregistrée ou en cours).
  useEffect(() => {
    if (phase !== 'captured') return
    const t = setTimeout(() => setPhaseState((s) => (s.phase === 'captured' ? { ...s, phase: 'sheet' } : s)), CELEBRATION_MS)
    return () => clearTimeout(t)
  }, [phase])
  /** Feuille redescendue : la photo, en plein écran, revient à sa place dans le décor, en couleur. */
  const contemplate = () => {
    capture.release()
    setPhase('contemplating')
  }
  useEffect(() => {
    if (!al.aligned || phase !== 'hunting' || capture.active) return
    const t = setTimeout(() => startRef.current(), AUTO_CAPTURE_MS)
    return () => clearTimeout(t)
  }, [al.aligned, phase, capture.active])
  // La photo d'un autre, visible à l'écran, se capture d'un appui : seulement à moins de 5 m du
  // point de vue (`CAPTURE_RADIUS`), et pas pendant un agrandissement.
  const capturable = phase === 'hunting' && !isMine(photo) && !alreadyCaptured
  const canCapture = capturable && al.onSpot && transform != null && capture.active == null
  const captureHint = !capturable
    ? null
    : al.distance == null
      ? 'Capturer : recherche de votre position…'
      : !al.onSpot
        ? `Capturer à moins de ${CAPTURE_RADIUS} m : encore ${Math.ceil(al.distance - CAPTURE_RADIUS)} m`
        : transform == null
          ? 'Visez la photo pour la capturer'
          : null

  const hasOrientation = demo || (orientation.status === 'active' && orientation.absolute)
  // Capture en cours ou interrompue : son message (« Ne bougez plus… ») prend la place de la consigne.
  const message = capture.hint ?? (phase === 'hunting' ? guidance(al, hasOrientation) : 'Photo retrouvée ✓')
  const saturation = inColor || phase !== 'hunting' ? 1 : huntSaturation(al.score)
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

      {transform && capture.active !== photo.id && (
        <ArPhoto
          photo={photo}
          transform={transform}
          opacity={(al.aligned ? Math.max(opacity, 0.95) : opacity) * (ar?.fade ?? 1)}
          saturation={saturation}
          blur={ar?.blur}
          scale={ar ? overlayScale(ar) : 1}
          glass={ar ? !ar.facing : false}
        />
      )}
      {/* Capture : la carte quitte sa place et s'agrandit jusqu'à couvrir l'écran. */}
      {cam && capture.active === photo.id && capture.state.phase !== 'idle' && (
        <CaptureCard
          key={photo.id}
          photo={photo}
          state={capture.state}
          cover={coverTransform(photo, cam)}
          saturation={saturation}
          scale={ar && transform ? overlayScale(ar) : undefined}
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
              {[
                isMine(photo)
                  ? photoTitleAndDate(photo)
                  : `${photo.selfie ? 'Selfie' : 'Photo'} de ${photo.ownerName || 'quelqu’un'}`,
                isMine(photo) && photo.selfie ? 'Selfie' : null,
                isMine(photo) ? null : formatDateTime(photoTime(photo)),
              ]
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
        {stack.length > 1 && (
          <SpotTimeline
            items={stack}
            index={Math.max(0, stack.findIndex((p) => p.id === photo.id))}
            onChange={(i) => onSelect(stack[i])}
            isMine={isMine}
            onGallery={() => navigate(`/galerie/${photo.id}`)}
          />
        )}
        <AlignGauges al={al} />
        {capturable && (
          <button type="button" className="btn capture-btn" onClick={startCapture} disabled={!canCapture}>
            <Icon name="scan" /> {captureHint ?? 'Capturer'}
          </button>
        )}
        {phase === 'contemplating' && (
          <button type="button" className="btn capture-btn" onClick={() => setPhase('sheet')}>
            <Icon name="image" /> Fiche
          </button>
        )}
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

      <PreciseLocationNotice geo={geo} />

      {phase === 'captured' && (
        // Célébration (~1,5 s) ; un appui passe directement à la fiche.
        <button type="button" className="capture-celebration" aria-label="Photo capturée : voir sa fiche" onClick={() => setPhase('sheet')}>
          <span className="capture-celebration-card" role="status">
            <Icon name="flag" size={36} />
            <strong className="capture-celebration-title">{firstCapture ? 'Capturée !' : 'Retrouvée !'}</strong>
            <span>
              Vous êtes à l’endroit précis et sous l’angle exact où cette photo a été prise.
              {firstCapture && !isMine(photo) && ' Elle compte comme un like, aimée sur place.'}
            </span>
          </span>
        </button>
      )}
      {phase === 'sheet' && (
        <PhotoSheet
          photo={photo}
          banner={firstCapture && !isMine(photo) ? 'Capturée ✓ · aimée sur place' : 'Retrouvée ✓'}
          onClose={contemplate}
        />
      )}
    </main>
  )
}
