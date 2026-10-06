import { describe, expect, it } from 'vitest'
import { basisFromAngles, frontCameraBasis, rotateForScreen } from './orientation'
import { coverViewport } from './optics'
import { reproduceOrientation } from './reproduceOrientation'
import { reproduceStatus } from './reproduce'
import { sameView } from './views'
import { reproduceAlert } from '../data/shotWarnings'
import { fromENU } from './geodesy'

const basis = (heading = 0, pitch = 0, roll = 0) => basisFromAngles({ heading, pitch, roll })
const cam = { width: 390, height: 500, focal: 400 }
const guide = (h: number, p = 0, r = 0) => reproduceOrientation(basis(h, p, r), basis(), cam)

describe('Croix de Reproduire : orientation seule', () => {
  it('cible à droite/gauche, plus haute/basse ; tourner et lever rapproche du centre', () => {
    expect(guide(10).x).toBeGreaterThan(195)
    expect(guide(-10).x).toBeLessThan(195)
    expect(guide(0, 10).y).toBeLessThan(250)
    expect(guide(0, -10).y).toBeGreaterThan(250)
    const before = reproduceOrientation(basis(15, 20), basis(), cam)
    const closer = reproduceOrientation(basis(15, 20), basis(10, 15), cam)
    expect(Math.hypot(closer.x - 195, closer.y - 250)).toBeLessThan(Math.hypot(before.x - 195, before.y - 250))
    expect(closer.aligned).toBe(true)
  })
  it('retrouve une inclinaison non nulle, sans référence arbitraire à zéro', () => {
    expect(reproduceOrientation(basis(42, 35, 23), basis(42, 35, 23), cam).aligned).toBe(true)
    expect(reproduceOrientation(basis(42, 35, 23), basis(42, 0, 23), cam).aligned).toBe(false)
  })
  it('passe de 359° à 1° sans saut', () => {
    const g = reproduceOrientation(basis(1), basis(359), cam)
    expect(g.aligned).toBe(true)
    expect(g.x).toBeCloseTo(195 + 400 * Math.tan(2 * Math.PI / 180))
  })
  it('le roulis compte pour cette aide, y compris les quarts et demi-tours', () => {
    for (const roll of [20, 90, 180, -90]) {
      const g = guide(0, 0, roll)
      expect(g.aligned).toBe(false)
      expect(g.message).toContain('pivoter')
      expect(Math.abs(g.roll)).toBeCloseTo(Math.abs(roll))
    }
    expect(guide(0, 0, 11).aligned).toBe(true)
  })
  it('reste stable au zénith et au nadir malgré un cap indéfini', () => {
    for (const pitch of [-90, -89.999, 89.999, 90]) {
      const same = reproduceOrientation(basis(123, pitch, 30), basis(123, pitch, 30), cam)
      expect(same.aligned).toBe(true)
      expect(same.x).toBeCloseTo(195)
      expect(same.y).toBeCloseTo(250)
    }
    // Même visée verticale mais haut de l'image tourné : pas de faux alignement.
    expect(reproduceOrientation(basis(0, 90), basis(90, 90), cam).aligned).toBe(false)
  })
  it('utilise le repère écran en paysage et conserve le vrai centre vidéo recadré', () => {
    for (const angle of [90, 180, 270]) {
      const viewer = rotateForScreen(basis(), angle)
      const c = coverViewport(1920, 1080, 680, 240, 26)
      const aligned = reproduceOrientation(viewer, viewer, c)
      expect(aligned.x).toBeCloseTo(340)
      expect(aligned.y).toBeCloseTo(120)
      expect(aligned.aligned).toBe(true)
    }
    const landscape = reproduceOrientation(basis(10), rotateForScreen(basis(), 90), cam)
    expect(landscape.x).toBeCloseTo(195)
    expect(landscape.y).toBeLessThan(250)
    const cropped = coverViewport(1920, 1080, 390, 500, 26)
    expect(reproduceOrientation(basis(10), basis(), cropped).x).toBeCloseTo(195 + cropped.focal * Math.tan(10 * Math.PI / 180))
  })
  it('borne au bord les cibles hors champ, jamais alignées', () => {
    const g = guide(80, 10)
    expect(g.kind).toBe('edge')
    expect(g.aligned).toBe(false)
    expect(g.x).toBe(370)
    expect(g.y).toBeGreaterThanOrEqual(20)
    expect(g.y).toBeLessThanOrEqual(480)
  })
  it('ne projette jamais derrière ni à profondeur nulle', () => {
    for (const heading of [90, 90.0001, 120, 180, 270]) {
      const g = guide(heading)
      expect(g.kind).toBe('behind')
      expect(g.aligned).toBe(false)
      expect([g.x, g.y, g.direction].every(Number.isFinite)).toBe(true)
      expect(g.message).toMatch(/Tournez|demi-tour/)
    }
  })
  it('selfie : orientation optique enregistrée, miroir appliqué une seule fois', () => {
    const front = frontCameraBasis(basis())
    const target = basis(190, 5, 15)
    const plain = reproduceOrientation(target, front, cam)
    const mirrored = reproduceOrientation(target, front, cam, true)
    expect(mirrored.x).toBeCloseTo(cam.width - plain.x)
    expect(mirrored.y).toBeCloseTo(plain.y)
    expect(mirrored.roll).toBeCloseTo(-plain.roll)
    expect(reproduceOrientation(front, front, cam, true).aligned).toBe(true)
  })
  it('aucun faux alignement sans capteurs ou avec mesures invalides', () => {
    for (const invalid of [null, basis(NaN), basis(Infinity), { f: [0, 0, 0], r: [1, 0, 0], u: [0, 0, 1] } as const]) {
      const g = reproduceOrientation(basis(), invalid, cam)
      expect(g.kind).toBe('unavailable')
      expect(g.aligned).toBe(false)
      expect(g.message).toBe('Alignez la photo à l’œil')
    }
  })
  it('les tolérances mesurées ne dépendent pas de la position bornée', () => {
    expect(guide(5.99).aligned).toBe(true)
    expect(guide(6.01).aligned).toBe(false)
    expect(reproduceOrientation(basis(6.01), basis(), { ...cam, width: 2 }).aligned).toBe(false)
  })
  it('alignées loin du lieu : alerte de distance conservée, rattachement toujours refusé', () => {
    const origin = { lat: 46, lon: -1, alt: 0 }
    const parent = { position: origin, accuracy: 4, heading: 0, pitch: 0 }
    const far = { position: fromENU(origin, [20, 0, 0]), heading: 0, pitch: 0, time: 0 }
    const status = reproduceStatus(far, parent, 4, null)
    expect(guide(0).aligned).toBe(true)
    expect(status.inView).toBe(false)
    expect(reproduceAlert(status)?.text).toContain('Trop loin')
    expect(sameView({ ...far, accuracy: 4 }, parent)).toBe(false)
    // Roulis différent : aide non alignée, rattachement inchangé (pas de roulis dans sameView).
    expect(guide(0, 0, 45).aligned).toBe(false)
    expect(sameView(parent, parent)).toBe(true)
  })
})
