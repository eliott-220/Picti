// Rejeu d'un trajet enregistré par la version de test de l'app iOS (`src/sensors/arTrace.ts`) : on
// refait le calage hors de l'app et on mesure, sur de vraies données, ce que les simulations
// supposent — durée de corrélation de l'erreur du GPS, dispersion et dérive de la boussole, écart
// entre le GPS et le trajet d'ARKit. Sert à régler `ALIGN` ; ne tourne pas dans l'app.

import { ALIGN, GeoAligner, localToGeo, transformOf, type LocalPoint } from './arAlign'
import { localPoint, poseAt, type ArPose } from './arPose'
import { toENU } from './geodesy'
import { angleDiffDeg, type Vec3 } from './math'

/** Ligne du journal (voir `trace()` : `k` = genre, `t` = instant d'écriture). */
export type TraceLine = { k: string; t: number } & Record<string, unknown>

export function parseTrace(text: string): TraceLine[] {
  return text
    .split('\n')
    .filter((l) => l.trim())
    .flatMap((l) => {
      try {
        return [JSON.parse(l) as TraceLine]
      } catch {
        return []
      }
    })
}

export interface ReplaySession {
  session: number
  /** Durée (s) et distance parcourue d'après ARKit (m). */
  duration: number
  path: number
  gps: number
  /** Écart moyen (m) entre chaque relevé et la position calée finale (GPS vs trajet d'ARKit). */
  residualRms: number
  /** Durée (s) au bout de laquelle l'écart d'un relevé n'est plus corrélé qu'à 1/e : à comparer à `ALIGN.correlationTime / 2`. */
  correlationTime: number | null
  /** Boussole : écart-type des mesures de θ (degrés), et dérive entre la première et la dernière minute. */
  compassSpread: number | null
  compassDrift: number | null
  /** Calage final : cap, précision annoncée. */
  theta: number | null
  sigmaPos: number
  sigmaTheta: number
  /** Retour au point de départ (trajet en boucle) : écart d'ARKit entre le départ et l'arrivée la plus proche (m). */
  loopGap: number | null
}

/** Rejoue chaque session du journal (repère d'ARKit propre à chacune). */
export function replay(lines: TraceLine[]): ReplaySession[] {
  const sessions = new Map<number, { poses: ArPose[]; gps: TraceLine[]; compass: TraceLine[] }>()
  let current = 0
  for (const l of lines) {
    if (l.k === 'session') current = l.s as number
    const s = sessions.get(current) ?? { poses: [], gps: [], compass: [] }
    sessions.set(current, s)
    if (l.k === 'pose') {
      const b = l.b as Vec3
      const u = l.u as Vec3
      // Droite = haut × arrière (base directe de la caméra).
      const r: Vec3 = [u[1] * b[2] - u[2] * b[1], u[2] * b[0] - u[0] * b[2], u[0] * b[1] - u[1] * b[0]]
      s.poses.push({ t: l.at as number, position: l.p as Vec3, back: b, up: u, right: r })
    } else if (l.k === 'gps' && l.tracking === 'normal') s.gps.push(l)
    else if (l.k === 'compass' && l.theta != null) s.compass.push(l)
  }
  const out: ReplaySession[] = []
  for (const [session, s] of sessions) {
    if (s.poses.length < 2 || !s.gps.length) continue
    s.poses.sort((a, b) => a.t - b.t)
    const aligner = new GeoAligner()
    const samples: { q: LocalPoint; at: number; lat: number; lon: number }[] = []
    for (const g of s.gps) {
      const pose = poseAt(s.poses, g.at as number, 1000)
      if (!pose) continue
      const q = localPoint(pose)
      if (aligner.addGps({ lat: g.lat as number, lon: g.lon as number, accuracy: g.acc as number, timestamp: g.at as number }, q))
        samples.push({ q, at: g.at as number, lat: g.lat as number, lon: g.lon as number })
    }
    const thetas = s.compass.map((c) => c.theta as number)
    for (const theta of thetas) aligner.addHeading(theta)
    const state = aligner.solve()
    const t = transformOf(state)
    if (!t || !samples.length) continue

    // Écart de chaque relevé au trajet calé (Est, Nord) ; corrélation de cet écart dans le temps.
    const residuals = samples.map((x) => {
      const fit = localToGeo(t, x.q)
      const [e, n] = toENU(fit, x)
      return { at: x.at, e, n }
    })
    const residualRms = Math.sqrt(residuals.reduce((a, r) => a + r.e * r.e + r.n * r.n, 0) / residuals.length)

    let path = 0
    for (let i = 1; i < s.poses.length; i++) {
      const [a0, a1] = localPoint(s.poses[i - 1])
      const [b0, b1] = localPoint(s.poses[i])
      path += Math.hypot(b0 - a0, b1 - a1)
    }
    const first = s.poses[0]
    const start = localPoint(first)
    // Boucle : arrivée la plus proche du départ, parmi les poses d'au moins une minute plus tard.
    let loopGap: number | null = null
    for (const p of s.poses) {
      if (p.t - first.t < 60_000) continue
      const [x, y] = localPoint(p)
      const d = Math.hypot(x - start[0], y - start[1])
      loopGap = loopGap == null ? d : Math.min(loopGap, d)
    }

    out.push({
      session,
      duration: (s.poses[s.poses.length - 1].t - first.t) / 1000,
      path,
      gps: samples.length,
      residualRms,
      correlationTime: correlationTime(residuals),
      compassSpread: thetas.length >= 5 ? circularSpread(thetas) : null,
      compassDrift: compassDrift(s.compass),
      theta: state.theta ?? null,
      sigmaPos: state.sigmaPos,
      sigmaTheta: state.sigmaTheta,
      loopGap: path > 50 ? loopGap : null,
    })
  }
  return out
}

/** Durée (s) où l'autocorrélation de l'écart (relevés ~1/s) tombe sous 1/e. */
export function correlationTime(r: { at: number; e: number; n: number }[]): number | null {
  if (r.length < 20) return null
  const mean = (k: 'e' | 'n') => r.reduce((a, x) => a + x[k], 0) / r.length
  const me = mean('e')
  const mn = mean('n')
  const c = r.map((x) => [x.e - me, x.n - mn] as const)
  const c0 = c.reduce((a, [e, n]) => a + e * e + n * n, 0) / c.length
  if (c0 <= 0) return null
  const step = (r[r.length - 1].at - r[0].at) / 1000 / (r.length - 1)
  for (let lag = 1; lag < c.length / 2; lag++) {
    let sum = 0
    for (let i = 0; i + lag < c.length; i++) sum += c[i][0] * c[i + lag][0] + c[i][1] * c[i + lag][1]
    if (sum / (c.length - lag) / c0 < 1 / Math.E) return lag * step
  }
  return null
}

/** Écart-type circulaire (degrés). */
export function circularSpread(deg: number[]): number {
  const sx = deg.reduce((a, d) => a + Math.cos((d * Math.PI) / 180), 0) / deg.length
  const sy = deg.reduce((a, d) => a + Math.sin((d * Math.PI) / 180), 0) / deg.length
  return (Math.sqrt(-2 * Math.log(Math.max(Math.hypot(sx, sy), 1e-9))) * 180) / Math.PI
}

function circularMean(deg: number[]): number {
  const sx = deg.reduce((a, d) => a + Math.cos((d * Math.PI) / 180), 0)
  const sy = deg.reduce((a, d) => a + Math.sin((d * Math.PI) / 180), 0)
  return (Math.atan2(sy, sx) * 180) / Math.PI
}

/** Écart (degrés) entre la boussole de la première minute et celle de la dernière. */
function compassDrift(c: TraceLine[]): number | null {
  if (c.length < 20) return null
  const t0 = c[0].t
  const t1 = c[c.length - 1].t
  if (t1 - t0 < 120_000) return null
  const first = c.filter((x) => x.t - t0 < 60_000).map((x) => x.theta as number)
  const last = c.filter((x) => t1 - x.t < 60_000).map((x) => x.theta as number)
  return angleDiffDeg(circularMean(first), circularMean(last))
}

/** Rejeu lisible, une ligne par session. */
export function describeReplay(r: ReplaySession): string {
  const f = (x: number | null, d = 1) => (x == null ? '—' : x.toFixed(d))
  return [
    `session ${r.session} : ${f(r.duration, 0)} s, ${f(r.path, 0)} m parcourus, ${r.gps} relevés`,
    `écart GPS / trajet ${f(r.residualRms)} m (corrélé ${f(r.correlationTime, 0)} s ; le calage suppose ~${ALIGN.correlationTime / 2} s)`,
    `boussole ±${f(r.compassSpread)}° (dérive ${f(r.compassDrift)}°)`,
    `cap θ ${f(r.theta)}° ±${f(r.sigmaTheta)}°, position ±${f(r.sigmaPos)} m`,
    r.loopGap != null ? `boucle : ${f(r.loopGap, 2)} m d'écart au retour` : null,
  ]
    .filter(Boolean)
    .join(' · ')
}
