import { describe, expect, it } from 'vitest'
import { CAPTURE_RADIUS, computeAlignment, guidance, viewerEye, withinCaptureRadius } from './alignment'
import { fromENU } from './geodesy'

const spot = { lat: 46.1557, lon: -1.1533 }
const target = { position: spot, angles: { heading: 250, pitch: 2, roll: 0 } }
const fixAt = (east: number, north: number, accuracy = 5) => ({
  ...fromENU(spot, [east, north, 0]),
  accuracy,
  timestamp: 0,
})

describe('computeAlignment', () => {
  it('reconnaît un alignement parfait', () => {
    const al = computeAlignment(target, { position: fixAt(0, 0), angles: target.angles })
    expect(al.aligned).toBe(true)
    expect(al.score).toBeCloseTo(1)
    expect(guidance(al, true)).toBe('Ne bougez plus…')
  })

  it('guide vers le point de vue quand on est loin', () => {
    const al = computeAlignment(target, { position: fixAt(0, -120), angles: target.angles })
    expect(al.onSpot).toBe(false)
    expect(al.aligned).toBe(false)
    expect(al.bearing).toBeCloseTo(0, 0)
    expect(guidance(al, true)).toBe('Point de vue à 120 m vers le N')
  })

  it('capture seulement à moins de 5 m du point de vue, même avec un GPS imprécis', () => {
    expect(CAPTURE_RADIUS).toBe(5)
    const near = computeAlignment(target, { position: fixAt(4, 0, 20), angles: target.angles })
    expect(near.radius).toBe(5)
    expect(near.onSpot).toBe(true)
    expect(near.aligned).toBe(true)
    const far = computeAlignment(target, { position: fixAt(6, 0, 20), angles: target.angles })
    expect(far.onSpot).toBe(false)
    expect(far.aligned).toBe(false)
    expect(guidance(far, true)).toBe('Point de vue à 6 m vers le O')
  })

  it('rayon de capture : 5 m inclus, pas de capture sans position', () => {
    expect(withinCaptureRadius(5)).toBe(true)
    expect(withinCaptureRadius(5.1)).toBe(false)
    expect(withinCaptureRadius(null)).toBe(false)
  })

  it('indique de quel côté se tourner', () => {
    const right = computeAlignment(target, {
      position: fixAt(0, 0),
      angles: { heading: 230, pitch: 2, roll: 0 },
    })
    expect(right.headingError).toBeCloseTo(20)
    expect(guidance(right, true)).toBe('Tournez-vous vers la droite')

    const up = computeAlignment(target, { position: fixAt(0, 0), angles: { heading: 250, pitch: -10, roll: 0 } })
    expect(guidance(up, true)).toBe('Levez légèrement le téléphone')
  })

  it('attend la position GPS', () => {
    const al = computeAlignment(target, { position: null, angles: null })
    expect(al.score).toBe(0)
    expect(guidance(al, false)).toBe('Recherche de votre position…')
  })
})

describe('viewerEye', () => {
  it('place l’œil à la position réelle du spectateur, même tout près du point de vue', () => {
    const eye = viewerEye(spot, fixAt(3, -2))
    expect(eye[0]).toBeCloseTo(3, 6)
    expect(eye[1]).toBeCloseTo(-2, 6)
  })

  it('ignore l’altitude GPS, trop imprécise', () => {
    const eye = viewerEye({ ...spot, alt: 20 }, { ...fixAt(30, 40), alt: 35 })
    expect(eye[0]).toBeCloseTo(30, 6)
    expect(eye[1]).toBeCloseTo(40, 6)
    expect(eye[2]).toBe(0)
  })

  it('retranche le recalage au point de vue', () => {
    const eye = viewerEye(spot, fixAt(3, -2), [3, -2, 0])
    expect(eye[0]).toBeCloseTo(0, 6)
    expect(eye[1]).toBeCloseTo(0, 6)
    // Une fois recalé, on retrouve ses déplacements.
    const moved = viewerEye(spot, fixAt(5, -2), [3, -2, 0])
    expect(moved[0]).toBeCloseTo(2, 6)
  })
})
