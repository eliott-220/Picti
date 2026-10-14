import { useCallback, useEffect, useMemo, useState } from 'react'
import { updateNorth, type NorthState } from '../geo/heading'
import {
  anglesFromBasis,
  basisFromDeviceOrientation,
  rotateAboutUp,
  rotateForScreen,
  smoothBasis,
  type CameraAngles,
  type CameraBasis,
} from '../geo/orientation'
import { compassReference } from '../geo/guidance'
import { isRemembered, remember } from './permissions'

export type OrientationStatus = 'unsupported' | 'needs-permission' | 'denied' | 'waiting' | 'active'

export interface OrientationState {
  basis: CameraBasis | null
  /** Dernière mesure corrigée du nord, avant lissage ; aide de précision uniquement. */
  measuredBasis: CameraBasis | null
  measuredAt: number
  angles: CameraAngles | null
  /** Le cap est absolu (référencé au nord) et non relatif. */
  absolute: boolean
  status: OrientationStatus
  /** iOS : l'accès aux capteurs doit être demandé suite à un geste. */
  requestPermission(): Promise<boolean>
}

interface CompassEvent extends DeviceOrientationEvent {
  webkitCompassHeading?: number
  webkitCompassAccuracy?: number
}

/** Lissage de l'orientation (ms) : gomme le tremblement sans retarder les mouvements. */
const SMOOTHING_MS = 40

interface PermissionApi {
  requestPermission?: () => Promise<'granted' | 'denied'>
}

const permissionApi = (): PermissionApi | null =>
  typeof DeviceOrientationEvent === 'undefined' ? null : (DeviceOrientationEvent as unknown as PermissionApi)

const needsPermission = () => typeof permissionApi()?.requestPermission === 'function'

/**
 * L'accéléromètre (détection de la marche, `motion.ts`) relève de la même
 * autorisation « mouvement et orientation » : on la demande en même temps,
 * sans attendre ni afficher d'erreur (sans elle, la position suit le GPS).
 */
function requestMotion() {
  const api = typeof DeviceMotionEvent === 'undefined' ? null : (DeviceMotionEvent as unknown as PermissionApi)
  void api?.requestPermission?.().catch(() => undefined)
}

/**
 * Réponse d'iOS à une demande d'accès. « gesture » : la question n'a pas été posée, faute d'appui
 * (`NotAllowedError`) — ce n'est pas un refus de l'utilisateur, la boussole reste à activer.
 */
type CompassAnswer = 'granted' | 'denied' | 'gesture'

// Accordée une fois par session (iOS), valable pour tous les écrans.
let permissionGranted = false
let pendingRequest: Promise<CompassAnswer> | null = null
const grantListeners = new Set<() => void>()

/** iOS (navigateur) : l'accès aux capteurs de mouvement doit être demandé sur un geste. */
export const orientationNeedsPermission = (): boolean => needsPermission() && !permissionGranted

/** Demande (unique à la fois) l'accès à la boussole ; mémorise la réponse. */
function askCompass(): Promise<CompassAnswer> {
  const api = permissionApi()
  if (!api?.requestPermission) return Promise.resolve('granted')
  if (pendingRequest) return pendingRequest
  pendingRequest = api
    .requestPermission()
    .then((answer): CompassAnswer => {
      permissionGranted = answer === 'granted'
      remember('boussole', permissionGranted)
      if (permissionGranted) grantListeners.forEach((l) => l())
      return permissionGranted ? 'granted' : 'denied'
    })
    .catch((): CompassAnswer => 'gesture')
    .finally(() => {
      pendingRequest = null
    })
  requestMotion()
  return pendingRequest
}

export const requestCompass = (): Promise<boolean> => askCompass().then((answer) => answer === 'granted')

/**
 * iOS redemande l'accès à la boussole à chaque ouverture. Si l'utilisateur
 * l'a déjà accordé, on le réactive sans bouton : aussitôt si le système
 * l'accepte, sinon au premier appui n'importe où dans l'app.
 *
 * 0.24.4 : un glissé (changer de page, ouvrir Explorer, pincer pour zoomer) n'est pas un appui pour iOS —
 * la demande faite à la fin du geste est rejetée (vu au simulateur : `touchend` sans activation). Les
 * écouteurs restaient retirés dès ce premier geste : plus rien ne réessayait, seul le bouton marchait.
 * Ils restent maintenant en place jusqu'à une vraie réponse (accordé ou refusé).
 */
function restoreCompass() {
  if (!needsPermission() || permissionGranted || !isRemembered('boussole')) return
  const stop = () => {
    document.removeEventListener('touchend', onGesture, true)
    document.removeEventListener('click', onGesture, true)
  }
  const onGesture = () => {
    if (permissionGranted) return stop()
    void askCompass().then((answer) => {
      if (answer !== 'gesture') stop()
    })
  }
  permissionApi()!
    .requestPermission!()
    .then((answer) => {
      if (answer !== 'granted') return
      permissionGranted = true
      requestMotion()
      grantListeners.forEach((l) => l())
    })
    .catch(() => {
      // Un geste est nécessaire : le premier appui suffira.
      document.addEventListener('touchend', onGesture, true)
      document.addEventListener('click', onGesture, true)
    })
}
if (typeof window !== 'undefined') restoreCompass()

// Nord de la boussole (iPhone), partagé par tous les écrans : passer de l'accueil à la chasse
// garde le même recalage du gyroscope au lieu de repartir de la boussole brute (bruitée) —
// une photo reste au même endroit d'un écran à l'autre. Après une interruption (app en
// arrière-plan), `updateNorth` recale d'abord vite, le repère du gyroscope ayant pu changer.
let sharedNorth: NorthState | null = null

function screenAngle(): number {
  return screen.orientation?.angle ?? (window as { orientation?: number }).orientation ?? 0
}

function initialStatus(): OrientationStatus {
  if (typeof window === 'undefined' || !('DeviceOrientationEvent' in window)) return 'unsupported'
  return needsPermission() && !permissionGranted ? 'needs-permission' : 'waiting'
}

/** Orientation de la caméra arrière, lissée et référencée au nord si possible. */
export function useOrientation(enabled = true): OrientationState {
  const [status, setStatus] = useState<OrientationStatus>(initialStatus)
  const [snapshot, setSnapshot] = useState<{ basis: CameraBasis; absolute: boolean } | null>(null)
  const [measurement, setMeasurement] = useState<{ basis: CameraBasis; at: number } | null>(null)

  // 0.24.0 : on écoute aussi avant l'accès accordé par la page. Dans l'app iOS, les mesures arrivent sans
  // que cette page l'ait demandé (le suivi visuel les recevait, vu dans les journaux de l'iPhone du 13/10)
  // alors que « À proximité » attendait un accès qu'elle ne demandait jamais : flèches figées, nord en haut.
  // Une mesure reçue vaut accès accordé ; dans Safari, rien n'arrive avant la demande (bouton).
  const listening = enabled && status !== 'unsupported' && status !== 'denied'

  // Accès accordé ailleurs (autre écran, ou réactivation automatique).
  useEffect(() => {
    const onGrant = () => setStatus((s) => (s === 'needs-permission' || s === 'denied' ? 'waiting' : s))
    grantListeners.add(onGrant)
    return () => {
      grantListeners.delete(onGrant)
    }
  }, [])

  useEffect(() => {
    if (!listening) return
    let basis: CameraBasis | null = null
    let absolute = false
    let measured: CameraBasis | null = null
    let measuredAt = 0
    let last = 0
    let frame = 0

    const absoluteEvent = 'ondeviceorientationabsolute' in window
    const type = absoluteEvent ? 'deviceorientationabsolute' : 'deviceorientation'

    const onEvent = (e: Event) => {
      const ev = e as CompassEvent
      if ([ev.alpha, ev.beta, ev.gamma].some((v) => v == null || !Number.isFinite(v))) {
        measured = null
        setMeasurement(null)
        return
      }
      if (ev.alpha == null || ev.beta == null || ev.gamma == null) return
      // Horodatage de l'événement : le même pour tous les écrans qui l'écoutent (le nord
      // partagé n'est intégré qu'une fois par mesure).
      const now = ev.timeStamp > 0 ? ev.timeStamp : performance.now()
      let raw = rotateForScreen(basisFromDeviceOrientation(ev.alpha, ev.beta, ev.gamma), screenAngle())
      if (typeof ev.webkitCompassHeading === 'number' && Number.isFinite(ev.webkitCompassHeading) && ev.webkitCompassHeading >= 0) {
        // iOS : alpha vient du gyroscope, relatif à un repère arbitraire ; son écart avec
        // le nord de la boussole est recalé lentement (voir `geo/heading.ts`). La boussole donne le cap
        // de l'objectif debout, celui du haut de l'écran à plat (0.24.0 : `compassReference`).
        const { heading, pitch } = compassReference(raw)
        sharedNorth = updateNorth(sharedNorth, {
          gyroHeading: heading,
          compass: ev.webkitCompassHeading,
          accuracy: typeof ev.webkitCompassAccuracy === 'number' ? ev.webkitCompassAccuracy : null,
          pitch,
          t: now,
        })
        raw = rotateAboutUp(raw, sharedNorth.offset)
        absolute = true
      } else if (sharedNorth) {
        // Boussole momentanément muette : on garde le dernier recalage.
        raw = rotateAboutUp(raw, sharedNorth.offset)
        absolute = true
      } else {
        absolute = absoluteEvent || ev.absolute
      }
      measured = raw
      measuredAt = performance.now()
      basis = smoothBasis(basis, raw, last ? 1 - Math.exp(-Math.max(0, now - last) / SMOOTHING_MS) : 1)
      last = now
      if (!frame) {
        frame = requestAnimationFrame(() => {
          frame = 0
          setSnapshot({ basis: basis!, absolute })
          setMeasurement(measured ? { basis: measured, at: measuredAt } : null)
          setStatus((s) => (s === 'waiting' || s === 'needs-permission' ? 'active' : s))
        })
      }
      if (!permissionGranted) {
        permissionGranted = true
        grantListeners.forEach((l) => l())
      }
    }

    window.addEventListener(type, onEvent)
    return () => {
      window.removeEventListener(type, onEvent)
      cancelAnimationFrame(frame)
    }
  }, [listening])

  // Ordinateur sans capteurs : aucun événement exploitable n'arrive. Compté à partir de l'accès accordé
  // (0.24.4) : accordé plus de 4 s après l'ouverture, la pastille restait à « Boussole… ».
  useEffect(() => {
    if (!enabled || status !== 'waiting') return
    const timeout = setTimeout(() => setStatus((s) => (s === 'waiting' ? 'unsupported' : s)), 4000)
    return () => clearTimeout(timeout)
  }, [enabled, status])

  const requestPermission = useCallback(async () => {
    const answer = await askCompass()
    setStatus(answer === 'granted' ? 'waiting' : answer === 'denied' ? 'denied' : 'needs-permission')
    return answer === 'granted'
  }, [])

  const angles = useMemo(() => (snapshot ? anglesFromBasis(snapshot.basis) : null), [snapshot])

  return {
    basis: snapshot?.basis ?? null,
    measuredBasis: measurement?.basis ?? null,
    measuredAt: measurement?.at ?? -Infinity,
    angles,
    absolute: snapshot?.absolute ?? false,
    status,
    requestPermission,
  }
}
