import { describe, expect, it } from 'vitest'
import { ON_FOOT, updateVehicle, VEHICLE, type MotionSample, type VehicleState } from './arVehicle'

/** Relevés d'une seconde : vitesse du GPS, déplacement du GPS et du suivi visuel par seconde (m). */
function run(seconds: number, speed: number | null, gpsStep: number, arStep: number | null, from: VehicleState = ON_FOOT, t0 = 0) {
  const samples: MotionSample[] = []
  let state = from
  for (let i = 0; i < seconds; i++) {
    samples.push({ t: t0 + i * 1000, e: i * gpsStep, n: 0, speed, q: arStep == null ? null : [i * arStep, 0] })
    state = updateVehicle(state, samples)
  }
  return state
}

describe('suivi visuel dans un véhicule', () => {
  it('voiture, bus : le GPS file à 15-20 km/h, ARKit reste immobile → véhicule', () => {
    expect(run(10, 5, 5, 0.02).inVehicle).toBe(true)
  })

  it('à vélo ou en courant : ARKit avance avec le GPS → pas de véhicule', () => {
    expect(run(10, 5, 5, 4.6).inVehicle).toBe(false)
    expect(run(10, 3, 3, 2.8).inVehicle).toBe(false)
  })

  it('à pied, ou GPS qui saute à l’intérieur (vitesse nulle) → pas de véhicule', () => {
    expect(run(15, 1.3, 1.3, 0).inVehicle).toBe(false)
    expect(run(15, 0, 4, 0).inVehicle).toBe(false)
    expect(run(15, null, 4, 0).inVehicle).toBe(false)
  })

  it('sans suivi visuel (caméra coupée) : on ne tranche pas', () => {
    expect(run(10, 5, 5, null).inVehicle).toBe(false)
  })

  it('descendu du véhicule : de nouveau à pied après quelques secondes de marche', () => {
    const inCar = run(10, 5, 5, 0)
    expect(inCar.inVehicle).toBe(true)
    // Arrêt à un feu (2 s), puis le véhicule repart : toujours dedans.
    expect(run(2, 0.5, 0, 0, inCar, 20_000).inVehicle).toBe(true)
    // Marche tenue `exitAfter` : à pied.
    const seconds = VEHICLE.exitAfter / 1000 + 1
    expect(run(seconds, 1.2, 1.2, 1.2, inCar, 20_000).inVehicle).toBe(false)
  })
})
