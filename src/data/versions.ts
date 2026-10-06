// Photos liées sur la fiche : « Au fil du temps » (une photo et ses reproductions) et
// « D'après la photo de … » (l'originale d'une reproduction).

import { photoTime } from '../components/arProjection'
import type { GeoPhoto } from './types'

/**
 * Frise « Au fil du temps » : la photo elle-même d'abord, puis ses reproductions directes
 * (`version_of` = elle) par date de prise croissante (la plus ancienne ajoutée d'abord à égalité).
 */
export function timelineOrder(original: GeoPhoto, versions: readonly GeoPhoto[]): GeoPhoto[] {
  const own = versions
    .filter((v) => v.versionOf === original.id && v.id !== original.id)
    .sort((a, b) => photoTime(a) - photoTime(b) || a.addedAt - b.addedAt)
  return [original, ...own]
}

/**
 * Reproductions comptées par la base (`versions_count`) mais que je ne peux pas voir (RLS) :
 * « et 2 autres que vous ne pouvez pas voir ». Vide s'il n'y en a pas.
 */
export function hiddenVersionsText(total: number, visible: number): string {
  const hidden = Math.max(0, total - visible)
  if (!hidden) return ''
  return hidden === 1 ? 'et 1 autre que vous ne pouvez pas voir' : `et ${hidden} autres que vous ne pouvez pas voir`
}

/** « refaite 3 fois » (ou « refaite 1 fois »), d'après le compteur de la base. */
export const remadeText = (n: number) => `refaite ${n} fois`

/** Lien d'une reproduction vers la frise de son originale : « Voir les 3 autres reproductions ». */
export function otherVersionsText(parentVersions: number): string {
  const others = parentVersions - 1
  if (others <= 0) return ''
  return others === 1 ? 'Voir l’autre reproduction' : `Voir les ${others} autres reproductions`
}
