// Lien entre les photos de l'application et la géométrie des lieux, vues et piles.

import { photoTime, type GeoframedPhoto } from '../components/arProjection'
import { pileOrder, type PileEntry, type SpotPoint } from '../geo/spots'
import type { ViewPoint } from '../geo/views'
import type { GeoPhoto } from './types'

/** Prise de vue d'une photo géocadrée, pour la ranger dans un lieu (`sameSpot`). */
export const spotPointOf = (p: GeoframedPhoto): SpotPoint => ({
  position: p.geoframe.position,
  accuracy: p.geoframe.accuracy,
  heading: p.geoframe.heading,
})

/** Vue d'une photo géocadrée (`sameView`) : orientation enregistrée, celle de l'objectif avant pour un selfie. */
export const viewOf = (p: GeoframedPhoto): ViewPoint => ({
  ...spotPointOf(p),
  heading: p.geoframe.heading,
  pitch: p.geoframe.pitch,
})

export const pileEntryOf = (p: GeoPhoto): PileEntry => ({ likes: p.likesCount, addedAt: p.addedAt, time: photoTime(p) })

/** Ordre de la pile d'un lieu (likes, bonus des photos neuves, la plus récente à égalité). */
export const photoPileOrder = (now = Date.now()) => pileOrder(pileEntryOf, now)
