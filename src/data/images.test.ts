import { describe, expect, it } from 'vitest'
import { jpegOrientation, stripJpegMetadata } from './images'

const seg = (marker: number, payload: number[]) => [0xff, marker, (payload.length + 2) >> 8, (payload.length + 2) & 0xff, ...payload]
const ascii = (s: string) => [...s].map((c) => c.charCodeAt(0))

/** EXIF minimal : TIFF petit-boutiste, IFD0 avec l'orientation, et un texte « GPS » qui ne doit pas survivre. */
function exif(orientation: number) {
  const tiff = [0x49, 0x49, 0x2a, 0x00, 0x08, 0x00, 0x00, 0x00, 0x01, 0x00, 0x12, 0x01, 0x03, 0x00, 0x01, 0x00, 0x00, 0x00, orientation, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]
  return seg(0xe1, [...ascii('Exif'), 0, 0, ...tiff, ...ascii('GPS 46.15N 1.15W iPhone 15 Pro Max')])
}
const jfif = seg(0xe0, [...ascii('JFIF'), 0, 1, 1, 0, 0, 1, 0, 1, 0, 0])
const icc = seg(0xe2, [...ascii('ICC_PROFILE'), 0, 1, 1, 0xaa, 0xbb])
const xmp = seg(0xe1, ascii('http://ns.adobe.com/xap/1.0/ <x:xmpmeta gps="46.15"/>'))
const iptc = seg(0xed, ascii('Photoshop 3.0 IPTC'))
const comment = seg(0xfe, ascii('commentaire'))
const dqt = seg(0xdb, [0, ...Array(64).fill(1)])
const sos = [0xff, 0xda, 0x00, 0x08, 0x01, 0x01, 0x00, 0x00, 0x3f, 0x00, 0x12, 0x34, 0xff, 0x00, 0x56, 0xff, 0xd9]

const jpeg = (...segments: number[][]) => new Uint8Array([0xff, 0xd8, ...segments.flat(), ...sos])
const text = (b: Uint8Array) => String.fromCharCode(...b)

describe('photos sans métadonnées (0.24.0)', () => {
  it('retire EXIF (GPS, modèle), XMP, IPTC et commentaires, sans toucher à l’image', () => {
    const src = jpeg(jfif, exif(1), icc, xmp, iptc, comment, dqt)
    const out = stripJpegMetadata(src)!
    expect(text(out)).not.toMatch(/GPS|iPhone|xmpmeta|IPTC|commentaire|Exif/)
    // Gardés : JFIF, profil de couleur, tables, données de l'image identiques.
    expect(Array.from(out)).toEqual([0xff, 0xd8, ...jfif, ...icc, ...dqt, ...sos])
  })

  it('un JPEG déjà propre ressort identique ; ce qui n’est pas un JPEG : null (à ré-encoder)', () => {
    const clean = jpeg(jfif, dqt)
    expect(Array.from(stripJpegMetadata(clean)!)).toEqual(Array.from(clean))
    expect(stripJpegMetadata(new Uint8Array(ascii('....ftypheic')))).toBeNull()
    expect(stripJpegMetadata(new Uint8Array([0xff, 0xd8, 0xff, 0xe1, 0xff, 0xff]))).toBeNull()
  })

  it('lit l’orientation EXIF (une photo tournée est ré-encodée à l’endroit, pas seulement nettoyée)', () => {
    expect(jpegOrientation(jpeg(jfif, exif(6), dqt))).toBe(6)
    expect(jpegOrientation(jpeg(jfif, exif(1), dqt))).toBe(1)
    expect(jpegOrientation(jpeg(jfif, dqt))).toBeNull()
  })
})
