import { describe, expect, it } from 'vitest'
import { CAPTURE, checkCapture, type CaptureSample } from './capture'

// Au départ : téléphone vers le nord-est, à l'horizontale, 12 pas déjà comptés.
const start: CaptureSample = { t: 1000, angles: { heading: 40, pitch: 2, roll: 0 }, steps: 12, onScreen: true }

/** Mesure `ms` après le départ, immobile sauf ce qui change. */
const at = (ms: number, change: Partial<CaptureSample> = {}): CaptureSample => ({ ...start, t: start.t + ms, ...change })

describe('capture par agrandissement', () => {
  it('immobile : progresse, puis capturée à 100 %, quand la photo couvre l’écran', () => {
    expect(checkCapture(start, at(0))).toEqual({ status: 'growing', progress: 0 })
    expect(checkCapture(start, at(CAPTURE.growMs / 2))).toEqual({ status: 'growing', progress: 0.5 })
    expect(checkCapture(start, at(CAPTURE.growMs - 1)).status).toBe('growing')
    expect(checkCapture(start, at(CAPTURE.growMs))).toEqual({ status: 'complete', progress: 1 })
    expect(checkCapture(start, at(CAPTURE.growMs + 500))).toEqual({ status: 'complete', progress: 1 })
  })

  it('la boussole tremble un peu : la capture continue', () => {
    const jitter = { heading: 40 + CAPTURE.heading - 2, pitch: 2 - (CAPTURE.pitch - 2), roll: 8 }
    expect(checkCapture(start, at(1500, { angles: jitter })).status).toBe('growing')
    expect(checkCapture(start, at(CAPTURE.growMs, { angles: jitter })).status).toBe('complete')
  })

  it('annulée si l’on se met à marcher (deux pas)', () => {
    const check = checkCapture(start, at(900, { steps: 14 }))
    expect(check).toEqual({ status: 'cancelled', progress: 0.45, reason: 'walking' })
  })

  it('un seul rebond (l’appui sur le bouton, un geste) : la capture continue', () => {
    expect(checkCapture(start, at(900, { steps: 13 })).status).toBe('growing')
    expect(checkCapture(start, at(CAPTURE.growMs, { steps: 13 })).status).toBe('complete')
  })

  it('sans accéléromètre : seule l’orientation compte', () => {
    const noMotion = { ...start, steps: null }
    expect(checkCapture(noMotion, { ...noMotion, t: start.t + CAPTURE.growMs }).status).toBe('complete')
  })

  it('annulée si l’on tourne le téléphone (cap)', () => {
    const turned = checkCapture(start, at(1200, { angles: { heading: 40 + CAPTURE.heading + 3, pitch: 2, roll: 0 } }))
    expect(turned).toMatchObject({ status: 'cancelled', reason: 'turned' })
    // Écart compté au plus court, de part et d'autre du nord.
    const north = { ...start, angles: { heading: 355, pitch: 0, roll: 0 } }
    expect(checkCapture(north, { ...north, t: north.t + 500, angles: { heading: 5, pitch: 0, roll: 0 } }).status).toBe(
      'growing',
    )
    expect(
      checkCapture(north, { ...north, t: north.t + 500, angles: { heading: 25, pitch: 0, roll: 0 } }).status,
    ).toBe('cancelled')
  })

  it('annulée si l’on lève ou baisse le téléphone (inclinaison)', () => {
    const raised = checkCapture(start, at(600, { angles: { heading: 40, pitch: 2 + CAPTURE.pitch + 1, roll: 0 } }))
    expect(raised).toMatchObject({ status: 'cancelled', reason: 'turned' })
  })

  it('objectif vers le ciel : cap trop instable, seule l’inclinaison compte', () => {
    const sky = { ...start, angles: { heading: 40, pitch: 80, roll: 0 } }
    const spun = { ...sky, t: sky.t + 800, angles: { heading: 100, pitch: 78, roll: 0 } }
    expect(checkCapture(sky, spun).status).toBe('growing')
  })

  it('annulée si la photo sort de l’écran', () => {
    expect(checkCapture(start, at(300, { onScreen: false }))).toMatchObject({ status: 'cancelled', reason: 'lost' })
  })

  it('une annulation l’emporte sur l’achèvement au même instant', () => {
    expect(checkCapture(start, at(CAPTURE.growMs, { steps: 14 }))).toMatchObject({
      status: 'cancelled',
      progress: 1,
      reason: 'walking',
    })
  })
})
