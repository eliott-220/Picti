import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { localToGeo, type LocalPoint } from './arAlign'
import { describeReplay, parseTrace, replay, type TraceLine } from './arReplay'
import { fromENU } from './geodesy'

const REF = { lat: 46.1558, lon: -1.152 }

function seeded(seed: number) {
  let s = seed >>> 0
  return () => (s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32
}

/** Journal simulé : une boucle de 4 minutes autour d'un pâté de maisons (40 × 30 m), GPS corrélé sur `tau` s. */
function simulatedTrace(tau: number, seed = 1): TraceLine[] {
  const rand = seeded(seed)
  const gauss = () => Math.sqrt(-2 * Math.log(rand() + 1e-12)) * Math.cos(2 * Math.PI * rand())
  const theta0 = 123
  const truth = { ref: REF, theta: theta0, e0: 0, n0: 0 }
  const corners: LocalPoint[] = [[0, 0], [0, 40], [30, 40], [30, 0], [0, 0]]
  const at = (t: number): LocalPoint => {
    let d = (t * 0.6) % 140
    for (let i = 0; i < 4; i++) {
      const [a, b] = [corners[i], corners[i + 1]]
      const len = Math.hypot(b[0] - a[0], b[1] - a[1])
      if (d <= len) return [a[0] + ((b[0] - a[0]) * d) / len, a[1] + ((b[1] - a[1]) * d) / len]
      d -= len
    }
    return [0, 0]
  }
  const lines: TraceLine[] = [{ k: 'session', t: 0, s: 1 }]
  const k = Math.exp(-1 / tau)
  let ne = gauss() * 4
  let nn = gauss() * 4
  const t0 = 1_000_000
  for (let i = 0; i <= 240 * 5; i++) {
    const t = i / 5
    const [x, y] = at(t)
    const ms = t0 + t * 1000
    // Pose (repère d'ARKit : x, y haut, z ; local = (x, −z)), objectif au cap local 30°.
    lines.push({ k: 'pose', t: ms, at: ms, p: [x, 1.5, -y], b: [-Math.sin(0.52), 0, Math.cos(0.52)], u: [0, 1, 0] })
    if (i % 5 === 0) {
      ne = ne * k + 4 * Math.sqrt(1 - k * k) * gauss()
      nn = nn * k + 4 * Math.sqrt(1 - k * k) * gauss()
      const g = localToGeo(truth, [x, y])
      const p = fromENU(g, [ne + gauss() * 0.5, nn + gauss() * 0.5, 0])
      lines.push({ k: 'gps', t: ms, at: ms, lat: p.lat, lon: p.lon, acc: 5, tracking: 'normal' })
      lines.push({ k: 'compass', t: ms, theta: theta0 + 6 + gauss() * 3 })
    }
  }
  return lines
}

describe('rejeu d’un trajet enregistré', () => {
  it('relit le journal (lignes abîmées ignorées)', () => {
    expect(parseTrace('{"k":"gps","t":1}\n\nnimporte quoi\n{"k":"pose","t":2}\n').map((l) => l.k)).toEqual(['gps', 'pose'])
  })

  it('retrouve la corrélation du GPS, la boussole et la boucle', () => {
    const [short] = replay(simulatedTrace(10))
    const [long] = replay(simulatedTrace(60))
    expect(short.gps).toBe(241)
    expect(short.path).toBeGreaterThan(130)
    expect(short.correlationTime!).toBeLessThan(long.correlationTime!)
    expect(short.correlationTime!).toBeGreaterThan(3)
    expect(short.compassSpread!).toBeGreaterThan(2)
    expect(short.compassSpread!).toBeLessThan(4)
    expect(short.loopGap!).toBeLessThan(0.5)
    expect(Math.abs(short.theta! - 123)).toBeLessThan(8)
    expect(describeReplay(short)).toContain('session 1')
  })
})

// Rejeu de vrais trajets : PICTI_TRACES=<dossier des journaux> npx vitest run src/geo/arReplay.test.ts
const dir = process.env.PICTI_TRACES
describe.runIf(dir)('trajets de l’iPhone', () => {
  it('rejoue chaque journal', () => {
    for (const name of readdirSync(dir!).filter((f) => f.endsWith('.jsonl'))) {
      const path = join(dir!, name)
      const sessions = replay(parseTrace(readFileSync(path, 'utf8')))
      process.stdout.write(`\n${name} (${Math.round(statSync(path).size / 1024)} Ko)\n`)
      for (const s of sessions) process.stdout.write(`  ${describeReplay(s)}\n`)
    }
  })
})
