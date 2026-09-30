import { describe, expect, it } from 'vitest'
import {
  columnProfile,
  feedFocal,
  focal35FromProfile,
  initialFocalState,
  measuredFocal,
  profileShift,
  type FocalState,
} from './focalCalibration'
import { DEG } from './math'
import { focalPx } from './optics'

/** Décor autour du téléphone : luminosité selon la direction (°), riche en détails. */
const scene = (deg: number) =>
  128 +
  35 * Math.sin((2 * Math.PI * deg) / 37) +
  25 * Math.sin((2 * Math.PI * deg) / 11 + 1) +
  20 * Math.sign(Math.sin((2 * Math.PI * deg) / 23))

/** Profil (px de large) vu par une caméra de focale `focal` (px) orientée au cap `heading`. */
function render(heading: number, focal: number, width = 120): Float32Array {
  const p = new Float32Array(width)
  for (let i = 0; i < width; i++) p[i] = scene(heading + Math.atan((i + 0.5 - width / 2) / focal) / DEG)
  return p
}

/** Flux 1920×2560 (portrait 3:4) réduit à 120 px de large. */
const VIDEO = { width: 1920, height: 2560 }
const SMALL = 120
const smallFocal = (focal35: number) => (focalPx(focal35, VIDEO.width, VIDEO.height) * SMALL) / VIDEO.width

/** Balayages : aller à 40°/s, pause, retour à 30°/s, pause, aller à 60°/s. */
function heading(t: number): number {
  const segments: [number, number][] = [
    [1, 0],
    [3, 40],
    [1, 0],
    [3, -30],
    [1, 0],
    [2, 60],
    [1, 0],
  ]
  let h = 0
  let start = 0
  for (const [duration, rate] of segments) {
    const d = Math.min(Math.max(t - start, 0), duration)
    h += rate * d
    start += duration
  }
  return h
}

/** Simule 30 images par seconde ; la vidéo a `lag` s de retard sur le gyroscope. */
function measure(focal35: number, lag = 0.08, head = heading, duration = 12) {
  const f = smallFocal(focal35)
  let state: FocalState = initialFocalState()
  let prev: Float32Array | null = null
  for (let ms = 0; ms <= duration * 1000; ms += 1000 / 30) {
    const t = ms / 1000
    const frame = render(head(Math.max(0, t - lag)), f)
    const shift = prev ? profileShift(prev, frame) : null
    state = feedFocal(state, { t: ms, heading: head(t), pitch: 2, roll: -1, shift })
    prev = frame
  }
  const measured = measuredFocal(state, SMALL)
  return measured && focal35FromProfile(measured, SMALL, VIDEO.width, VIDEO.height)
}

describe('champ de vision de la caméra', () => {
  it('retrouve le glissement de l’image entre deux vues', () => {
    const f = smallFocal(26)
    const a = render(10, f)
    const b = render(12, f)
    // Tourner de 2° vers la droite fait glisser le décor d'environ 2° vers la gauche.
    expect(profileShift(a, b)).toBeCloseTo(-f * Math.tan(2 * DEG), 0)
  })

  it('ne mesure rien sur un décor uni', () => {
    const flat = new Float32Array(SMALL).fill(120)
    expect(profileShift(flat, flat)).toBeNull()
  })

  it('mesure la focale d’un iPhone Pro (24 mm), malgré le retard de la vidéo', () => {
    expect(measure(24)).toBeGreaterThan(24 * 0.98)
    expect(measure(24)).toBeLessThan(24 * 1.02)
  })

  it('mesure aussi un 26 mm', () => {
    expect(Math.abs(measure(26)! - 26)).toBeLessThan(26 * 0.02)
  })

  it('ne conclut pas sans balayage', () => {
    // Téléphone presque immobile : quelques dixièmes de degré de tremblement.
    expect(measure(24, 0.08, (t) => 0.3 * Math.sin(7 * t))).toBeNull()
  })

  it('lit le profil d’une image RGBA', () => {
    // Image 4×4 : colonnes de gris 0, 50, 100, 150.
    const rgba = new Uint8ClampedArray(4 * 4 * 4)
    for (let y = 0; y < 4; y++)
      for (let x = 0; x < 4; x++) rgba.set([x * 50, x * 50, x * 50, 255], (y * 4 + x) * 4)
    expect(Array.from(columnProfile(rgba, 4, 4))).toEqual([0, 50, 100, 150])
  })
})
