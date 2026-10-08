// Suivi visuel ARKit (app iOS) : une session partagée par les écrans caméra, calée sur la Terre.
//
// Le plugin natif (`ArTracking`) affiche la caméra derrière la page et envoie la pose de chaque
// image ; ce module la cale sur la Terre (`geo/arAlign.ts`) avec les relevés GPS bruts
// (`onFix`, associés à la pose du même instant) et la boussole d'iOS (`webkitCompassHeading`,
// téléphone stable, objectif près de l'horizon). Les écrans en tirent, à chaque image, la position
// et l'orientation de la caméra : au centimètre près d'une image à l'autre (plus de photos qui
// flottent ni de pas comptés), et de plus en plus juste dans l'absolu à mesure qu'on marche.
//
// Ailleurs (navigateur, Android, iPhone sans ARKit, réglage « Suivi visuel » coupé), rien ne change :
// les écrans gardent la caméra web, le GPS filtré et la boussole.

import { useEffect, useRef, useState, useSyncExternalStore, type RefObject } from 'react'
import type { EncodedImage } from '../data/images'
import { ALIGN, GeoAligner, localToGeo, transformOf, type AlignState, type AlignTransform, type LocalPoint } from '../geo/arAlign'
import {
  approachTransform,
  arBasis,
  arPosition,
  compassTheta,
  focal35Of,
  localPoint,
  localView,
  poseAt,
  poseJumped,
  turnRate,
  type ArPose,
} from '../geo/arPose'
import { distanceMeters, type GeoFix, type GeoPoint } from '../geo/geodesy'
import { angleDiffDeg, normalizeDeg } from '../geo/math'
import type { GpsFix } from '../geo/tracking'
import { anglesFromBasis, type CameraAngles, type CameraBasis } from '../geo/orientation'
import {
  ArTracking,
  hasArTracking,
  nativeFileUrl,
  type NativeArCamera,
  type NativeArPose,
  type NativeArTracking,
  type PluginListenerHandle,
} from '../native'
import { trace } from './arTrace'
import { onFix } from './useGeolocation'

/**
 * `checking` / `starting` : en route (la caméra web ne doit pas démarrer) ; `running` : caméra et poses
 * d'ARKit ; `unavailable` : appareil sans ARKit, ou pas dans l'app iOS ; `disabled` : réglage coupé ;
 * `failed` : la session a échoué (caméra refusée…) ; `off` : arrêtée.
 */
export type ArStatus = 'off' | 'checking' | 'starting' | 'running' | 'unavailable' | 'disabled' | 'failed'

export interface ArState {
  status: ArStatus
  /** Image de l'objectif (portrait) : dimensions et focale (px). */
  camera: { width: number; height: number; focal: number } | null
  tracking: NativeArTracking['state'] | null
  trackingReason: string | null
  align: AlignState
}

export const AR_TRACKING = {
  /** Historique des poses (ms) : un relevé GPS arrive jusqu'à une seconde après sa mesure. */
  history: 10_000,
  /** Le calage affiché rejoint le calage calculé en ce temps (ms) : les photos glissent, ne sautent pas. */
  smoothing: 1500,
  /** Calcul du calage au plus toutes les … ms. */
  solveEvery: 250,
  /** Mesures de boussole au plus toutes les … ms. */
  compassEvery: 100,
  /** Écran caméra quitté : la session continue ce temps (ms), le temps d'ouvrir l'écran suivant. */
  keepAlive: 1500,
}

const SETTING_KEY = 'picti.suivi-visuel'

/** Réglage « Suivi visuel » : activé sauf si l'utilisateur l'a coupé (menu). */
export function arSettingEnabled(): boolean {
  try {
    return localStorage.getItem(SETTING_KEY) !== 'non'
  } catch {
    return true
  }
}

// --- État partagé ---------------------------------------------------------------------------

const aligner = new GeoAligner()
let state: ArState = { status: 'off', camera: null, tracking: null, trackingReason: null, align: aligner.state }
const listeners = new Set<() => void>()
const poseListeners = new Set<() => void>()

let available: Promise<boolean> | null = null
let users = 0
let stopTimer: ReturnType<typeof setTimeout> | undefined
let session = 0
let history: ArPose[] = []
let lastPose: ArPose | null = null
/** Calage calculé, et calage affiché (qui le rejoint en douceur). */
let target: AlignTransform | null = null
let shown: AlignTransform | null = null
let lastSolve = 0
let lastTracedPose = 0
let solveTimer: ReturnType<typeof setTimeout> | undefined
let lastCompass = 0
let stopInputs: (() => void) | null = null
let nativeListeners: Promise<PluginListenerHandle | null>[] | null = null
/** Écrans qui affichent la caméra du suivi ; masquage différé (relais d'un écran à l'autre). */
let showCount = 0
let hideTimer: ReturnType<typeof setTimeout> | undefined

/** État du suivi (statut, image, calage), hors React. */
export const arState = (): ArState => state

function publish(next: Partial<ArState>) {
  state = { ...state, ...next }
  listeners.forEach((l) => l())
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** Nouveau repère (démarrage, reprise après une interruption) : le calage repart de zéro. */
function newSession(s: number) {
  trace('session', { s })
  session = s
  history = []
  lastPose = null
  target = null
  shown = null
  aligner.reset()
  shots.clear()
  publish({ align: aligner.state, tracking: null, trackingReason: null })
}

function solve() {
  clearTimeout(solveTimer)
  solveTimer = undefined
  lastSolve = Date.now()
  const align = aligner.solve()
  target = transformOf(align)
  trace('align', { ok: align.ok, theta: align.theta, e0: align.e0, n0: align.n0, ref: align.ref, sigmaPos: align.sigmaPos, sigmaTheta: align.sigmaTheta, count: align.count, rejected: align.rejected })
  refineShots(align)
  publish({ align })
}

/** Calage recalculé bientôt (au plus toutes les `solveEvery` ms). */
function solveSoon() {
  if (solveTimer) return
  const wait = Math.max(0, lastSolve + AR_TRACKING.solveEvery - Date.now())
  solveTimer = setTimeout(solve, wait)
}

function onPose(e: NativeArPose) {
  if (state.status !== 'running') return
  if (e.s !== session) {
    if (e.s < session) return
    newSession(e.s)
  }
  const pose: ArPose = { t: e.t, position: e.p, right: e.r, up: e.u, back: e.b }
  if (lastPose && poseJumped(lastPose, pose)) carryOver(lastPose, pose)
  const dt = lastPose ? pose.t - lastPose.t : 0
  history.push(pose)
  while (history.length && history[0].t < pose.t - AR_TRACKING.history) history.shift()
  lastPose = pose
  if (pose.t - lastTracedPose >= 200) {
    lastTracedPose = pose.t
    trace('pose', { s: e.s, at: e.t, p: e.p, b: e.b, u: e.u })
  }
  if (target) shown = approachTransform(shown, target, dt, AR_TRACKING.smoothing)
  poseListeners.forEach((l) => l())
}

/**
 * Le repère d'ARKit a sauté (relocalisation) : les anciens relevés ne s'y rapportent plus. On repart de
 * zéro en gardant ce qu'on savait — la caméra n'a pas bougé entre les deux images : sa position et son
 * cap calés deviennent le point de départ du nouveau calage, avec leur précision.
 */
function carryOver(before: ArPose, after: ArPose) {
  const t = shown
  const known = state.align
  trace('jump', { from: before.position, to: after.position })
  history = []
  shots.clear()
  aligner.reset()
  if (t && Number.isFinite(known.sigmaPos)) {
    const turn = localView(after).heading - localView(before).heading
    aligner.addFix(localPoint(after), arPosition(before, t), t.theta - turn, {
      sigmaPos: Math.max(known.sigmaPos, ALIGN.gpsBias),
      sigmaTheta: Math.max(known.sigmaTheta, 3),
    })
  }
  solve()
  shown = target
}

function onCamera(e: NativeArCamera) {
  if (e.s >= session) publish({ camera: { width: e.width, height: e.height, focal: e.focal } })
}

function onTracking(e: NativeArTracking) {
  if (e.s < session) return
  trace('tracking', { s: e.s, state: e.state, reason: e.reason })
  if (e.state === 'failed') {
    // Caméra refusée, capteur indisponible : retour à la caméra web.
    publish({ status: 'failed', tracking: e.state, trackingReason: e.reason })
    stopSession()
    return
  }
  publish({ tracking: e.state, trackingReason: e.reason })
}

/** Relevé GPS : associé à la position de la caméra au même instant, s'il est sûr. */
function onGps(fix: GpsFix) {
  if (state.status !== 'running') return
  trace('gps', { at: fix.timestamp, lat: fix.lat, lon: fix.lon, acc: fix.accuracy, speed: fix.speed, course: fix.course, tracking: state.tracking })
  if (state.tracking !== 'normal') return
  const pose = poseAt(history, fix.timestamp)
  if (pose && aligner.addGps(fix, localPoint(pose))) solveSoon()
}

interface CompassEvent extends DeviceOrientationEvent {
  webkitCompassHeading?: number
  webkitCompassAccuracy?: number
}

/** Boussole d'iOS : une mesure de θ quand le téléphone est stable et l'objectif près de l'horizon. */
function onCompass(e: Event) {
  const ev = e as CompassEvent
  const now = Date.now()
  if (state.status !== 'running' || state.tracking !== 'normal' || !lastPose) return
  if (typeof ev.webkitCompassHeading !== 'number' || now - lastCompass < AR_TRACKING.compassEvery) return
  lastCompass = now
  const accuracy = typeof ev.webkitCompassAccuracy === 'number' ? ev.webkitCompassAccuracy : null
  const rate = turnRate(history)
  const theta = compassTheta(ev.webkitCompassHeading, accuracy, lastPose, rate)
  trace('compass', { heading: ev.webkitCompassHeading, acc: accuracy, rate: Math.round(rate * 10) / 10, theta })
  if (theta == null) return
  aligner.addHeading(theta)
  solveSoon()
}

function listenNative() {
  if (nativeListeners) return
  const keep = (p: Promise<PluginListenerHandle>) => p.catch(() => null)
  nativeListeners = [
    keep(ArTracking.addListener('pose', onPose)),
    keep(ArTracking.addListener('camera', onCamera)),
    keep(ArTracking.addListener('tracking', onTracking)),
    keep(ArTracking.addListener('session', ({ s }) => newSession(s))),
  ]
}

function startInputs() {
  if (stopInputs) return
  const stopGps = onFix(onGps)
  window.addEventListener('deviceorientation', onCompass)
  stopInputs = () => {
    stopGps()
    window.removeEventListener('deviceorientation', onCompass)
  }
}

async function startSession() {
  if (!hasArTracking()) return publish({ status: 'unavailable' })
  if (!arSettingEnabled()) return publish({ status: 'disabled' })
  publish({ status: 'checking' })
  try {
    available ??= ArTracking.isAvailable()
      .then((r) => r.available)
      .catch(() => false)
    if (!(await available)) return publish({ status: 'unavailable' })
    if (users === 0) return publish({ status: 'off' })
    publish({ status: 'starting' })
    listenNative()
    const { session: s } = await ArTracking.start()
    newSession(s)
    startInputs()
    publish({ status: users === 0 ? 'off' : 'running' })
    if (users === 0) stopSession()
  } catch {
    // Quoi qu'il arrive (plugin absent ou plus ancien que la page, caméra refusée…), la caméra web
    // prend le relais : jamais d'écran noir.
    publish({ status: 'failed' })
  }
}

function stopSession() {
  clearTimeout(stopTimer)
  stopInputs?.()
  stopInputs = null
  void ArTracking.stop().catch(() => undefined)
  history = []
  lastPose = null
  if (state.status === 'running' || state.status === 'starting') publish({ status: 'off' })
}

function acquire() {
  users++
  clearTimeout(stopTimer)
  if (state.status === 'off' || state.status === 'disabled') void startSession()
}

/** `now` : l'écran garde la caméra mais passe au selfie : arrêt immédiat, la caméra web en a besoin. */
function release(now: boolean) {
  users = Math.max(0, users - 1)
  if (users > 0) return
  clearTimeout(stopTimer)
  if (now) stopSession()
  else stopTimer = setTimeout(stopSession, AR_TRACKING.keepAlive)
}

/** Coupe ou rétablit le suivi visuel (menu) ; les écrans passent aussitôt à l'autre caméra. */
export function setArSetting(enabled: boolean) {
  try {
    localStorage.setItem(SETTING_KEY, enabled ? 'oui' : 'non')
  } catch {
    // Stockage refusé : le réglage vaut pour cette visite.
  }
  if (!enabled) {
    if (state.status === 'running' || state.status === 'starting') stopSession()
    publish({ status: 'disabled' })
  } else if (state.status === 'disabled') {
    publish({ status: 'off' })
    if (users > 0) void startSession()
  }
}

/** État du suivi, pour l'affichage (menu, pastilles). */
export function useArState(): ArState {
  return useSyncExternalStore(subscribe, () => state)
}

// --- Photos prises pendant la session ------------------------------------------------------
//
// Une photo prise avec le suivi visuel garde sa place dans le repère de la session ; quand le calage
// s'affine (plus de relevés GPS, trajet plus long), son géocadrage est récrit avec la nouvelle
// position et le nouveau cap — comme dans PICTI bis. Seulement s'il devient plus précis.

export const AR_REFINE = {
  /** Récrire si la photo bouge d'au moins … m, ou tourne d'au moins … degrés. */
  minShift: 0.75,
  minTurn: 1.5,
  /** Au plus une écriture toutes les … ms par photo. */
  every: 20_000,
  /** Gain de précision minimal (m) pour récrire. */
  minGain: 0.3,
}

/** Nouveau géocadrage d'une photo de la session. */
export interface ShotRefinement {
  id: string
  position: GeoPoint
  accuracy: number
  heading: number
}

export interface SessionShot {
  id: string
  /** Position de la caméra dans le repère local de la session. */
  q: LocalPoint
  /** Cap du calage (θ) et géocadrage enregistrés en dernier. */
  theta: number
  heading: number
  position: GeoPoint
  accuracy: number
  written: number
}

const shots = new Map<string, SessionShot>()
const refineListeners = new Set<(r: ShotRefinement) => void>()

/**
 * Photo prise par le suivi visuel (pose `pose` de son image) et enregistrée avec ce géocadrage :
 * elle sera replacée tant que la session dure.
 */
export function trackArShot(id: string, pose: NativeArPose, recorded: { position: GeoPoint; heading: number; accuracy: number | null }) {
  if (pose.s !== session || !shown || state.status !== 'running') return
  shots.set(id, {
    id,
    q: localPoint({ position: pose.p }),
    theta: shown.theta,
    heading: recorded.heading,
    position: recorded.position,
    accuracy: recorded.accuracy ?? Infinity,
    written: Date.now(),
  })
}

/** Photo supprimée, ou mise à jour refusée : on ne la suit plus. */
export function forgetArShot(id: string) {
  shots.delete(id)
}

/** Écoute les nouveaux géocadrages des photos de la session ; renvoie de quoi se désabonner. */
export function onArShotRefined(listener: (r: ShotRefinement) => void): () => void {
  refineListeners.add(listener)
  return () => {
    refineListeners.delete(listener)
  }
}

/** Calcule, pour chaque photo de la session, si son géocadrage doit être récrit. */
export function refinement(shot: SessionShot, t: AlignTransform, sigmaPos: number, now: number): ShotRefinement | null {
  if (now - shot.written < AR_REFINE.every || sigmaPos > shot.accuracy - AR_REFINE.minGain) return null
  const position = localToGeo(t, shot.q)
  const heading = normalizeDeg(shot.heading + (t.theta - shot.theta))
  const moved = distanceMeters(position, shot.position) >= AR_REFINE.minShift
  const turned = Math.abs(angleDiffDeg(shot.heading, heading)) >= AR_REFINE.minTurn
  if (!moved && !turned) return null
  return { id: shot.id, position, accuracy: Math.round(sigmaPos * 10) / 10, heading }
}

function refineShots(align: AlignState) {
  const t = transformOf(align)
  if (!t || !align.ok || !shots.size) return
  const now = Date.now()
  for (const shot of shots.values()) {
    const r = refinement(shot, t, align.sigmaPos, now)
    if (!r) continue
    Object.assign(shot, { theta: t.theta, heading: r.heading, position: r.position, accuracy: r.accuracy, written: now })
    trace('refine', { ...r })
    refineListeners.forEach((l) => l(r))
  }
}

// --- Vue de la caméra -------------------------------------------------------------------------

export interface ArView {
  /** Position calée de la caméra ; null sans relevé GPS sûr. Précision = celle du calage. */
  fix: GeoFix | null
  /** Orientation de la caméra (ENU) ; null tant que le cap n'est pas calé. */
  basis: CameraBasis | null
  angles: CameraAngles | null
  /** Instant du calcul (`performance.now()`). */
  at: number
}

const NO_VIEW: ArView = { fix: null, basis: null, angles: null, at: -Infinity }

/** Vue actuelle d'après la dernière pose et le calage affiché. */
export function currentView(): ArView {
  if (!lastPose || !shown) return NO_VIEW
  const p = arPosition(lastPose, shown)
  const fix: GeoFix = {
    lat: p.lat,
    lon: p.lon,
    alt: null,
    accuracy: Math.max(1, Math.round(state.align.sigmaPos * 10) / 10),
    timestamp: lastPose.t,
  }
  const at = performance.now()
  if (!state.align.ok) return { fix, basis: null, angles: null, at }
  const basis = arBasis(lastPose, shown.theta)
  return { fix, basis, angles: anglesFromBasis(basis), at }
}

/**
 * Suivi visuel pour un écran caméra : `wanted` (caméra arrière) démarre la session partagée. Renvoie
 * l'état (statut, image, calage) et la vue de la caméra, recalculée à chaque image.
 */
export function useArTracking(wanted: boolean): { state: ArState; view: ArView } {
  const current = useSyncExternalStore(subscribe, () => state)
  const [view, setView] = useState<ArView>(NO_VIEW)
  const running = wanted && current.status === 'running'

  // Écran quitté : la session continue un instant (l'écran caméra suivant la reprend) ; caméra
  // arrière abandonnée sur place (selfie) : arrêt immédiat, la caméra avant en a besoin. Cet effet,
  // déclaré en premier, est aussi défait en premier au démontage.
  const mounted = useRef(true)
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])

  useEffect(() => {
    if (!wanted) return
    acquire()
    return () => release(mounted.current)
  }, [wanted])

  useEffect(() => {
    if (!running) return
    let frame = 0
    const onPoseTick = () => {
      if (!frame) frame = requestAnimationFrame(() => {
        frame = 0
        setView(currentView())
      })
    }
    poseListeners.add(onPoseTick)
    return () => {
      poseListeners.delete(onPoseTick)
      cancelAnimationFrame(frame)
    }
  }, [running])

  return { state: current, view: running ? view : NO_VIEW }
}

/**
 * Affiche la caméra du suivi derrière l'élément `stage` (la page y devient transparente : classe
 * `picti-ar` sur <html>), tant que `visible`.
 */
export function useArCamera(stage: RefObject<HTMLElement | null>, visible: boolean) {
  useEffect(() => {
    const el = stage.current
    if (!visible || !el) return
    let last = ''
    let frame = 0
    const place = () => {
      frame = 0
      const r = el.getBoundingClientRect()
      const key = [r.left, r.top, r.width, r.height].map((v) => Math.round(v * 2) / 2).join(',')
      if (key === last) return
      last = key
      void ArTracking.show({ x: r.left, y: r.top, width: r.width, height: r.height }).catch(() => undefined)
    }
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(place)
    }
    showCount++
    clearTimeout(hideTimer)
    document.documentElement.classList.add('picti-ar')
    place()
    const observer = new ResizeObserver(schedule)
    observer.observe(el)
    window.addEventListener('resize', schedule)
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', schedule)
      cancelAnimationFrame(frame)
      if (--showCount > 0) return
      // Un autre écran caméra peut prendre le relais dans la foulée : pas de clignotement.
      hideTimer = setTimeout(() => {
        if (showCount > 0) return
        document.documentElement.classList.remove('picti-ar')
        void ArTracking.hide().catch(() => undefined)
      }, 150)
    }
  }, [stage, visible])
}

/** Photo prise par le suivi : l'image de l'objectif (haute résolution) et sa focale équivalente. */
export async function captureArPhoto(): Promise<EncodedImage & { focal35: number; pose: NativeArPose }> {
  const shot = await ArTracking.capture()
  const response = await fetch(nativeFileUrl(shot.path))
  if (!response.ok) throw new Error('Photo illisible')
  const blob = await response.blob()
  const view = currentView()
  trace('shot', { at: shot.pose.t, p: shot.pose.p, fix: view.fix, angles: view.angles, width: shot.width, height: shot.height, focal: shot.focal })
  return { blob, width: shot.width, height: shot.height, focal35: focal35Of(shot.focal, shot.width, shot.height), pose: shot.pose }
}
