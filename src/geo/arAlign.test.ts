import { describe, expect, it } from 'vitest'
import { ALIGN, GeoAligner, gpsPrecision, localHeading, localToGeo, rotateLocal, transformOf, type AlignTransform, type LocalPoint } from './arAlign'
import { distanceMeters, fromENU } from './geodesy'
import { angleDiffDeg, normalizeDeg } from './math'

// Repris des tests de PICTI bis (`bis/test/align.test.mjs`), plus la précision annoncée et une
// comparaison au GPS seul.

const REF = { lat: 46.1558, lon: -1.152 }

function seeded(seed: number) {
  let s = seed >>> 0
  return () => (s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32
}

const gauss = (rand: () => number) => Math.sqrt(-2 * Math.log(rand() + 1e-12)) * Math.cos(2 * Math.PI * rand())

/** GPS simulé : bruit corrélé (Gauss-Markov, σ, τ en s) + bruit blanc, un relevé par seconde. */
function gpsNoise(rand: () => number, sigma = 3, tau = 30, white = 0.8) {
  const k = Math.exp(-1 / tau)
  let e = gauss(rand) * sigma
  let n = gauss(rand) * sigma
  return (): [number, number] => {
    e = e * k + sigma * Math.sqrt(1 - k * k) * gauss(rand)
    n = n * k + sigma * Math.sqrt(1 - k * k) * gauss(rand)
    return [e + gauss(rand) * white, n + gauss(rand) * white]
  }
}

function fixAt(truth: AlignTransform, q: LocalPoint, noise: () => [number, number], t = 0, accuracy = 5) {
  const g = localToGeo(truth, q)
  const [de, dn] = noise()
  const p = fromENU(g, [de, dn, 0])
  return { lat: p.lat, lon: p.lon, accuracy, timestamp: t * 1000 }
}

/** Erreur du calage estimé au point local `q` (ce qui compte pour une photo). */
function errorAt(truth: AlignTransform, s: ReturnType<GeoAligner['solve']>, q: LocalPoint) {
  return distanceMeters(localToGeo(truth, q), localToGeo(transformOf(s)!, q))
}

describe('repère local', () => {
  it('un cap local h devient h + θ', () => {
    const v = rotateLocal([Math.sin((30 * Math.PI) / 180), Math.cos((30 * Math.PI) / 180)], 50)
    expect(localHeading(v)).toBeCloseTo(80, 9)
    expect(localHeading([1, 0])).toBeCloseTo(90, 9)
    expect(localHeading([0, -1])).toBeCloseTo(180, 9)
  })
})

describe('calage', () => {
  it('sans GPS ni boussole : pas de calage', () => {
    const s = new GeoAligner().solve()
    expect(s.ok).toBe(false)
    expect(s.reason).toBe('gps')
  })

  it('debout sans boussole : position connue mais cap inconnu', () => {
    const truth = { ref: REF, theta: 40, e0: 0, n0: 0 }
    const noise = gpsNoise(seeded(1))
    const a = new GeoAligner()
    for (let i = 0; i < 30; i++) a.addGps(fixAt(truth, [0, 0], noise, i), [0, 0])
    const s = a.solve()
    expect(s.ok).toBe(false)
    expect(s.reason).toBe('heading')
    expect(errorAt(truth, s, [0, 0])).toBeLessThan(8)
  })

  it('debout avec boussole : cap de la boussole, position moyennée', () => {
    const truth = { ref: REF, theta: 212, e0: 0, n0: 0 }
    const rand = seeded(2)
    const noise = gpsNoise(rand)
    const a = new GeoAligner()
    for (let i = 0; i < 60; i++) {
      a.addGps(fixAt(truth, [0, 0], noise, i), [0, 0])
      a.addHeading(truth.theta + 4 + gauss(rand) * 3) // biais de 4° + bruit
    }
    const s = a.solve()
    expect(s.ok).toBe(true)
    expect(Math.abs(angleDiffDeg(truth.theta, s.theta!))).toBeLessThan(7)
    // Le bruit GPS est corrélé sur ~30 s : une minute debout ne le moyenne pas sous quelques mètres.
    expect(errorAt(truth, s, [0, 0])).toBeLessThan(6)
    expect(s.sigmaPos).toBeGreaterThan(2.5)
    expect(s.sigmaPos).toBeLessThan(4)
    expect(s.sigmaTheta).toBeLessThanOrEqual(10.5)
  })

  it('en marchant sans boussole : la forme du trajet donne le cap', () => {
    const rand = seeded(3)
    for (const theta of [15, 130, 250, 333]) {
      const truth = { ref: REF, theta, e0: 6, n0: -4 }
      const noise = gpsNoise(rand)
      const a = new GeoAligner()
      // 60 m en L : tout droit puis à droite, à 1,3 m/s.
      for (let t = 0; t < 46; t++) {
        const d = t * 1.3
        const q: LocalPoint = d < 35 ? [0, d] : [d - 35, 35]
        a.addGps(fixAt(truth, q, noise, t), q)
      }
      const s = a.solve()
      expect(s.ok, `θ=${theta} : σθ ${s.sigmaTheta}`).toBe(true)
      expect(Math.abs(angleDiffDeg(theta, s.theta!))).toBeLessThan(10)
      expect(errorAt(truth, s, [10, 20])).toBeLessThan(6)
    }
  })

  it('trajet + boussole faussée de 15° : le trajet corrige la boussole', () => {
    const rand = seeded(4)
    const truth = { ref: REF, theta: 90, e0: 0, n0: 0 }
    const noise = gpsNoise(rand, 2, 30, 0.5)
    const a = new GeoAligner()
    for (let t = 0; t < 120; t++) {
      const d = (t % 60) * 1.4
      const q: LocalPoint = t < 60 ? [0, d] : [d, 82.6]
      a.addGps(fixAt(truth, q, noise, t), q)
      a.addHeading(90 + 15)
    }
    const s = a.solve()
    expect(s.ok).toBe(true)
    expect(Math.abs(angleDiffDeg(90, s.theta!))).toBeLessThan(10)
  })

  it('un saut GPS isolé est écarté', () => {
    const rand = seeded(5)
    const truth = { ref: REF, theta: 0, e0: 0, n0: 0 }
    const noise = gpsNoise(rand, 1, 30, 0.3)
    const a = new GeoAligner()
    for (let i = 0; i < 40; i++) {
      const fix = fixAt(truth, [0, 0], noise, i)
      if (i === 20) fix.lat += 80 / 111320 // saut de 80 m (sortie de bâtiment, multi-trajet)
      a.addGps(fix, [0, 0])
      a.addHeading(0)
    }
    const s = a.solve()
    expect(s.rejected).toBe(1)
    expect(errorAt(truth, s, [0, 0])).toBeLessThan(3)
  })

  it('recalage sur une photo : prime sur le GPS et la boussole', () => {
    const rand = seeded(6)
    const truth = { ref: REF, theta: 300, e0: 0, n0: 0 }
    const noise = gpsNoise(rand, 5, 60, 1)
    const a = new GeoAligner()
    for (let i = 0; i < 30; i++) {
      a.addGps(fixAt(truth, [0, 0], noise, i), [0, 0])
      a.addHeading(300 + 20) // boussole à 20° près
    }
    // La photo a été prise à 8 m de là ; l'objectif visait au cap local 70°.
    const cam: LocalPoint = [3, 7.4]
    const photoHeading = normalizeDeg(70 + truth.theta)
    a.addFix(cam, localToGeo(truth, cam), photoHeading - 70)
    const s = a.solve()
    expect(s.ok && s.manual).toBe(true)
    expect(Math.abs(angleDiffDeg(300, s.theta!))).toBeLessThan(3)
    expect(errorAt(truth, s, cam)).toBeLessThan(0.5)
    expect(s.sigmaPos).toBeLessThan(0.5)
  })

  it('nouvelle session : on repart de zéro, même référence ; relevé trop imprécis refusé', () => {
    const a = new GeoAligner()
    a.addGps({ lat: REF.lat, lon: REF.lon, accuracy: 5, timestamp: 0 }, [0, 0])
    const ref = a.ref
    a.reset()
    expect(a.solve().ok).toBe(false)
    expect(a.ref).toBe(ref)
    expect(a.addGps({ lat: REF.lat, lon: REF.lon, accuracy: 120, timestamp: 0 }, [0, 0])).toBe(false)
  })

  it('boussole : les vieilles mesures s’effacent (mémoire bornée)', () => {
    const a = new GeoAligner()
    a.addGps({ lat: REF.lat, lon: REF.lon, accuracy: 5, timestamp: 0 }, [0, 0])
    for (let i = 0; i < 1000; i++) a.addHeading(10)
    for (let i = 0; i < 2000; i++) a.addHeading(60)
    expect(Math.abs(angleDiffDeg(60, a.solve().theta!))).toBeLessThan(1)
  })
})

describe('précision annoncée', () => {
  const at = (n: number, dt = 1, step = 0) =>
    Array.from({ length: n }, (_, i) => ({ q: [0, i * step] as LocalPoint, acc: 5, t: i * dt * 1000 }))

  it('un relevé : sa propre précision ; immobile, elle s’affine lentement (erreurs corrélées)', () => {
    expect(gpsPrecision([])).toBe(Infinity)
    expect(gpsPrecision(at(1))).toBeCloseTo(5, 9)
    expect(gpsPrecision(at(61))).toBeCloseTo(5 / Math.SQRT2, 9) // 1 + 60/60 relevés indépendants
  })

  it('en marchant, plus vite (la distance décorrèle aussi le GPS), jamais sous son biais', () => {
    expect(gpsPrecision(at(46, 1, 1.3))).toBeLessThan(gpsPrecision(at(46)))
    expect(gpsPrecision(at(3000, 1, 1.4))).toBe(ALIGN.gpsBias)
  })

  it('honnête : l’erreur réelle reste sous 2 fois la précision annoncée dans 9 cas sur 10', () => {
    const rand = seeded(11)
    let within = 0
    const runs = 200
    for (let r = 0; r < runs; r++) {
      const truth = { ref: REF, theta: rand() * 360, e0: 0, n0: 0 }
      const noise = gpsNoise(rand, 3.5, 30, 0.8)
      const a = new GeoAligner()
      const steps = 10 + Math.floor(rand() * 80)
      const walking = rand() < 0.5
      for (let t = 0; t < steps; t++) {
        const q: LocalPoint = walking ? [0, t * 1.3] : [0, 0]
        a.addGps(fixAt(truth, q, noise, t, 5), q)
        a.addHeading(truth.theta + gauss(rand) * 5)
      }
      const s = a.solve()
      const q: LocalPoint = walking ? [0, (steps - 1) * 1.3] : [0, 0]
      if (errorAt(truth, s, q) <= 2 * s.sigmaPos) within++
    }
    expect(within / runs).toBeGreaterThan(0.9)
  })
})

describe('gain face au GPS seul', () => {
  it('en marchant 2 minutes, la position calée est bien plus juste que le dernier relevé', () => {
    const rand = seeded(21)
    let raw = 0
    let aligned = 0
    const runs = 100
    for (let r = 0; r < runs; r++) {
      const truth = { ref: REF, theta: rand() * 360, e0: rand() * 10, n0: rand() * 10 }
      const noise = gpsNoise(rand, 4, 30, 1)
      const a = new GeoAligner()
      let last = { lat: 0, lon: 0, accuracy: 5, timestamp: 0 }
      let q: LocalPoint = [0, 0]
      for (let t = 0; t < 120; t++) {
        // Aller-retour dans une rue de 40 m, avec un crochet.
        const d = (t * 1.3) % 80
        q = d < 40 ? [0, d] : [8, 80 - d]
        last = fixAt(truth, q, noise, t)
        a.addGps(last, q)
        a.addHeading(truth.theta + gauss(rand) * 8)
      }
      const s = a.solve()
      raw += distanceMeters(last, localToGeo(truth, q))
      aligned += errorAt(truth, s, q)
    }
    // Moyennes sur 100 marches : erreur du GPS seul, erreur après calage (au moins 30 % de moins,
    // avec un GPS simulé dont l'erreur ne dépend que du temps, cas le moins favorable).
    expect(aligned / runs).toBeLessThan((raw / runs) * 0.7)
  })
  it('une photo ne « flotte » plus : sa place bouge de quelques centimètres par seconde, pas de mètres', () => {
    const rand = seeded(31)
    const truth = { ref: REF, theta: 75, e0: 3, n0: -2 }
    const noise = gpsNoise(rand, 4, 30, 1)
    const a = new GeoAligner()
    // Une photo à 6 m devant le point de départ (repère local), regardée en marchant.
    const photo: LocalPoint = [0, 6]
    let rawStep = 0
    let alignedStep = 0
    let prevRaw: { lat: number; lon: number } | null = null
    let prevAligned: { lat: number; lon: number } | null = null
    let count = 0
    for (let t = 0; t < 90; t++) {
      const q: LocalPoint = [0, (t * 1.2) % 20]
      const fix = fixAt(truth, q, noise, t)
      a.addGps(fix, q)
      a.addHeading(truth.theta + gauss(rand) * 8)
      const s = a.solve()
      // GPS seul : la photo est placée par rapport à la position GPS (décalage connu du suivi).
      const rawPhoto = localToGeo({ ref: fix, theta: truth.theta, e0: 0, n0: 0 }, [photo[0] - q[0], photo[1] - q[1]])
      const alignedPhoto = localToGeo(transformOf(s)!, photo)
      if (t >= 10 && prevRaw && prevAligned) {
        rawStep += distanceMeters(prevRaw, rawPhoto)
        alignedStep += distanceMeters(prevAligned, alignedPhoto)
        count++
      }
      prevRaw = rawPhoto
      prevAligned = alignedPhoto
    }
    expect(alignedStep / count).toBeLessThan(0.2)
    expect(rawStep / count).toBeGreaterThan(1)
  })
})
