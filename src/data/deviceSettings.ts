import { useSyncExternalStore } from 'react'
import { loadPreference, savePreference, setVibrations } from '../native'

// Réglages de prise de vue gardés sur l'appareil (Paramètres › Prise de vue, 0.24.0) : « Vibrations » et
// « Guidage chaud / froid », activés par défaut. `localStorage` pour la lecture immédiate, doublé dans l'app par
// Capacitor Preferences (iOS peut vider les données de la WebView).

export type DeviceSetting = 'vibrations' | 'guidage'

const KEYS: Record<DeviceSetting, string> = {
  vibrations: 'picti.vibrations',
  guidage: 'picti.guidage-chaud-froid',
}

function read(key: DeviceSetting): boolean | null {
  try {
    const v = localStorage.getItem(KEYS[key])
    return v === 'non' ? false : v === 'oui' ? true : null
  } catch {
    return null
  }
}

const values: Record<DeviceSetting, boolean> = {
  vibrations: read('vibrations') ?? true,
  guidage: read('guidage') ?? true,
}
setVibrations(values.vibrations)

const listeners = new Set<() => void>()

function publish(key: DeviceSetting, on: boolean) {
  values[key] = on
  if (key === 'vibrations') setVibrations(on)
  listeners.forEach((l) => l())
}

// Données de la WebView effacées : le choix gardé par l'app revient.
for (const key of Object.keys(KEYS) as DeviceSetting[]) {
  if (read(key) != null) continue
  void loadPreference(KEYS[key]).then((v) => {
    if (v === 'non' || v === 'oui') publish(key, v === 'oui')
  })
}

/** Valeur d'un réglage, hors React. */
export function deviceSetting(key: DeviceSetting): boolean {
  return values[key]
}

/** Change un réglage : effet immédiat partout, gardé d'une ouverture à l'autre. */
export function setDeviceSetting(key: DeviceSetting, on: boolean): void {
  try {
    localStorage.setItem(KEYS[key], on ? 'oui' : 'non')
  } catch {
    // Stockage refusé : le réglage vaut pour cette visite (et reste gardé par l'app).
  }
  void savePreference(KEYS[key], on ? 'oui' : 'non')
  publish(key, on)
}

function subscribe(onChange: () => void) {
  listeners.add(onChange)
  return () => {
    listeners.delete(onChange)
  }
}

export function useDeviceSetting(key: DeviceSetting): boolean {
  return useSyncExternalStore(subscribe, () => values[key])
}
