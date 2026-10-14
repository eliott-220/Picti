// Types du paquet `magvar` (modèle magnétique mondial WMM 2025, sans types fournis) : seulement ce que PICTI utilise.
declare module 'magvar' {
  /** Champ magnétique ; `declination` en degrés, positive vers l'est. */
  export function calculateMagneticField(
    decimalYear: number,
    latitude: number,
    longitude: number,
    altitude?: number,
  ): { declination: number; inclination: number }
}
