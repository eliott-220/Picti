import { describe, expect, it } from 'vitest'
import { fromENU } from './geodesy'
import {
  metersBack,
  REPRODUCE_HYSTERESIS_M,
  REPRODUCE_OUT_DELAY_MS,
  reproduceStatus,
  type ReproduceState,
  type ReproduceViewer,
} from './reproduce'
import { sameView, type ViewPoint } from './views'

const origin = { lat: 46.1558, lon: -1.1522 }
/** Photo d'origine : au point d'origine, objectif vers l'ouest (270°), précision 4 m. */
const parent: ViewPoint = { position: origin, accuracy: 4, heading: 270, pitch: 0 }
const viewer = (east: number, north = 0, heading = 270, pitch = 0, time = 0): ReproduceViewer => ({
  position: fromENU(origin, [east, north, 0]),
  heading,
  pitch,
  time,
})

/** Suite de mesures (une toutes les `step` ms), en repartant de l'état précédent. */
function walk(points: { east: number; heading?: number; accuracy?: number }[], step = 500, from: ReproduceState | null = null) {
  let state = from
  const states: ReproduceState[] = []
  for (const [i, p] of points.entries()) {
    state = reproduceStatus(viewer(p.east, 0, p.heading ?? 270, 0, (from ? 60_000 : 0) + i * step), parent, p.accuracy ?? 4, state)
    states.push(state)
  }
  return states
}

describe('reproduceStatus', () => {
  it('au point de vue, bien orienté : dans la vue', () => {
    const s = reproduceStatus(viewer(1), parent, 4, null)
    expect(s.status).toBe('in-view')
    expect(s.inView).toBe(true)
    expect(s.radius).toBe(5)
    expect(s.distance).toBeCloseTo(1, 3)
  })

  it('au-delà de 70 % du rayon : on s’éloigne, avec la distance et le cap pour revenir', () => {
    const s = reproduceStatus(viewer(4), parent, 4, null)
    expect(s.status).toBe('drifting')
    expect(s.inView).toBe(true)
    // Le point de vue est à l'ouest.
    expect(s.bearing).toBeCloseTo(270, 0)
    expect(metersBack(s)).toBe(1)
  })

  it('trop loin : hors de la vue (par la distance)', () => {
    const s = reproduceStatus(viewer(14), parent, 4, null)
    expect(s.status).toBe('out')
    expect(s.reason).toBe('distance')
    expect(s.inView).toBe(false)
    expect(Math.round(s.distance)).toBe(14)
  })

  it('bonne place, mauvaise direction : hors de la vue (par le cap), avec le sens où tourner', () => {
    const s = reproduceStatus(viewer(1, 0, 240), parent, 4, null)
    expect(s.status).toBe('out')
    expect(s.reason).toBe('heading')
    // Il faut tourner de +30° : vers la droite.
    expect(s.headingError).toBeCloseTo(30, 6)
    const pitch = reproduceStatus({ ...viewer(1), pitch: -20 }, parent, 4, null)
    expect(pitch.reason).toBe('pitch')
    expect(pitch.pitchError).toBeCloseTo(20, 6)
  })

  it('à plus de 50 m : lieu quitté', () => {
    expect(reproduceStatus(viewer(49), parent, 4, null).status).toBe('out')
    expect(reproduceStatus(viewer(51), parent, 4, null).status).toBe('lost')
    // Même avec un GPS imprécis, « lieu quitté » l'emporte.
    expect(reproduceStatus(viewer(60), parent, 30, null).status).toBe('lost')
  })

  it('GPS imprécis : on le dit, et la vue utilise le rayon élargi plafonné (comme sameSpot)', () => {
    const weak = reproduceStatus(viewer(8), parent, 18, null)
    expect(weak.status).toBe('gps-weak')
    expect(weak.radius).toBe(10)
    expect(weak.inView).toBe(true)
    expect(weak.view).toBe('drifting')
    const far = reproduceStatus(viewer(14), parent, 18, null)
    expect(far.status).toBe('gps-weak')
    expect(far.view).toBe('out')
    expect(far.inView).toBe(false)
    // À 12 m de précision, le GPS est encore bon.
    expect(reproduceStatus(viewer(1), parent, 12, null).status).toBe('in-view')
  })

  it('anti-scintillement : un saut bref du GPS ne fait pas passer hors de la vue', () => {
    // Dans la vue, saut de 1,5 s à 12 m, puis retour.
    const states = walk([{ east: 1 }, { east: 12 }, { east: 12 }, { east: 12 }, { east: 1 }, { east: 1 }])
    expect(states.map((s) => s.status)).toEqual(['in-view', 'drifting', 'drifting', 'drifting', 'in-view', 'in-view'])
    // Le verdict immédiat, lui, n'est pas amorti (c'est lui qui décide au déclenchement).
    expect(states[2].inView).toBe(false)
  })

  it('anti-scintillement : hors de la vue seulement si l’écart dure 2 s', () => {
    const points = [{ east: 1 }, ...Array.from({ length: 6 }, () => ({ east: 12 }))]
    const states = walk(points)
    const outAt = states.findIndex((s) => s.status === 'out')
    expect(outAt * 500 - 500).toBe(REPRODUCE_OUT_DELAY_MS)
    // Mauvaise direction : on garde l'état précédent pendant le délai.
    const turned = walk([{ east: 1 }, { east: 1, heading: 240 }, { east: 1, heading: 240 }])
    expect(turned.map((s) => s.status)).toEqual(['in-view', 'in-view', 'in-view'])
  })

  it('anti-scintillement : on ne revient dans la vue qu’à 1 m à l’intérieur du rayon', () => {
    const out = walk(Array.from({ length: 6 }, () => ({ east: 12 })))
    expect(out.at(-1)!.status).toBe('out')
    // Rayon de 5 m : à 4,5 m, toujours « hors de la vue » ; à 3,9 m, de nouveau dedans.
    const edge = walk([{ east: 4.5 }, { east: 4.5 }], 500, out.at(-1)!)
    expect(edge.map((s) => s.status)).toEqual(['out', 'out'])
    expect(edge[0].inView).toBe(true)
    const inside = walk([{ east: 5 - REPRODUCE_HYSTERESIS_M - 0.1 }], 500, edge.at(-1)!)
    expect(inside[0].status).toBe('drifting')
    // Revenir d'un lieu quitté : immédiat (sans délai), avec la même marge à 50 m.
    const lost = walk([{ east: 60 }], 500, out.at(-1)!)
    expect(lost[0].status).toBe('lost')
    expect(walk([{ east: 49.5 }], 500, lost[0])[0].status).toBe('lost')
    expect(walk([{ east: 48.5 }], 500, lost[0])[0].status).toBe('out')
  })

  it('même verdict que sameView (la règle de version_of) sur une grille de cas', () => {
    let checked = 0
    for (const east of [0, 2, 4, 4.9, 5.1, 6, 8, 9.9, 10.1, 14])
      for (const north of [0, -3])
        for (const dh of [0, 10, 19, 21, -25, 180])
          for (const dp of [0, 14, -16])
            for (const accuracy of [3, 6, 9, 12, 18, 40])
              for (const parentAccuracy of [2, 8, null]) {
                const p: ViewPoint = { ...parent, accuracy: parentAccuracy }
                const v = viewer(east, north, 270 + dh, dp)
                const s = reproduceStatus(v, p, accuracy, null)
                const expected = sameView({ position: v.position, accuracy, heading: v.heading, pitch: v.pitch }, p)
                expect(s.inView).toBe(expected)
                // Sans historique, l'état affiché suit le même verdict.
                expect(s.view === 'in-view' || s.view === 'drifting').toBe(expected)
                checked++
              }
    expect(checked).toBe(6480)
  })
})
