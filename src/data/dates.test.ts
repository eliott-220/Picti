import { describe, expect, it } from 'vitest'
import {
  formatClock,
  formatDate,
  formatDateTime,
  formatDayTime,
  formatLongDate,
  memberSince,
  photoDate,
  photoTitleAndDate,
  shotDateText,
  type GeoPhoto,
} from './types'

const ts = new Date(2026, 8, 28, 17, 5).getTime()
const photo = (title: string) => ({ title, takenAt: ts, addedAt: ts + 60_000 }) as GeoPhoto

describe('dates des photos', () => {
  it('ajoute l’heure à la date', () => {
    expect(formatDateTime(ts)).toBe('28 septembre 2026 à 17:05')
    expect(formatDateTime(ts, { short: true })).toBe('28 sept. 2026 · 17:05')
  })

  it('omet l’année en cours dans la version compacte (étiquette du viseur)', () => {
    expect(formatDayTime(ts, new Date(2026, 11, 31).getTime())).toBe('28 sept. · 17:05')
    expect(formatDayTime(ts, new Date(2027, 0, 1).getTime())).toBe('28 sept. 2026 · 17:05')
    expect(formatDayTime(null)).toBe('Date inconnue')
  })

  it('ne répète pas la date quand elle sert de titre', () => {
    const p = photo(formatDate(ts))
    expect(photoDate(p)).toBe('à 17:05')
    expect(photoTitleAndDate(p)).toBe('28 septembre 2026 à 17:05')
  })

  it('garde le titre choisi, suivi de la date et de l’heure', () => {
    const p = photo('Port de La Rochelle')
    expect(photoDate(p)).toBe('28 septembre 2026 à 17:05')
    expect(photoTitleAndDate(p)).toBe('Port de La Rochelle · 28 septembre 2026 à 17:05')
  })
})

describe('fiche : « Prise le … à … »', () => {
  // Espace insécable dans « 14 h 32 » et « 6 octobre ».
  const _ = '\u00a0'
  const tuesday = new Date(2026, 9, 6, 14, 32).getTime()

  it('date longue avec le jour, heure à la française', () => {
    expect(formatLongDate(tuesday)).toBe(`mardi 6${_}octobre 2026`)
    expect(formatLongDate(new Date(2026, 9, 1, 9, 5).getTime())).toBe(`jeudi 1er${_}octobre 2026`)
    expect(formatClock(tuesday)).toBe(`14${_}h${_}32`)
    expect(formatClock(new Date(2026, 9, 1, 9, 5).getTime())).toBe(`9${_}h${_}05`)
    expect(formatClock(new Date(2026, 9, 1, 0, 0).getTime())).toBe(`0${_}h${_}00`)
  })

  it('photo prise dans PICTI : la prise seulement', () => {
    expect(shotDateText({ mode: 'direct', takenAt: tuesday, addedAt: tuesday + 2000 })).toBe(
      `Prise le mardi 6${_}octobre 2026 à 14${_}h${_}32`,
    )
  })

  it('photo importée (différé) prise un autre jour : prise puis ajout', () => {
    const july = new Date(2025, 6, 12, 18, 4).getTime()
    expect(shotDateText({ mode: 'differe-auto', takenAt: july, addedAt: tuesday })).toBe(
      `Prise le samedi 12${_}juillet 2025 à 18${_}h${_}04 · ajoutée à PICTI le 6${_}octobre 2026`,
    )
    // Pas encore géocadrée : même règle.
    expect(shotDateText({ mode: null, takenAt: july, addedAt: tuesday })).toContain('· ajoutée à PICTI le')
    // Importée le jour même : inutile de répéter.
    expect(shotDateText({ mode: 'differe-manuel', takenAt: tuesday - 3600e3, addedAt: tuesday })).toBe(
      `Prise le mardi 6${_}octobre 2026 à 13${_}h${_}32`,
    )
  })

  it('date de prise inconnue : la date d’ajout', () => {
    expect(shotDateText({ mode: 'differe-manuel', takenAt: null, addedAt: tuesday })).toBe(
      `Ajoutée à PICTI le mardi 6${_}octobre 2026 à 14${_}h${_}32`,
    )
  })

  it('date d’inscription du profil public', () => {
    expect(memberSince(new Date(2026, 8, 28).getTime())).toBe('Sur PICTI depuis septembre 2026')
  })
})
