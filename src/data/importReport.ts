// Bilan d'un import (0.24.0) : une ligne par fichier — miniature, titre (date de prise de vue), état en une
// ligne et ce qu'on peut en faire (fiche, Recaler).

import { distanceMeters, formatDistance, type GeoPoint } from '../geo/geodesy'
import { formatDate, type GeoPhoto } from './types'

/**
 * - `placed` : position et direction lues, photo géocadrée ;
 * - `located` : position trouvée (ou posée au centre de la carte), direction à relever sur place ;
 * - `none` : aucune position ;
 * - `failed` : fichier illisible.
 */
export type ImportState = 'placed' | 'located' | 'none' | 'failed'

export interface ImportLine {
  key: string
  /** Photo créée (absente si le fichier est illisible). */
  id: string | null
  title: string
  state: ImportState
  position: GeoPoint | null
  /** Fichier illisible : pourquoi. */
  reason?: string
}

/**
 * Ligne d'une photo importée : géocadrée (position + direction) → placée ; position seule (EXIF, ou posée au
 * centre de la carte) → à orienter sur place ; rien → sans position. Titre : la date de prise de vue.
 */
export function importLine(
  key: string,
  p: Pick<GeoPhoto, 'id' | 'title' | 'takenAt' | 'geoframe' | 'hintPosition'>,
): ImportLine {
  return {
    key,
    id: p.id,
    title: p.takenAt ? formatDate(p.takenAt) : p.title,
    state: p.geoframe ? 'placed' : p.hintPosition ? 'located' : 'none',
    position: p.geoframe?.position ?? p.hintPosition,
  }
}

/** Taille au-delà de laquelle un fichier n'est pas lu (Mo). */
export const IMPORT_MAX_MB = 50

/** Fichier refusé avant même d'être lu : la raison, sinon null. */
export function refuseFile(file: { name: string; type: string; size: number }): string | null {
  const image = file.type.startsWith('image/') || /\.(jpe?g|heic|heif|png|webp)$/i.test(file.name)
  if (!image) return `format non pris en charge (${file.name.split('.').pop()?.toUpperCase() || 'inconnu'})`
  if (file.size > IMPORT_MAX_MB * 1024 * 1024) return `trop lourd (${Math.round(file.size / 1024 / 1024)} Mo, ${IMPORT_MAX_MB} Mo au plus)`
  return null
}

/** Erreur de lecture d'une image : la raison montrée à l'utilisateur. */
export function failureReason(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error)
  if (/decod|could not be decoded|source image/i.test(message)) return 'image illisible (format non reconnu par ce téléphone)'
  if (/premium/i.test(message)) return 'réservé à PICTI Premium'
  return 'envoi impossible, réessaie'
}

/** État en une ligne, avec la distance d'ici quand la position est connue. */
export function lineStatus(line: ImportLine, here: GeoPoint | null): string {
  switch (line.state) {
    case 'placed':
      return 'Placée'
    case 'located': {
      const d = here && line.position ? ` · ${formatDistance(distanceMeters(here, line.position))}` : ''
      return `Position trouvée, à orienter sur place${d}`
    }
    case 'none':
      return 'Sans position'
    case 'failed':
      return `Illisible · ${line.reason ?? 'format non reconnu'}`
  }
}

/** Résumé du lot (titre au-dessus de la liste). */
export function reportTitle(lines: readonly ImportLine[]): string {
  const n = (s: ImportState) => lines.filter((l) => l.state === s).length
  const parts = [
    n('placed') && `${n('placed')} placée${n('placed') > 1 ? 's' : ''}`,
    n('located') + n('none') && `${n('located') + n('none')} à recaler`,
    n('failed') && `${n('failed')} illisible${n('failed') > 1 ? 's' : ''}`,
  ].filter(Boolean)
  return parts.join(' · ')
}
