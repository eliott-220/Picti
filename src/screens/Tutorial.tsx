import { useEffect, useRef, useState, type CSSProperties, type PointerEvent } from 'react'
import { ArPhoto, CaptureCard, EdgeArrow } from '../components/ar'
import { coverTransform, edgeArrowDeg, overlayScale, projectGeoPhoto, viewportCamera, type GeoframedPhoto } from '../components/arProjection'
import { Icon, Logo } from '../components/Icon'
import { useAlignmentPulses } from '../components/useAlignmentPulses'
import { useCapture } from '../components/useCapture'
import { useElementSize } from '../components/useElementSize'
import { registerLocalImage, registerThumbs, useImageUrl } from '../data/imageUrls'
import { fetchNearestPublicPhoto, nearestText, type NearestPhoto } from '../data/nearestPhoto'
import { clamp } from '../geo/math'
import { anglesFromBasis, basisFromAngles, type CameraAngles, type CameraBasis } from '../geo/orientation'
import {
  alignmentLevel,
  canCaptureRelative,
  halfField,
  plateInView,
  plateLook,
  plateOffset,
  plateOffView,
  relativeError,
} from '../geo/tutorial'
import { haptic, useDarkStatusBar } from '../native'
import { nativePoseBasis } from '../sensors/arTracking'
import { useGeolocation } from '../sensors/useGeolocation'
import { useRelativeOrientation } from '../sensors/useRelativeOrientation'
import { useViewfinder } from '../sensors/useViewfinder'

/** Où mène la fin du tutoriel (ou « Passer »). */
export type TutorialExit =
  /** Sans compte : création du compte (« Créer mon compte », « Passer »). */
  | { to: 'inscription' }
  /** Sans compte, déjà inscrit : connexion. */
  | { to: 'connexion' }
  /** Connecté (tutoriel revu) : retour là où il était. */
  | { to: 'retour' }
  /** Connecté : « Y aller », la chasse de la photo la plus proche. */
  | { to: 'chasse'; id: string }

/**
 * Étapes : 1 `shoot` (prendre la photo d'essai), 2 `turn` (se tourner jusqu'à ce qu'elle sorte de
 * l'écran), 3 `find` (la retrouver, puis « Capturer »), 4 `reveal` (elle repasse en couleur et se
 * fond dans le décor), 5 `final` (la vraie photo la plus proche).
 */
type Step = 'shoot' | 'turn' | 'find' | 'reveal' | 'final'

/** Photo d'essai : n'existe que dans cette page, jamais envoyée ni gardée. */
type DemoPhoto = GeoframedPhoto & { demo: true }

interface DemoShot {
  photo: DemoPhoto
  /** Base de la caméra à la prise, dans le repère relatif (seules les rotations comptent). */
  basis: CameraBasis
}

/** Distance (m) à laquelle la plaque est accrochée devant l'endroit visé. */
const PLATE_DEPTH = 3

/** Point fictif : le tutoriel n'a pas de position (l'œil reste au point de vue). */
const NOWHERE = { lat: 0, lon: 0 }

/**
 * Tutoriel du premier lancement (0.22.0), avant la création du compte : l'utilisateur prend une
 * photo d'essai avec SA caméra, là où il est ; elle reste accrochée devant l'endroit visé. Il se
 * tourne, la retrouve et la capture : il a appris les deux moitiés de PICTI — poser une photo,
 * la retrouver —, sans marcher et en 30 s. Puis la vraie photo publique la plus proche.
 * Orientation relative seulement (ARKit, sinon gyroscope) : ni GPS ni boussole, souvent faux chez
 * soi. Le rendu (plaque, flèche, couleur, capture) est celui du viseur et de la chasse.
 */
export function Tutorial({ account, onExit }: { account: boolean; onExit: (exit: TutorialExit) => void }) {
  const [step, setStep] = useState<Step>('shoot')
  const [shot, setShot] = useState<DemoShot | null>(null)
  // « Réessayer » après un refus de la caméra : la caméra est redemandée.
  const [attempt, setAttempt] = useState(0)
  const forget = useRef<(() => void) | null>(null)

  // La photo d'essai est effacée de la mémoire à la fin (souvent prise chez soi, et on ne pose
  // pas de photo sans compte).
  const drop = () => {
    forget.current?.()
    forget.current = null
  }
  useEffect(() => drop, [])

  const skip = () => onExit(account ? { to: 'retour' } : { to: 'inscription' })

  if (step === 'final') return <TutorialFinal account={account} onExit={onExit} />
  return (
    <TutorialCamera
      key={attempt}
      account={account}
      step={step}
      shot={shot}
      onShot={(blob, photo, basis) => {
        drop()
        forget.current = registerLocalImage(photo.id, blob)
        setShot({ photo, basis })
        setStep('turn')
      }}
      onStep={(next) => {
        if (next === 'final') {
          drop()
          setShot(null)
        }
        setStep(next)
      }}
      onSkip={skip}
      onRetry={() => setAttempt((n) => n + 1)}
    />
  )
}

/** Consigne de chaque étape (tutoiement, textes courts). */
const GUIDE: Record<Exclude<Step, 'final' | 'reveal'>, { title: string; text: string }> = {
  shoot: { title: 'Prends ta première photo', text: 'Vise quelque chose devant toi, puis appuie sur le bouton rouge.' },
  turn: { title: 'Elle est posée là. Tourne-toi.', text: 'Tourne-toi jusqu’à ce qu’elle sorte de l’écran.' },
  find: { title: 'Retrouve-la', text: 'Suis la flèche : elle devient nette quand tu t’en approches.' },
}

function TutorialCamera({
  account,
  step,
  shot,
  onShot,
  onStep,
  onSkip,
  onRetry,
}: {
  account: boolean
  step: Step
  shot: DemoShot | null
  onShot: (blob: Blob, photo: DemoPhoto, basis: CameraBasis) => void
  onStep: (step: Step) => void
  onSkip: () => void
  onRetry: () => void
}) {
  const [stageRef, stage] = useElementSize<HTMLElement>()
  // Caméra du viseur (ARKit dans l'app iPhone, sinon caméra web), sans la position : elle ne sera
  // demandée qu'à l'écran final.
  const { camera, focal35, ar } = useViewfinder({ stage: stageRef, locate: false })
  const { videoRef, status: cameraStatus, size: cameraSize, capture: grab } = camera
  const rel = useRelativeOrientation(ar.active)
  const [flash, setFlash] = useState(false)
  const [busy, setBusy] = useState(false)

  // Pas de capteurs (ordinateur) ou accès refusé : on regarde autour de soi en faisant glisser l'image.
  const demo = rel.status === 'unsupported' || rel.status === 'denied'
  const [look, setLook] = useState<CameraAngles>({ heading: 0, pitch: 0, roll: 0 })
  const drag = useRef<{ x: number; y: number } | null>(null)
  function onPointerDown(e: PointerEvent) {
    if (!demo || (e.target as Element).closest('button')) return
    drag.current = { x: e.clientX, y: e.clientY }
    ;(e.target as Element).setPointerCapture?.(e.pointerId)
  }
  function onPointerMove(e: PointerEvent) {
    if (!drag.current) return
    const dx = e.clientX - drag.current.x
    const dy = e.clientY - drag.current.y
    drag.current = { x: e.clientX, y: e.clientY }
    setLook((l) => ({ ...l, heading: l.heading - dx * 0.15, pitch: clamp(l.pitch + dy * 0.15, -80, 80) }))
  }
  const onPointerUp = () => (drag.current = null)

  const basis = demo ? basisFromAngles(look) : rel.basis
  const basisRef = useRef(basis)
  useEffect(() => {
    basisRef.current = basis
  })

  const cam = viewportCamera(stage, cameraSize, focal35)
  const projection = shot && cam && basis ? projectGeoPhoto(shot.photo, null, basis, cam) : null
  const transform = projection?.transform ?? null
  const error = shot && basis ? relativeError(shot.basis, basis) : null
  const level = error ? alignmentLevel(error) : 0
  const plate = plateLook(level)
  // Étape 2 → 3 : plaque entièrement hors champ (écart > demi-champ + 10°).
  const offset = shot && basis && cam ? plateOffset(shot.basis, basis) : null
  const half = cam ? halfField(cam) : null
  const offView = offset != null && half != null && plateOffView(offset, half) && !projection?.projection.onScreen
  useEffect(() => {
    if (step === 'turn' && offView) onStep('find')
  }, [step, offView, onStep])

  // Capture : même agrandissement que la vraie (la couleur envahit la plaque), sans rien enregistrer.
  const capture = useCapture(() => {
    haptic('success')
    onStep('reveal')
  })
  useEffect(() => {
    capture.sync({
      angles: basis ? anglesFromBasis(basis) : null,
      place: (id) => (shot && id === shot.photo.id ? transform : null),
    })
  })
  // Tolérances d'une même vue (cap ±20°, inclinaison ±15°), le centre de la plaque à l'écran.
  const canCapture =
    step === 'find' &&
    error != null &&
    canCaptureRelative(error) &&
    offset != null &&
    half != null &&
    plateInView(offset, half) &&
    transform != null &&
    capture.active == null

  // Pendant l'approche, l'alignement se sent (vibrations de plus en plus rapprochées) et s'entend.
  const hunting = step === 'find' && capture.active == null
  useAlignmentPulses(level, hunting, { onBeat: tick })
  useEffect(() => () => closeAudio(), [])

  async function shoot() {
    if (busy || cameraStatus !== 'ready') return
    setBusy(true)
    unlockAudio()
    try {
      // iPhone (navigateur) : capteurs de mouvement demandés sur ce geste ; sans eux, on regardera
      // autour en faisant glisser l'image.
      if (rel.status === 'needs-permission') await rel.requestPermission()
      if (!basisRef.current) await firstBasis(basisRef)
      const at = basisRef.current
      setFlash(true)
      setTimeout(() => setFlash(false), 160)
      haptic('clac', { shutter: true })
      const frame = await grab()
      // Suivi visuel : la pose exacte de l'image ; sinon l'orientation au déclenchement.
      const shotBasis = frame.pose ? nativePoseBasis(frame.pose) : (at ?? basisRef.current ?? basisFromAngles(look))
      const id = `essai-${Date.now()}`
      const now = Date.now()
      const photo: DemoPhoto = {
        id,
        demo: true,
        owner: '',
        ownerName: '',
        visibility: 'prive',
        imagePath: `local:${id}`,
        thumbPath: `local:${id}`,
        title: 'Photo d’essai',
        addedAt: now,
        takenAt: now,
        width: frame.width,
        height: frame.height,
        focal35: frame.focal35 ?? focal35,
        depth: PLATE_DEPTH,
        mode: 'direct',
        geoframe: { ...anglesFromBasis(shotBasis), position: NOWHERE, accuracy: null, headingSource: 'boussole' },
        hintPosition: null,
        selfie: false,
        likesCount: 0,
        versionOf: null,
        versionsCount: 0,
      }
      onShot(frame.blob, photo, shotBasis)
    } catch {
      // Image illisible : on peut réessayer (ou passer).
    } finally {
      setBusy(false)
    }
  }

  const arrow = step === 'find' && capture.active == null ? edgeArrowDeg(projection, basis) : null
  const growing = capture.state.phase === 'growing'
  const hint = growing ? 'Ne bouge plus…' : capture.hint ? 'Capture interrompue : reste immobile' : null
  // Pendant la capture, seul compte « Ne bouge plus… ».
  const guide = step === 'reveal' || step === 'final' || capture.active ? null : GUIDE[step]
  const ready = step === 'find' && canCapture

  if (cameraStatus === 'error') {
    return (
      <main className="screen tutorial tutorial-denied">
        <div className="tutorial-card">
          <Icon name="image" size={36} />
          <h1>Sans la caméra, pas de photo d’essai</h1>
          <p>PICTI a besoin de la caméra pour poser tes photos dans le décor. Autorise-la, puis réessaie.</p>
          <button type="button" className="btn" onClick={onRetry}>
            Réessayer
          </button>
          <button type="button" className="text-link" onClick={onSkip}>
            {account ? 'Fermer' : 'Passer à l’inscription'}
          </button>
        </div>
      </main>
    )
  }

  return (
    <main
      className="screen viewfinder tutorial"
      ref={stageRef}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      <video ref={videoRef} className="camera-video" playsInline muted autoPlay />

      {shot && transform && capture.active !== shot.photo.id && (
        <ArPhoto
          photo={shot.photo}
          transform={transform}
          // Photo d'un autre pas encore capturée : en noir et blanc, plus nette et plus opaque en s'alignant.
          opacity={plate.opacity * (projection?.fade ?? 1)}
          saturation={0}
          blur={Math.max(plate.blur, projection?.blur ?? 0)}
          scale={projection ? overlayScale(projection) : 1}
        />
      )}
      {shot && cam && capture.active === shot.photo.id && capture.state.phase !== 'idle' && (
        <div className={step === 'reveal' ? 'tutorial-melt' : undefined}>
          <CaptureCard
            photo={shot.photo}
            state={capture.state}
            cover={coverTransform(shot.photo, cam)}
            saturation={0}
            scale={projection && transform ? overlayScale(projection) : undefined}
          />
        </div>
      )}
      {arrow != null && <EdgeArrow deg={arrow} />}
      {flash && <div className="flash" />}

      <header className="tutorial-top">
        {guide && (
          <div className={`guide ${ready ? 'ok' : ''}`} role="status" aria-live="polite">
            <div>
              <strong>{ready ? 'Tu y es !' : guide.title}</strong>
              <span>{ready ? 'Appuie sur « Capturer ».' : demo && step !== 'shoot' ? 'Fais glisser l’image pour regarder autour de toi.' : guide.text}</span>
            </div>
          </div>
        )}
        {step !== 'reveal' && (
          <button type="button" className="tutorial-skip" onClick={onSkip}>
            Passer
          </button>
        )}
      </header>

      <p className={`capture-hint ${hint ? '' : 'hidden'}`} role="status" aria-live="polite">
        {hint}
      </p>

      {step === 'shoot' && (
        <div className="bottom-bar tutorial-bottom">
          <button
            type="button"
            className="shutter"
            onClick={() => void shoot()}
            disabled={busy || cameraStatus !== 'ready'}
            aria-label="Prendre la photo d’essai"
          />
        </div>
      )}
      {step === 'find' && (
        <div className="bottom-bar tutorial-bottom">
          <button type="button" className="btn capture-btn" onClick={() => shot && transform && capture.start(shot.photo.id, transform)} disabled={!canCapture}>
            <Icon name="scan" /> Capturer
          </button>
        </div>
      )}

      {step === 'reveal' && (
        <div className="tutorial-reveal">
          <div className="tutorial-reveal-card" role="status">
            <Icon name="flag" size={32} />
            <strong>C’est ça, PICTI</strong>
            <span>Des photos posées dans le monde réel, à retrouver sur place.</span>
            <button type="button" className="btn light" onClick={() => onStep('final')}>
              Continuer
            </button>
          </div>
        </div>
      )}
    </main>
  )
}

/** Attend (au plus 1,5 s) la première mesure des capteurs, juste après leur autorisation. */
async function firstBasis(ref: { current: CameraBasis | null }): Promise<void> {
  const until = performance.now() + 1500
  while (!ref.current && performance.now() < until) await new Promise((r) => setTimeout(r, 30))
}

// --- Son de l'alignement : un « tic » bref, plus aigu en s'alignant (muet si le téléphone l'est). ---

let audio: AudioContext | null = null

/** À appeler sur un geste (le déclencheur) : iOS n'autorise le son qu'ainsi. */
function unlockAudio() {
  try {
    audio ??= new AudioContext()
    void audio.resume()
  } catch {
    audio = null
  }
}

function tick(level: number) {
  if (!audio || audio.state !== 'running') return
  const t = audio.currentTime
  const osc = audio.createOscillator()
  const gain = audio.createGain()
  osc.type = 'sine'
  osc.frequency.value = 520 + 900 * level
  gain.gain.setValueAtTime(0.0001, t)
  gain.gain.exponentialRampToValueAtTime(0.05, t + 0.005)
  gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.05)
  osc.connect(gain).connect(audio.destination)
  osc.start(t)
  osc.stop(t + 0.06)
}

function closeAudio() {
  void audio?.close().catch(() => undefined)
  audio = null
}

// --- Écran final : la vraie photo la plus proche ------------------------------------------------

type Nearest =
  | { kind: 'searching' }
  | { kind: 'found'; photo: NearestPhoto }
  | { kind: 'none' }
  /** Pas de distance : position refusée ou introuvable, ou base injoignable. */
  | { kind: 'unknown'; reason: 'position' | 'base' }

/** Précision suffisante (m) pour chercher la photo la plus proche ; au-delà, on attend un peu. */
const FIX_GOOD = 300
/** Sans relevé assez précis au bout de ce temps (ms), on cherche avec ce qu'on a. */
const FIX_WAIT_MS = 6000
/** Sans aucun relevé au bout de ce temps (ms), on renonce. */
const FIX_GIVE_UP_MS = 15000

function TutorialFinal({ account, onExit }: { account: boolean; onExit: (exit: TutorialExit) => void }) {
  useDarkStatusBar()
  // La position est demandée maintenant seulement.
  const geo = useGeolocation(true)
  const [result, setResult] = useState<Nearest>({ kind: 'searching' })
  const [waited, setWaited] = useState<'no' | 'fix' | 'gave-up'>('no')
  const asked = useRef(false)

  useEffect(() => {
    const a = setTimeout(() => setWaited((w) => (w === 'no' ? 'fix' : w)), FIX_WAIT_MS)
    const b = setTimeout(() => setWaited('gave-up'), FIX_GIVE_UP_MS)
    return () => {
      clearTimeout(a)
      clearTimeout(b)
    }
  }, [])

  const fix = geo.fix
  // Position refusée, ou aucun relevé au bout de 15 s : pas de distance.
  const noPosition = geo.denied || (!fix && waited === 'gave-up')
  // Un relevé assez précis (ou le meilleur au bout de 6 s) : une seule recherche.
  const ready = !noPosition && fix != null && (fix.accuracy <= FIX_GOOD || waited !== 'no')
  const fixRef = useRef(fix)
  useEffect(() => {
    fixRef.current = fix
  })
  useEffect(() => {
    const at = fixRef.current
    if (!ready || asked.current || !at) return
    asked.current = true
    fetchNearestPublicPhoto(at.lat, at.lon).then(
      (photo) => setResult(photo ? { kind: 'found', photo } : { kind: 'none' }),
      () => setResult({ kind: 'unknown', reason: 'base' }),
    )
  }, [ready])
  const nearest: Nearest = result.kind === 'searching' && noPosition ? { kind: 'unknown', reason: 'position' } : result

  const found = nearest.kind === 'found' ? nearest.photo : null
  // Connecté : la vraie vignette (floutée, en noir et blanc) ; sans compte, l'auteur reste caché.
  useEffect(() => {
    if (found?.id && found.thumbPath) registerThumbs([{ id: found.id, thumbPath: found.thumbPath }])
  }, [found])
  const thumb = useImageUrl(found?.id ?? null, 'thumb')

  const signup = () => onExit({ to: 'inscription' })
  const login = (
    <button type="button" className="text-link" onClick={() => onExit({ to: 'connexion' })}>
      J’ai déjà un compte
    </button>
  )
  const done = () => onExit({ to: 'retour' })

  return (
    <main className="screen tutorial-final">
      <div className="tutorial-final-body">
        <Logo size={56} />
        {nearest.kind === 'searching' && (
          <>
            <div className="nearest-thumb pending" aria-hidden />
            <h1>Et maintenant, une vraie photo…</h1>
            <p role="status">Recherche de la photo la plus proche de toi…</p>
          </>
        )}
        {found && (
          <>
            <div className="nearest-thumb" aria-hidden style={thumb ? ({ '--thumb': `url("${thumb}")` } as CSSProperties) : undefined}>
              {!thumb && <Icon name="pin" size={36} />}
            </div>
            <h1>
              La photo la plus proche est à <strong>{nearestText(found)}</strong>
            </h1>
            <p>{account ? 'Va la chasser : retrouve son point de vue exact.' : 'Elle t’attend, en noir et blanc, jusqu’à ce que tu la captures.'}</p>
          </>
        )}
        {nearest.kind === 'none' && (
          <>
            <div className="nearest-thumb empty" aria-hidden>
              <Icon name="plus" size={36} />
            </div>
            <h1>Personne n’a encore posé de photo près de toi.</h1>
            <p>Sois le premier !</p>
          </>
        )}
        {nearest.kind === 'unknown' && (
          <>
            <div className="nearest-thumb empty" aria-hidden>
              <Icon name="pin" size={36} />
            </div>
            <h1>
              {!account
                ? 'Crée ton compte pour voir les photos autour de toi'
                : nearest.reason === 'position'
                  ? 'Position indisponible'
                  : 'Impossible de chercher la photo la plus proche pour l’instant'}
            </h1>
            {account && <p>{nearest.reason === 'position' ? 'Autorise la position pour voir les photos autour de toi.' : 'Les photos autour de toi sont sur la carte.'}</p>}
          </>
        )}
      </div>

      <div className="tutorial-final-actions">
        {account ? (
          <>
            {found?.id ? (
              <button type="button" className="btn" onClick={() => onExit({ to: 'chasse', id: found.id! })}>
                <Icon name="flag" /> Y aller
              </button>
            ) : (
              <button type="button" className="btn" onClick={done}>
                {nearest.kind === 'none' ? 'Prendre une photo' : 'Terminer'}
              </button>
            )}
            {found?.id && (
              <button type="button" className="text-link" onClick={done}>
                Plus tard
              </button>
            )}
          </>
        ) : (
          <>
            <button type="button" className="btn" onClick={signup}>
              {found ? 'Créer mon compte pour la chasser' : 'Créer mon compte'}
            </button>
            {login}
          </>
        )}
      </div>
    </main>
  )
}
