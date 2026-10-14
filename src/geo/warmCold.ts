// Chaud / froid (0.24.0) : guider jusqu'à une photo entre 20 et 500 m, là où le viseur RA n'aide pas encore.
// En dessous de 20 m, l'affichage RA et la chasse prennent le relais.

import { distanceMeters, type GeoPoint } from './geodesy'

export const WARM_COLD = {
  /** Guidage de `min` à `max` mètres de la photo ; au-delà : rien ; en deçà : le viseur RA. */
  min: 20,
  max: 500,
  /** Froid au-delà (m, bleu). */
  cold: 300,
  /** Chaud en dessous (m, rouge) ; orange entre les deux. */
  hot: 80,
  /** Paliers franchis en s'approchant : `tick`, puis `strong` au dernier. */
  steps: [200, 100, 50, 20],
  /** Palier franchi à nouveau seulement après s'en être éloigné de tant (m) : pas de rafale au bord. */
  rearm: 15,
  /** « Plus chaud / Plus froid » : écart sur … ms, d'au moins … m (ou la précision du GPS). */
  trendWindow: 10_000,
  trendMin: 10,
  /** Croix : photo ignorée pendant … ms. */
  ignoreMs: 3_600_000,
  /** « Tu y es presque : lève le téléphone » reste affiché … ms. */
  almostMs: 5_000,
}

export type Warmth = 'froid' | 'tiede' | 'chaud'

/** Bleu au-delà de 300 m, orange de 300 à 80 m, rouge en dessous. */
export function warmth(distance: number): Warmth {
  return distance > WARM_COLD.cold ? 'froid' : distance >= WARM_COLD.hot ? 'tiede' : 'chaud'
}

/** Photo candidate au guidage (ce qu'il faut en savoir). */
export interface GuideCandidate {
  id: string
  /** Position à rejoindre : celle du géocadrage, sinon la position approchée (photo à recaler). */
  position: GeoPoint | null
  mine: boolean
  geoframed: boolean
  captured: boolean
}

export interface GuideTarget {
  id: string
  position: GeoPoint
  distance: number
  /** Choisie (chasse en cours, « Y aller ») plutôt que la plus proche. */
  chosen: boolean
}

/**
 * Photo vers laquelle guider : celle choisie (chasse en cours, « Y aller » d'une photo à recaler), sinon la
 * plus proche **à capturer** (d'un autre, géocadrée, pas encore capturée) — parmi les photos déjà chargées,
 * sans les ignorées (croix, jusqu'à `ignored[id]`). Rien au-delà de 500 m.
 */
export function pickGuideTarget(
  candidates: readonly GuideCandidate[],
  here: GeoPoint,
  { chosen = null, ignored = {}, now = Date.now() }: { chosen?: string | null; ignored?: Readonly<Record<string, number>>; now?: number } = {},
): GuideTarget | null {
  const open = candidates.filter((c) => c.position && !((ignored[c.id] ?? 0) > now))
  const pick = open.find((c) => c.id === chosen)
  if (pick) {
    const distance = distanceMeters(here, pick.position!)
    return distance <= WARM_COLD.max ? { id: pick.id, position: pick.position!, distance, chosen: true } : null
  }
  let best: GuideTarget | null = null
  for (const c of open) {
    if (c.mine || !c.geoframed || c.captured) continue
    const distance = distanceMeters(here, c.position!)
    if (distance <= WARM_COLD.max && (!best || distance < best.distance)) best = { id: c.id, position: c.position!, distance, chosen: false }
  }
  return best
}

/**
 * Paliers (200, 100, 50, 20 m) franchis en s'approchant : `passed` = paliers déjà sous nos pieds. Un saut
 * qui en franchit plusieurs ne vibre qu'une fois ; un palier se réarme quand on s'en éloigne de `rearm`.
 * Au départ (`passed` null), les paliers déjà sous la distance comptent comme passés, sans vibrer.
 */
export function stepCrossing(
  passed: readonly number[] | null,
  distance: number,
): { passed: number[]; pulse: 'tick' | 'strong' | null } {
  if (passed == null) return { passed: WARM_COLD.steps.filter((s) => distance <= s), pulse: null }
  const kept = passed.filter((s) => distance <= s + WARM_COLD.rearm)
  const crossed = WARM_COLD.steps.filter((s) => distance <= s && !kept.includes(s))
  const last = WARM_COLD.steps[WARM_COLD.steps.length - 1]
  return {
    passed: [...kept, ...crossed],
    pulse: crossed.length === 0 ? null : crossed.includes(last) ? 'strong' : 'tick',
  }
}

/**
 * « Plus chaud » / « Plus froid » : la distance a nettement changé (au moins `trendMin`, ou la précision du
 * GPS) depuis le relevé d'il y a au moins 10 s ; null sinon, ou sans relevé assez ancien.
 */
export function guideTrend(
  samples: readonly { at: number; distance: number }[],
  now: number,
  distance: number,
  accuracy: number,
): 'Plus chaud' | 'Plus froid' | null {
  let past: { at: number; distance: number } | undefined
  for (const s of samples) if (now - s.at >= WARM_COLD.trendWindow) past = s
  if (!past || Math.abs(distance - past.distance) < Math.max(WARM_COLD.trendMin, accuracy)) return null
  return distance < past.distance ? 'Plus chaud' : 'Plus froid'
}

/** Relevés d'une cible : paliers franchis, distances récentes, tendance, dernière impulsion. */
export interface GuideLog {
  id: string
  passed: number[]
  samples: { at: number; distance: number }[]
  trend: 'Plus chaud' | 'Plus froid' | null
  /** Impulsion due à ce relevé (palier franchi). */
  pulse: 'tick' | 'strong' | null
  /** Nombre d'impulsions depuis le début de la cible : chacune ne vibre qu'une fois. */
  beats: number
}

/** Nouveau relevé (`at` : heure de la position, ms) ; une autre cible repart de zéro. */
export function logGuide(log: GuideLog | null, id: string, distance: number, at: number, accuracy: number): GuideLog {
  const same = log?.id === id ? log : null
  const step = stepCrossing(same?.passed ?? null, distance)
  const samples = [...(same?.samples ?? []).filter((s) => at - s.at <= WARM_COLD.trendWindow + 5_000), { at, distance }]
  return {
    id,
    passed: step.passed,
    samples,
    trend: guideTrend(samples, at, distance, accuracy),
    pulse: step.pulse,
    beats: (same?.beats ?? 0) + (step.pulse ? 1 : 0),
  }
}
