// Mode « Reproduire » : l'utilisateur est-il encore dans la VUE de la photo d'origine ?
//
// La photo prise ne devient une reproduction (version) que si elle est dans la vue de
// l'originale (`sameView`, la règle qui fixe `version_of`, vérifiée aussi par la base). Pour
// qu'il ne s'en éloigne pas sans le savoir, l'état est recalculé en continu ; il est amorti
// (délai pour sortir, marge pour revenir) pour qu'un saut du GPS ne fasse pas clignoter les
// bandeaux. Fonction pure : l'heure et l'état précédent sont passés en paramètres.

import { bearingDeg, distanceMeters, type GeoPoint } from './geodesy'
import { angleDiffDeg } from './math'
import { spotRadius } from './spots'
import { GPS_GOOD_ACCURACY } from './tracking'
import { sameView, VIEW_HEADING_TOLERANCE, type ViewPoint } from './views'

/** Dans la vue mais au-delà de cette part du rayon : « vous vous éloignez ». */
export const REPRODUCE_DRIFT_RATIO = 0.7
/** Au-delà de cette distance (m) du point de vue, on a quitté le lieu de la photo. */
export const REPRODUCE_LOST_DISTANCE = 50
/** On ne passe « hors de la vue » que si l'écart dure ce temps (ms) : un saut du GPS ne compte pas. */
export const REPRODUCE_OUT_DELAY_MS = 2000
/** Hors de la vue, on n'y revient qu'à cette distance (m) à l'intérieur du rayon. */
export const REPRODUCE_HYSTERESIS_M = 1

/**
 * - `in-view` : dans la vue, la photo prise sera une reproduction ;
 * - `drifting` : encore dans la vue, mais près de son bord ;
 * - `out` : hors de la vue (trop loin, ou mauvaise direction) ;
 * - `lost` : à plus de 50 m, le lieu de la photo est quitté ;
 * - `gps-weak` : GPS imprécis (> 12 m), la position n'est pas fiable.
 */
export type ReproduceStatus = 'in-view' | 'drifting' | 'out' | 'lost' | 'gps-weak'

/** Position dans la vue, sans tenir compte de la précision du GPS. */
export type ReproduceView = Exclude<ReproduceStatus, 'gps-weak'>

/** Ce qui écarte de la vue : la distance, le cap ou l'inclinaison. */
export type ReproduceReason = 'distance' | 'heading' | 'pitch'

export interface ReproduceViewer {
  position: GeoPoint
  /** Orientation de l'objectif utilisé (avant pour un selfie), comme elle serait enregistrée. */
  heading: number
  pitch: number
  /** Instant de la mesure (ms). */
  time: number
}

export interface ReproduceState {
  /** État à afficher (amorti). */
  status: ReproduceStatus
  /** Position dans la vue (amortie), y compris quand le GPS est imprécis. */
  view: ReproduceView
  /**
   * Verdict immédiat de `sameView` — exactement la règle qui fixe `version_of`. C'est lui qui
   * décide au déclenchement, pas l'état affiché (amorti).
   */
  inView: boolean
  /** Distance au point de vue de l'originale (m) et cap pour y retourner (° depuis le nord). */
  distance: number
  bearing: number | null
  /** Rayon de la vue (m) : 5 m, élargi par la précision du GPS, plafonné à 10 m (`spotRadius`). */
  radius: number
  /** Écarts signés : > 0 → tourner à droite, lever le téléphone. */
  headingError: number
  pitchError: number
  /** Ce qui écarte de la vue (null : dans la vue). */
  reason: ReproduceReason | null
  /** Depuis cet instant (ms), on est hors de la vue sans l'afficher encore (délai) ; sinon null. */
  outSince: number | null
}

const away = (v: ReproduceView) => v === 'out' || v === 'lost'

/**
 * État du mode « Reproduire » : `viewer` (position et orientation actuelles), `parent` (vue de
 * la photo d'origine), `accuracy` (précision actuelle du GPS, m), `previous` (état précédent,
 * null au départ : verdict immédiat, sans délai ni marge).
 */
export function reproduceStatus(
  viewer: ReproduceViewer,
  parent: ViewPoint,
  accuracy: number,
  previous: ReproduceState | null,
): ReproduceState {
  const here: ViewPoint = { position: viewer.position, accuracy, heading: viewer.heading, pitch: viewer.pitch }
  const radius = spotRadius(here, parent)
  const distance = distanceMeters(viewer.position, parent.position)
  const bearing = distance > 0.5 ? bearingDeg(viewer.position, parent.position) : null
  const headingError = angleDiffDeg(viewer.heading, parent.heading)
  const pitchError = parent.pitch - viewer.pitch
  const inView = sameView(here, parent)

  const was = previous?.view ?? null
  // Revenir dans la vue, ou en deçà de 50 m : seulement avec une marge, pour ne pas clignoter.
  const back = !was || !away(was) || distance <= radius - REPRODUCE_HYSTERESIS_M
  const lostLimit = was === 'lost' ? REPRODUCE_LOST_DISTANCE - REPRODUCE_HYSTERESIS_M : REPRODUCE_LOST_DISTANCE
  const target: ReproduceView =
    distance > lostLimit
      ? 'lost'
      : !inView || !back
        ? 'out'
        : distance > REPRODUCE_DRIFT_RATIO * radius
          ? 'drifting'
          : 'in-view'
  const reason: ReproduceReason | null =
    target !== 'out' && target !== 'lost'
      ? null
      : distance > radius - (back ? 0 : REPRODUCE_HYSTERESIS_M)
        ? 'distance'
        : Math.abs(headingError) > VIEW_HEADING_TOLERANCE
          ? 'heading'
          : 'pitch'

  let view = target
  let outSince: number | null = null
  if (away(target) && was && !away(was)) {
    // On sort de la vue : seulement si l'écart dure (un saut du GPS ne compte pas).
    outSince = previous!.outSince ?? viewer.time
    if (viewer.time - outSince < REPRODUCE_OUT_DELAY_MS) view = reason === 'distance' ? 'drifting' : was
    else outSince = null
  }
  const weak = !(accuracy <= GPS_GOOD_ACCURACY)
  return {
    status: view === 'lost' ? 'lost' : weak ? 'gps-weak' : view,
    view,
    inView,
    distance,
    bearing,
    radius,
    headingError,
    pitchError,
    reason,
    outSince,
  }
}

/** Mètres à revenir pour ne plus être au bord de la vue (au moins 1 m). */
export const metersBack = (s: Pick<ReproduceState, 'distance' | 'radius'>) =>
  Math.max(1, Math.ceil(s.distance - REPRODUCE_DRIFT_RATIO * s.radius))
