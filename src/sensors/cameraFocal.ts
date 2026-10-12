// Focale de la caméra, mesurée sur ce téléphone (`useFocalCalibration`) et gardée d'une ouverture
// de l'app à l'autre : objectif principal (à défaut : 26 mm) et, depuis 0.22.1, ultra grand-angle
// (« 0,5 » ; à défaut : la moitié de la principale, voir `focalAtZoom`).

import { useSyncExternalStore } from 'react'
import { DEFAULT_PHONE_FOCAL35 } from '../geo/optics'

/** Objectif mesuré : principal (zoom 1) ou ultra grand-angle (zoom 0,5). */
export type Lens = 'wide' | 'ultraWide'

const KEYS: Record<Lens, string> = { wide: 'picti.focale', ultraWide: 'picti.focale.ultra-grand-angle' }

function read(lens: Lens): number | null {
  try {
    const v = Number(localStorage.getItem(KEYS[lens]))
    return v > 0 ? v : null
  } catch {
    return null
  }
}

let measured: Record<Lens, number | null> =
  typeof window === 'undefined' ? { wide: null, ultraWide: null } : { wide: read('wide'), ultraWide: read('ultraWide') }
const listeners = new Set<() => void>()

/** Enregistre une nouvelle mesure (mm, équivalent 24×36) de cet objectif. */
export function setMeasuredFocal(focal35: number, lens: Lens = 'wide') {
  const previous = measured[lens]
  // Écart négligeable : on ne redessine pas tout pour si peu.
  if (previous != null && Math.abs(focal35 - previous) < 0.1) return
  measured = { ...measured, [lens]: focal35 }
  try {
    localStorage.setItem(KEYS[lens], focal35.toFixed(2))
  } catch {
    // Stockage indisponible : la mesure vaut pour cette ouverture seulement.
  }
  listeners.forEach((l) => l())
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/**
 * Focale de l'objectif principal (mm) et si elle a été mesurée sur ce téléphone ; `ultraWide` : celle
 * de l'ultra grand-angle si elle a été mesurée.
 */
export function useCameraFocal(): { focal35: number; measured: boolean; ultraWide: number | null } {
  const value = useSyncExternalStore(subscribe, () => measured)
  return { focal35: value.wide ?? DEFAULT_PHONE_FOCAL35, measured: value.wide != null, ultraWide: value.ultraWide }
}
