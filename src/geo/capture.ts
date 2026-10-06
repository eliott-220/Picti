// Capture d'une photo (depuis 0.14.0) : l'utilisateur ne bouge plus, c'est la photo qui vient
// à lui. Sur place (à moins de 5 m du point de vue) et la photo visée, un appui sur « Capturer »
// (ou l'alignement tenu, en chasse) lance l'agrandissement : la carte quitte sa place et grandit
// jusqu'à couvrir tout l'écran pendant que la couleur l'envahit. Elle n'est capturée qu'à 100 %.
// Pendant ce temps il faut rester immobile : marcher, tourner ou perdre la photo de vue annule.

import { angleDiffDeg } from './math'
import type { CameraAngles } from './orientation'

export const CAPTURE = {
  /** Durée de l'agrandissement (ms) : la photo n'est capturée qu'au bout, quand elle couvre l'écran. */
  growMs: 2000,
  /** Retour de la carte à sa place, en rétrécissant (ms) : après une annulation ou une capture. */
  backMs: 300,
  /** Durée d'affichage du message « Capture interrompue : restez immobile » (ms). */
  noticeMs: 2500,
  /**
   * Écart de cap toléré (°) par rapport au départ. Généreux : le cap de l'iPhone, recalé
   * lentement sur sa boussole, peut glisser de quelques degrés sans qu'on ait bougé.
   */
  heading: 12,
  /** Écart d'inclinaison toléré (°) par rapport au départ. */
  pitch: 10,
  /** Objectif à plus de tant de degrés de l'horizon (vers le ciel ou le sol) : cap trop instable, non vérifié. */
  steepPitch: 70,
  /**
   * Pas comptés par l'accéléromètre depuis le départ à partir desquels on marche. La marche n'est
   * reconnue qu'au 3e pas régulier (`MOTION.minSteps`, ≈ 1,5 s) : trop tard pour une capture de
   * 2 s. Deux pas suffisent ici ; un geste isolé (l'appui sur le bouton) ne fait qu'un rebond.
   */
  steps: 2,
}

/** Raison d'une annulation : on s'est mis à marcher, on a tourné le téléphone, la photo a quitté l'écran. */
export type CaptureCancel = 'walking' | 'turned' | 'lost'

/** État des capteurs au départ, puis à chaque image. */
export interface CaptureSample {
  /** Instant (ms). */
  t: number
  /** Orientation de l'objectif, si connue. */
  angles: CameraAngles | null
  /** Pas comptés par l'accéléromètre depuis le début (`MotionDetector.total`), null sans accéléromètre. */
  steps: number | null
  /** La photo capturée est encore à l'écran, à sa place dans le décor. */
  onScreen: boolean
}

export type CaptureCheck =
  | { status: 'growing'; progress: number }
  | { status: 'complete'; progress: 1 }
  | { status: 'cancelled'; progress: number; reason: CaptureCancel }

/**
 * Où en est la capture lancée à `start`, au vu de `now` ? Progression de 0 à 1 en `growMs` ;
 * annulée dès qu'on se met à marcher (`CAPTURE.steps` pas comptés depuis le départ), que le cap ou
 * l'inclinaison s'écartent de leur valeur de départ au-delà des tolérances, ou que la photo
 * sort de l'écran. Une annulation l'emporte sur l'achèvement au même instant.
 */
export function checkCapture(start: CaptureSample, now: CaptureSample): CaptureCheck {
  const progress = Math.min(1, Math.max(0, (now.t - start.t) / CAPTURE.growMs))
  const reason = cancelReason(start, now)
  if (reason) return { status: 'cancelled', progress, reason }
  return progress >= 1 ? { status: 'complete', progress: 1 } : { status: 'growing', progress }
}

function cancelReason(start: CaptureSample, now: CaptureSample): CaptureCancel | null {
  if (start.steps != null && now.steps != null && now.steps - start.steps >= CAPTURE.steps) return 'walking'
  if (start.angles && now.angles && turned(start.angles, now.angles)) return 'turned'
  if (!now.onScreen) return 'lost'
  return null
}

function turned(from: CameraAngles, to: CameraAngles): boolean {
  if (Math.abs(to.pitch - from.pitch) > CAPTURE.pitch) return true
  const steep = Math.max(Math.abs(from.pitch), Math.abs(to.pitch)) > CAPTURE.steepPitch
  return !steep && Math.abs(angleDiffDeg(from.heading, to.heading)) > CAPTURE.heading
}
