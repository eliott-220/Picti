// Calage du suivi visuel (ARKit) sur la Terre : fusion trajectoire + GPS + boussole.
//
// Porté de PICTI bis (`bis/src/align.js`, testé sur des sessions simulées). Le suivi visuel donne
// des déplacements précis au centimètre, mais dans un repère local au cap arbitraire ; le GPS donne
// des positions absolues mais bruitées (3 à 10 m, erreur corrélée sur des dizaines de secondes) ;
// la boussole donne un cap bruité (5 à 15°). On cherche la rotation θ et la translation (e0, n0)
// qui envoient la trajectoire locale sur les relevés GPS (moindres carrés pondérés, problème de
// Procuste 2D en forme close), avec la boussole comme a priori sur θ :
//   θ = atan2(S + Σ K·sin θk, C + Σ K·cos θk)
// Debout sans bouger, seule la boussole fixe θ ; en marchant, la forme du trajet le fixe aussi (et
// corrige une boussole faussée). La position devient la moyenne de tous les relevés, ramenés au même
// point par le suivi visuel : elle s'affine en marchant, au lieu de suivre la dérive du GPS.
//
// Repère local : (e', n') = (x, −z) d'ARKit (voir `arPose.ts`) ; ENU = (e0, n0) + Rot(θ)·(e', n'),
// et un cap local h devient h + θ (même rotation que `rotateAboutUp`).

import { fromENU, toENU, type GeoFix, type GeoPoint } from './geodesy'
import { DEG, normalizeDeg } from './math'

/** Point du repère local, à l'horizontale (m) : (e', n'). */
export type LocalPoint = readonly [number, number]

export const ALIGN = {
  /**
   * Relevés GPS à 1 Hz très corrélés (l'erreur dérive sur ~20 s et plus) : un relevé ne vaut qu'une
   * fraction d'information face à la boussole et au recalage.
   */
  gpsCorrelation: 20,
  /** Biais du GPS (multi-trajets) qui ne se moyenne pas : plancher de la précision annoncée (m). */
  gpsBias: 1.5,
  /** Précision minimale prêtée à un relevé (m) : le GPS annonce parfois mieux qu'il ne fait. */
  minAccuracy: 3,
  /** Relevé plus imprécis : ignoré (intérieur, démarrage). */
  maxAccuracy: 40,
  /** Écart-type de la boussole (degrés), élargi si ses mesures se contredisent. */
  compassSigma: 10,
  minCompassSamples: 5,
  /** Mémoire de la boussole : au-delà de ce nombre de mesures, les anciennes s'effacent. */
  maxCompassSamples: 300,
  /** Relevés GPS gardés (5 min à 1 Hz) : au-delà, la dérive du suivi visuel compterait. */
  maxGpsSamples: 300,
  /** Relevé à plus de `outlierFactor` × sa précision (et `outlierFloor` m) du calage : écarté. */
  outlierFactor: 3,
  outlierFloor: 8,
  /** Au-delà (degrés), le cap du repère est trop incertain pour placer des photos. */
  headingOk: 20,
  /**
   * Nombre de relevés « indépendants » pour la précision annoncée : un tous les `correlationTime` s
   * (erreur du GPS corrélée sur ~30 s : la moyenne d'un processus de ce genre vaut un relevé
   * indépendant par double de ce temps) et tous les `correlationDistance` m parcourus (prudent :
   * les tests simulent un GPS dont l'erreur ne dépend pas du lieu, cas le moins favorable).
   */
  correlationTime: 60,
  correlationDistance: 100,
}

interface Sample {
  /** Point du repère local. */
  q: LocalPoint
  /** Position mesurée, ENU (m) autour de la référence. */
  g: LocalPoint
  /** Poids (1 / variance, corrélation comprise). */
  w: number
  /** Précision retenue (m). */
  acc: number
  t: number
  manual?: { theta: number; K: number }
}

/** Calage courant : ENU = (e0, n0) + Rot(θ)·local, autour de `ref`. */
export interface AlignTransform {
  ref: GeoPoint
  /** Degrés : cap ENU = cap local + θ. */
  theta: number
  e0: number
  n0: number
}

export interface AlignState extends Partial<AlignTransform> {
  /** Position ET cap calés : on peut placer des photos. */
  ok: boolean
  /** Ce qui manque : relevé GPS, ou cap (ni boussole ni trajet assez long). */
  reason: 'gps' | 'heading' | null
  /** Précision de la position (m, rayon comparable à celui du GPS). */
  sigmaPos: number
  /** Précision du cap (degrés). */
  sigmaTheta: number
  /** Relevés GPS utilisés, écartés. */
  count: number
  rejected: number
  /** Un recalage sur une photo fait partie du calage. */
  manual: boolean
  /** La boussole a donné assez de mesures. */
  compass: boolean
}

const NONE: AlignState = { ok: false, reason: 'gps', sigmaPos: Infinity, sigmaTheta: Infinity, count: 0, rejected: 0, manual: false, compass: false }

/** Rot(θ) appliquée à un point local : cap local h → h + θ. */
export function rotateLocal([x, y]: LocalPoint, theta: number): LocalPoint {
  const c = Math.cos(theta * DEG)
  const s = Math.sin(theta * DEG)
  return [x * c + y * s, -x * s + y * c]
}

/** Position géographique d'un point local selon un calage. */
export function localToGeo(t: AlignTransform, q: LocalPoint): GeoPoint {
  const [e, n] = rotateLocal(q, t.theta)
  const p = fromENU(t.ref, [t.e0 + e, t.n0 + n, 0])
  return { lat: p.lat, lon: p.lon }
}

/** Cap (degrés depuis le nord) d'un vecteur du repère local. */
export const localHeading = ([x, y]: LocalPoint): number => normalizeDeg(Math.atan2(x, y) / DEG)

export class GeoAligner {
  ref: GeoPoint | null = null
  private gps: Sample[] = []
  private manual: Sample[] = []
  private compass = { sx: 0, sy: 0, n: 0 }
  state: AlignState = NONE

  /** Nouvelle session de suivi (repère local changé) : on oublie tout sauf la référence. */
  reset() {
    this.gps = []
    this.manual = []
    this.compass = { sx: 0, sy: 0, n: 0 }
    this.state = NONE
  }

  /** Associe un relevé GPS au point local de la caméra au même instant ; false s'il est inutilisable. */
  addGps(fix: Pick<GeoFix, 'lat' | 'lon' | 'accuracy' | 'timestamp'>, q: LocalPoint): boolean {
    if (!(fix.accuracy <= ALIGN.maxAccuracy) || !q.every(Number.isFinite)) return false
    if (!this.ref) this.ref = { lat: fix.lat, lon: fix.lon }
    const acc = Math.max(fix.accuracy, ALIGN.minAccuracy)
    const [e, n] = toENU(this.ref, fix)
    this.gps.push({ q, g: [e, n], w: 1 / (acc * acc * ALIGN.gpsCorrelation), acc, t: fix.timestamp })
    if (this.gps.length > ALIGN.maxGpsSamples) this.gps.shift()
    return true
  }

  /** Une mesure de θ = cap boussole de l'objectif − cap de ce même axe dans le repère local. */
  addHeading(thetaDeg: number) {
    if (!Number.isFinite(thetaDeg)) return
    const c = this.compass
    if (c.n >= ALIGN.maxCompassSamples) {
      const k = (ALIGN.maxCompassSamples - 1) / c.n
      c.sx *= k
      c.sy *= k
      c.n *= k
    }
    c.sx += Math.cos(thetaDeg * DEG)
    c.sy += Math.sin(thetaDeg * DEG)
    c.n += 1
  }

  /**
   * Recalage : la photo connue (`geo`, vue au cap `thetaDeg` − cap local) est superposée au décor ;
   * la caméra est donc à son point de vue. Contrainte forte (±0,3 m, ±2°), relative à la photo.
   */
  addFix(q: LocalPoint, geo: GeoPoint, thetaDeg: number, { sigmaPos = 0.3, sigmaTheta = 2 } = {}) {
    if (!this.ref) this.ref = { lat: geo.lat, lon: geo.lon }
    const [e, n] = toENU(this.ref, geo)
    this.manual.push({
      q,
      g: [e, n],
      w: 1 / (sigmaPos * sigmaPos),
      acc: sigmaPos,
      t: 0,
      manual: { theta: thetaDeg * DEG, K: 1 / (sigmaTheta * DEG) ** 2 },
    })
  }

  private priors(): { theta: number; K: number }[] {
    const out = this.manual.map((m) => m.manual!)
    const c = this.compass
    if (c.n >= ALIGN.minCompassSamples) {
      const r = Math.hypot(c.sx, c.sy) / c.n
      // Des caps incohérents (fer, voiture proche) élargissent l'incertitude.
      const spread = Math.sqrt(-2 * Math.log(Math.max(r, 1e-6)))
      const sigma = Math.max(ALIGN.compassSigma * DEG, spread)
      out.push({ theta: Math.atan2(c.sy, c.sx), K: 1 / (sigma * sigma) })
    }
    return out
  }

  solve(): AlignState {
    const samples = [...this.gps, ...this.manual]
    if (!samples.length || !this.ref) return (this.state = NONE)
    const priors = this.priors()
    let fit = fitSamples(samples, priors)
    const kept = samples.filter((s) => s.manual || residual(s, fit) <= Math.max(ALIGN.outlierFactor * s.acc, ALIGN.outlierFloor))
    if (kept.length && kept.length < samples.length) fit = fitSamples(kept, priors)

    const manual = this.manual.length > 0
    const sigmaTheta = fit.H > 0 ? 1 / Math.sqrt(fit.H) / DEG : Infinity
    const sigmaPos = manual ? Math.sqrt(1 / fit.W) : gpsPrecision(kept.filter((s) => !s.manual))
    const ok = sigmaTheta <= ALIGN.headingOk
    this.state = {
      ok,
      reason: ok ? null : 'heading',
      ref: this.ref,
      theta: normalizeDeg(fit.theta / DEG),
      e0: fit.e0,
      n0: fit.n0,
      sigmaPos,
      sigmaTheta,
      count: this.gps.length,
      rejected: samples.length - kept.length,
      manual,
      compass: this.compass.n >= ALIGN.minCompassSamples,
    }
    return this.state
  }
}

/** Calage utilisable pour placer la position (même sans cap). */
export function transformOf(s: AlignState): AlignTransform | null {
  return s.ref && s.theta != null && s.e0 != null && s.n0 != null ? { ref: s.ref, theta: s.theta, e0: s.e0, n0: s.n0 } : null
}

/**
 * Précision de la position moyennée (m) : la variance moyenne des relevés, divisée par le nombre de
 * relevés indépendants — leurs erreurs le deviennent avec le temps et la distance parcourue — sans
 * descendre sous le biais du GPS. Un seul relevé : sa propre précision.
 */
export function gpsPrecision(samples: readonly Pick<Sample, 'q' | 'acc' | 't'>[]): number {
  if (!samples.length) return Infinity
  let inv = 0
  let path = 0
  for (let i = 0; i < samples.length; i++) {
    inv += 1 / samples[i].acc ** 2
    if (i) path += Math.hypot(samples[i].q[0] - samples[i - 1].q[0], samples[i].q[1] - samples[i - 1].q[1])
  }
  const variance = samples.length / inv
  const span = Math.max(0, (samples[samples.length - 1].t - samples[0].t) / 1000)
  const independent = Math.min(samples.length, 1 + span / ALIGN.correlationTime + path / ALIGN.correlationDistance)
  return Math.max(ALIGN.gpsBias, Math.sqrt(variance / independent))
}

interface Fit {
  W: number
  H: number
  theta: number
  e0: number
  n0: number
}

function fitSamples(samples: Sample[], priors: { theta: number; K: number }[]): Fit {
  let W = 0
  let qx = 0
  let qy = 0
  let gx = 0
  let gy = 0
  for (const s of samples) {
    W += s.w
    qx += s.w * s.q[0]
    qy += s.w * s.q[1]
    gx += s.w * s.g[0]
    gy += s.w * s.g[1]
  }
  qx /= W
  qy /= W
  gx /= W
  gy /= W

  let C = 0
  let S = 0
  for (const s of samples) {
    const a0 = s.q[0] - qx
    const a1 = s.q[1] - qy
    const b0 = s.g[0] - gx
    const b1 = s.g[1] - gy
    C += s.w * (a0 * b0 + a1 * b1)
    S += s.w * (b0 * a1 - b1 * a0)
  }
  for (const p of priors) {
    C += p.K * Math.cos(p.theta)
    S += p.K * Math.sin(p.theta)
  }
  const theta = Math.atan2(S, C)
  const [rx, ry] = rotateLocal([qx, qy], theta / DEG)
  return { W, H: Math.hypot(C, S), theta, e0: gx - rx, n0: gy - ry }
}

function residual(s: Sample, fit: Fit): number {
  const [rx, ry] = rotateLocal(s.q, fit.theta / DEG)
  return Math.hypot(s.g[0] - fit.e0 - rx, s.g[1] - fit.n0 - ry)
}
