import { describe, expect, it } from 'vitest'
import { failureReason, importLine, lineStatus, refuseFile, reportTitle, type ImportLine } from './importReport'

const here = { lat: 46.1558, lon: -1.1522 }
const line = (state: ImportLine['state'], extra: Partial<ImportLine> = {}): ImportLine => ({ key: state, id: 'p', title: '14 juil. 2025', state, position: null, ...extra })

describe('bilan d’import (0.24.0)', () => {
  it('une ligne par état, avec la distance quand la position est connue', () => {
    expect(lineStatus(line('placed'), here)).toBe('Placée')
    expect(lineStatus(line('located', { position: { lat: 46.1666, lon: -1.1522 } }), here)).toBe('Position trouvée, à orienter sur place · 1,2 km')
    expect(lineStatus(line('located', { position: { lat: 46.1666, lon: -1.1522 } }), null)).toBe('Position trouvée, à orienter sur place')
    expect(lineStatus(line('none'), here)).toBe('Sans position')
    expect(lineStatus(line('failed', { reason: 'trop lourd (60 Mo, 50 Mo au plus)' }), here)).toBe('Illisible · trop lourd (60 Mo, 50 Mo au plus)')
  })

  it('les trois cas d’un lot, dans le titre', () => {
    expect(reportTitle([line('placed'), line('located'), line('none'), line('failed')])).toBe('1 placée · 2 à recaler · 1 illisible')
    expect(reportTitle([line('placed'), line('placed')])).toBe('2 placées')
  })

  it('tri des trois cas : géocadrée, position seule (EXIF ou centre de la carte), rien', () => {
    const july = new Date(2025, 6, 14, 18, 30).getTime()
    const base = { id: 'p', title: 'IMG_0001.jpg', takenAt: july, geoframe: null, hintPosition: null }
    const at = { lat: 46.15812, lon: -1.15391, alt: null }
    const frame = { position: { lat: 46.15585, lon: -1.15302, alt: null }, accuracy: 5, heading: 248.8 } as never
    expect(importLine('a', { ...base, geoframe: frame })).toMatchObject({ state: 'placed', title: '14 juillet 2025', position: { lat: 46.15585 } })
    expect(importLine('b', { ...base, hintPosition: at })).toMatchObject({ state: 'located', position: at })
    expect(importLine('c', { ...base, takenAt: null })).toMatchObject({ state: 'none', title: 'IMG_0001.jpg', position: null })
  })

  it('fichiers refusés : format et taille ; erreurs de lecture expliquées', () => {
    expect(refuseFile({ name: 'a.jpg', type: 'image/jpeg', size: 3e6 })).toBeNull()
    expect(refuseFile({ name: 'IMG_1.HEIC', type: '', size: 3e6 })).toBeNull()
    expect(refuseFile({ name: 'film.mov', type: 'video/quicktime', size: 3e6 })).toBe('format non pris en charge (MOV)')
    expect(refuseFile({ name: 'a.jpg', type: 'image/jpeg', size: 60 * 1024 * 1024 })).toBe('trop lourd (60 Mo, 50 Mo au plus)')
    expect(failureReason(new DOMException('The source image could not be decoded.'))).toMatch(/illisible/)
    expect(failureReason(new Error('Géocadrage en différé : réservé à Premium'))).toBe('réservé à PICTI Premium')
  })
})
