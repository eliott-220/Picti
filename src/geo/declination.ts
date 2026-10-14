// Nord vrai / nord magnétique (0.24.0, import de photos).
//
// Dans PICTI, tous les caps viennent de la boussole du téléphone — `webkitCompassHeading` sur iPhone,
// orientation « absolue » sur Android, et le suivi visuel d'ARKit, calé sur cette même boussole : ce sont des
// caps MAGNÉTIQUES. L'EXIF d'une photo, lui, note sa direction (`GPSImgDirection`) en nord vrai (`T`, ce
// qu'écrit l'iPhone) ou magnétique (`M`). Un cap vrai est ramené au nord magnétique du lieu par la
// déclinaison (positive vers l'est : vrai = magnétique + déclinaison), calculée par le modèle magnétique
// mondial WMM 2025 (paquet `magvar`, valable 2025-2030, chargé seulement à l'import).

import { normalizeDeg } from './math'

/** Cap de l'EXIF ramené au nord des caps de PICTI (magnétique). Référence inconnue : laissé tel quel. */
export function toAppNorth(heading: number, ref: 'T' | 'M' | null, declination: number): number {
  return ref === 'T' ? normalizeDeg(heading - declination) : normalizeDeg(heading)
}

/** Déclinaison magnétique (°, positive vers l'est) en ce lieu, aujourd'hui (le cap servira aujourd'hui). */
export async function declinationAt(lat: number, lon: number, when = new Date()): Promise<number> {
  const { calculateMagneticField } = await import('magvar')
  const start = Date.UTC(when.getUTCFullYear(), 0, 1)
  const year = when.getUTCFullYear() + (when.getTime() - start) / (Date.UTC(when.getUTCFullYear() + 1, 0, 1) - start)
  return calculateMagneticField(year, lat, lon, 0).declination
}
