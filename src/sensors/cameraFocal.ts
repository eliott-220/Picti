// Focale de la caméra principale, mesurée sur ce téléphone (`useFocalCalibration`)
// et gardée d'une ouverture de l'app à l'autre. À défaut : 26 mm.

import { useSyncExternalStore } from 'react'
import { DEFAULT_PHONE_FOCAL35 } from '../geo/optics'

const KEY = 'picti.focale'

function read(): number | null {
  try {
    const v = Number(localStorage.getItem(KEY))
    return v > 0 ? v : null
  } catch {
    return null
  }
}

let measured = typeof window === 'undefined' ? null : read()
const listeners = new Set<() => void>()

/** Enregistre une nouvelle mesure (mm, équivalent 24×36). */
export function setMeasuredFocal(focal35: number) {
  // Écart négligeable : on ne redessine pas tout pour si peu.
  if (measured != null && Math.abs(focal35 - measured) < 0.1) return
  measured = focal35
  try {
    localStorage.setItem(KEY, focal35.toFixed(2))
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

/** Focale de la caméra principale (mm) et si elle a été mesurée sur ce téléphone. */
export function useCameraFocal(): { focal35: number; measured: boolean } {
  const value = useSyncExternalStore(subscribe, () => measured)
  return { focal35: value ?? DEFAULT_PHONE_FOCAL35, measured: value != null }
}
