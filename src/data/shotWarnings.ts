// Textes des avertissements à la prise de vue : mode « Reproduire » hors de la vue de
// l'originale, position GPS imprécise.

import { compassPoint, formatDistance } from '../geo/geodesy'
import { metersBack, type ReproduceState } from '../geo/reproduce'
import { VIEW_HEADING_TOLERANCE, VIEW_PITCH_TOLERANCE } from '../geo/views'
import { ofName } from './types'

export interface ReproduceAlert {
  /** `warn` : orange (au bord de la vue) ; `bad` : rouge (hors de la vue). */
  tone: 'warn' | 'bad'
  text: string
}

/** Où se trouve le point de vue : « Point de vue à 62 m vers le NO ». */
export const viewpointAt = (s: Pick<ReproduceState, 'distance' | 'bearing'>) =>
  `Point de vue à ${formatDistance(s.distance)}${s.bearing != null ? ` vers le ${compassPoint(s.bearing)}` : ''}`

/**
 * Bandeau du mode « Reproduire » (null : rien à signaler). La distance et la direction du point de
 * vue sont déjà dans la consigne au-dessus : le bandeau dit ce qui ne va pas.
 */
export function reproduceAlert(s: ReproduceState): ReproduceAlert | null {
  if (s.view === 'lost') return { tone: 'bad', text: 'Vous avez quitté le lieu de la photo' }
  if (s.view === 'out') {
    if (s.reason === 'heading') {
      return { tone: 'bad', text: s.headingError > 0 ? 'Tournez-vous vers la droite' : 'Tournez-vous vers la gauche' }
    }
    if (s.reason === 'pitch') return { tone: 'bad', text: s.pitchError > 0 ? 'Levez le téléphone' : 'Baissez le téléphone' }
    return { tone: 'bad', text: `Trop loin de la photo d’origine (${formatDistance(s.distance)})` }
  }
  // GPS imprécis : « revenez de 2 m » ne voudrait rien dire.
  if (s.view === 'drifting' && s.status !== 'gps-weak') return { tone: 'warn', text: `Revenez de ${metersBack(s)} m` }
  return null
}

/**
 * Feuille ouverte quand on déclenche hors de la vue de l'originale : pourquoi la photo ne sera
 * pas une reproduction. `owner` : auteur de l'originale.
 */
export function outOfViewMessage(s: ReproduceState, owner: string): string {
  const photo = `la photo ${ofName(owner || 'quelqu’un')}`
  const lead = 'Cette photo ne sera pas une reproduction : '
  if (s.reason === 'heading') {
    const gap = Math.round(Math.abs(s.headingError))
    return `${lead}vous ne visez pas dans la même direction que ${photo} (${gap}° d’écart, il faut moins de ${VIEW_HEADING_TOLERANCE}°).`
  }
  if (s.reason === 'pitch') {
    const gap = Math.round(Math.abs(s.pitchError))
    return `${lead}le téléphone n’est pas incliné comme pour ${photo} (${gap}° d’écart, il faut moins de ${VIEW_PITCH_TOLERANCE}°).`
  }
  // Arrondis qui ne se contredisent pas : la distance affichée dépasse toujours la limite.
  const limit = Math.floor(s.radius)
  const at = Math.max(Math.round(s.distance), limit + 1)
  return `${lead}vous êtes à ${formatDistance(at)} du point de vue de ${photo} (il faut être à moins de ${limit} m).`
}

/** Feuille ouverte quand on déclenche avec un GPS imprécis. */
export const vaguePositionMessage = (accuracy: number) =>
  `Position imprécise (±${Math.round(accuracy)} m) : la photo risque d’être mal placée.`
