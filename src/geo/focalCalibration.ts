// Mesure du champ de vision réel de la caméra, pendant qu'on s'en sert.
//
// La focale du flux vidéo varie selon l'iPhone (26 mm, 24 mm sur les Pro
// récents) et selon le recadrage appliqué par Safari. Une focale supposée
// fausse fait défiler les photos plus ou moins vite que le décor quand on
// tourne : elles restent décalées. On la mesure : en tournant le téléphone,
// le gyroscope donne l'angle parcouru et l'image glisse d'un certain nombre
// de pixels ; leur rapport est la focale, en pixels.
//
// L'image est réduite à un profil horizontal (luminosité moyenne de chaque
// colonne) ; son glissement d'une image à l'autre est cherché au centre, là
// où un pixel vaut presque le même angle partout (biais corrigé ensuite).

import { angleDiffDeg, DEG } from './math'
import { FULL_FRAME_DIAGONAL_MM } from './optics'

export const FOCAL_CAL = {
  /** Glissement maximal cherché d'une image à l'autre (px du profil). */
  maxShift: 24,
  /** Contraste minimal du profil (écart-type, niveaux de gris) : un mur uni ne dit rien. */
  minContrast: 3,
  /** Rotation régulière exigée sur cette durée (ms) : la vidéo a du retard sur le gyroscope. */
  steadyWindow: 250,
  steadyTolerance: 0.25,
  /** Vitesses de rotation retenues (°/s) : assez pour mesurer, pas trop pour éviter le flou. */
  minRate: 8,
  maxRate: 120,
  /** Inclinaison et roulis maximaux (°) : téléphone tenu à peu près droit. */
  maxTilt: 25,
  /** Angle parcouru (°) pour une mesure. */
  batchYaw: 15,
  /** Mesures concordantes nécessaires, mesures gardées, écart relatif toléré. */
  minEstimates: 7,
  keep: 15,
  maxSpread: 0.05,
  /** Focales équivalentes plausibles (mm). */
  range: [14, 45] as const,
}

/** Luminosité moyenne de chaque colonne d'une image RGBA, sur la bande centrale des lignes. */
export function columnProfile(rgba: ArrayLike<number>, width: number, height: number): Float32Array {
  const profile = new Float32Array(width)
  const from = Math.floor(height / 4)
  const to = Math.ceil((3 * height) / 4)
  for (let y = from; y < to; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4
      profile[x] += 0.299 * rgba[i] + 0.587 * rgba[i + 1] + 0.114 * rgba[i + 2]
    }
  }
  for (let x = 0; x < width; x++) profile[x] /= to - from
  return profile
}

/**
 * Glissement (px) du contenu entre deux profils : `cur[i] ≈ prev[i - shift]`,
 * mesuré sur la moitié centrale ; null si le profil est trop uni ou ambigu.
 */
export function profileShift(prev: ArrayLike<number>, cur: ArrayLike<number>): number | null {
  const n = cur.length
  const from = Math.floor(n / 4)
  const to = Math.ceil((3 * n) / 4)
  const max = Math.min(FOCAL_CAL.maxShift, from)
  let mean = 0
  for (let i = from; i < to; i++) mean += cur[i]
  mean /= to - from
  let variance = 0
  for (let i = from; i < to; i++) variance += (cur[i] - mean) ** 2
  if (Math.sqrt(variance / (to - from)) < FOCAL_CAL.minContrast) return null

  const costs: number[] = []
  for (let s = -max; s <= max; s++) {
    let c = 0
    for (let i = from; i < to; i++) c += Math.abs(cur[i] - prev[i - s])
    costs.push(c / (to - from))
  }
  let best = 0
  for (let k = 1; k < costs.length; k++) if (costs[k] < costs[best]) best = k
  // Minimum au bord de la plage, ou peu marqué : glissement incertain.
  if (best === 0 || best === costs.length - 1) return null
  const sorted = [...costs].sort((a, b) => a - b)
  if (costs[best] > 0.6 * sorted[Math.floor(sorted.length / 2)]) return null
  // Affinage entre deux pixels (parabole passant par les trois coûts voisins).
  const [a, b, c] = [costs[best - 1], costs[best], costs[best + 1]]
  const denom = a - 2 * b + c
  const fraction = denom > 0 ? (a - c) / (2 * denom) : 0
  return best - max + fraction
}

export interface FocalSample {
  /** Instant de l'image (ms). */
  t: number
  /** Orientation de la caméra à cet instant (°). */
  heading: number
  pitch: number
  roll: number
  /** Glissement de l'image depuis la précédente (px du profil), null s'il est inconnu. */
  shift: number | null
}

export interface FocalState {
  /** Caps récents (ms, °), pour vérifier que la rotation est régulière. */
  history: { t: number; heading: number }[]
  /** Mesure en cours : glissement (px) et rotation (rad) cumulés. */
  shift: number
  yaw: number
  /** Focales mesurées (px du profil), des plus anciennes aux plus récentes. */
  estimates: number[]
}

export const initialFocalState = (): FocalState => ({ history: [], shift: 0, yaw: 0, estimates: [] })

/** Intègre une image. */
export function feedFocal(state: FocalState, s: FocalSample): FocalState {
  const last = state.history[state.history.length - 1]
  const history = [...state.history.filter((h) => s.t - h.t <= 2 * FOCAL_CAL.steadyWindow), { t: s.t, heading: s.heading }]
  const next = { ...state, history }
  if (!last || s.shift == null || s.t <= last.t) return next
  if (Math.abs(s.pitch) > FOCAL_CAL.maxTilt || Math.abs(s.roll) > FOCAL_CAL.maxTilt) return next

  // Rotation régulière depuis `steadyWindow` (même vitesse sur ses deux moitiés) : la
  // vidéo, en retard, montre alors le même mouvement que le gyroscope. Les vitesses sont
  // prises sur des demi-fenêtres, les caps arrivant par à-coups d'une image à l'autre.
  const yaw = angleDiffDeg(last.heading, s.heading)
  const window = history.filter((h) => s.t - h.t <= FOCAL_CAL.steadyWindow)
  const first = window[0]
  if (first.t > s.t - FOCAL_CAL.steadyWindow * 0.8) return next
  const middle = window.reduce((m, h) => (Math.abs(h.t - (first.t + s.t) / 2) < Math.abs(m.t - (first.t + s.t) / 2) ? h : m))
  if (middle.t <= first.t || middle.t >= s.t) return next
  const r1 = angleDiffDeg(first.heading, middle.heading) / ((middle.t - first.t) / 1000)
  const r2 = angleDiffDeg(middle.heading, s.heading) / ((s.t - middle.t) / 1000)
  const rate = (r1 + r2) / 2
  if (Math.abs(rate) < FOCAL_CAL.minRate || Math.abs(rate) > FOCAL_CAL.maxRate) return next
  if (Math.abs(r1 - r2) > FOCAL_CAL.steadyTolerance * Math.abs(rate) || yaw * rate <= 0) return next

  const shift = state.shift + s.shift
  const yawRad = state.yaw + yaw * DEG
  if (Math.abs(yawRad) < FOCAL_CAL.batchYaw * DEG) return { ...next, shift, yaw: yawRad }
  // Tourner vers la droite fait glisser le décor vers la gauche.
  const focal = -shift / yawRad
  const estimates = focal > 0 ? [...state.estimates, focal].slice(-FOCAL_CAL.keep) : state.estimates
  return { ...next, shift: 0, yaw: 0, estimates }
}

/**
 * Focale mesurée (px du profil, de largeur `width`), une fois assez de mesures
 * concordantes, corrigée du biais de la perspective : au bord de la bande
 * centrale, un degré couvre un peu plus de pixels qu'au centre.
 */
export function measuredFocal(state: FocalState, width: number): number | null {
  if (state.estimates.length < FOCAL_CAL.minEstimates) return null
  const sorted = [...state.estimates].sort((a, b) => a - b)
  const median = sorted[Math.floor(sorted.length / 2)]
  const deviations = sorted.map((f) => Math.abs(f - median) / median).sort((a, b) => a - b)
  if (deviations[Math.floor(deviations.length / 2)] > FOCAL_CAL.maxSpread) return null
  let bias = 0
  let count = 0
  for (let i = Math.floor(width / 4); i < Math.ceil((3 * width) / 4); i++) {
    bias += 1 + ((i + 0.5 - width / 2) / median) ** 2
    count++
  }
  return median / (bias / count)
}

/** Focale équivalente 24×36 d'un flux `videoW` × `videoH`, mesurée sur un profil de `width` px. */
export function focal35FromProfile(focal: number, width: number, videoW: number, videoH: number): number | null {
  const mm = (focal * (videoW / width) * FULL_FRAME_DIAGONAL_MM) / Math.hypot(videoW, videoH)
  const [min, max] = FOCAL_CAL.range
  return mm >= min && mm <= max ? mm : null
}
