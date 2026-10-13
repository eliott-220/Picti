// Zoom du viseur et grand angle (0.22.1).
//
// Le zoom se compte comme sur l'appareil photo de l'iPhone : 1 = objectif principal, 0,5 = ultra
// grand-angle, 2, 5… Il multiplie la focale équivalente de l'image (le champ de vision est divisé
// d'autant) : le géocadrage reste juste tant que la focale de l'écran et celle de la photo prise
// suivent le zoom — la photo est ensuite affichée dans le décor avec son vrai champ de vision.
//
// Selon la caméra, trois façons de zoomer :
// - caméra web qui sait zoomer (contrainte `zoom` : Safari 17+ sur iPhone, où 0,5 est le vrai ultra
//   grand-angle et 5 le vrai téléobjectif ; certains Chrome) : le flux arrive déjà zoomé (« matériel ») ;
// - sinon, l'image est agrandie à l'écran et recadrée à la prise (« numérique », au-delà de 1 seulement) ;
// - caméra d'ARKit (app iOS) : agrandie et recadrée de même. ARKit ne filme qu'avec l'objectif
//   principal : le grand angle passe par la caméra web, et le suivi visuel s'arrête le temps du 0,5
//   (comme pour un selfie).

import { clamp } from './math'

export interface ZoomRange {
  min: number
  max: number
}

export const ZOOM = {
  /** Ultra grand-angle (« 0,5 »). */
  ultraWide: 0.5,
  /** Zoom numérique maximal (image agrandie puis recadrée) : au-delà, la photo devient trop petite. */
  digitalMax: 5,
  /** Zoom matériel maximal demandé (WebKit ne va pas plus loin). */
  hardwareMax: 10,
  /** Relâché à moins de 4 % d'un repère (1, 2…), le zoom s'y range. */
  snap: 0.04,
  /**
   * Caméra d'ARKit (arrêtée à 1 en pinçant vers l'intérieur) : un pincement qui aurait mené sous
   * 0,8 passe au grand angle au relâcher, comme sur l'iPhone.
   */
  pinchToWide: 0.8,
}

/** Zoom ramené dans les limites de la caméra. */
export const clampZoom = (zoom: number, range: ZoomRange): number =>
  Number.isFinite(zoom) ? clamp(zoom, range.min, range.max) : 1

/**
 * Plage de zoom matériel d'une piste vidéo (`getCapabilities().zoom`), ramenée à au plus `hardwareMax`.
 * Null si la caméra ne zoome pas, ou si 1 n'est pas dans sa plage (le zoom ne servirait alors à rien de sûr).
 */
export function hardwareRange(caps: { min?: number; max?: number } | null | undefined): ZoomRange | null {
  const min = caps?.min
  const max = caps?.max
  if (typeof min !== 'number' || typeof max !== 'number' || !(min > 0) || !(max > min)) return null
  if (min > 1 + 1e-6 || max < 1 - 1e-6) return null
  return { min, max: Math.min(max, ZOOM.hardwareMax) }
}

/**
 * Repères proposés (boutons au-dessus du déclencheur), comme sur l'iPhone : 0,5 s'il y a un ultra
 * grand-angle, 1, 2, puis le téléobjectif (`tele`, facteur réel de l'appareil s'il est connu), sinon 5
 * ou 3 selon le zoom maximal. Un seul repère (1) : la caméra ne zoome pas.
 */
export function zoomPresets(range: ZoomRange, tele: number | null = null): number[] {
  const out: number[] = []
  if (range.min < 0.95) out.push(Math.round(Math.max(range.min, ZOOM.ultraWide) * 10) / 10)
  out.push(1)
  if (range.max >= 2) out.push(2)
  const far = tele != null && tele > 2 && tele <= range.max + 1e-6 ? tele : range.max >= 5 ? 5 : range.max >= 3 ? 3 : null
  if (far != null) out.push(Math.round(far * 10) / 10)
  return out
}

/** Repère dont le bouton porte le zoom actuel : le plus grand qui ne le dépasse pas (1,4 → « 1 »). */
export function presetFor(zoom: number, presets: readonly number[]): number {
  let best = presets[0] ?? 1
  for (const p of presets) if (p <= zoom * (1 + ZOOM.snap)) best = p
  return best
}

/** Nombre à la française : « 0,5 », « 1 », « 1,4 » (un chiffre après la virgule au plus). */
function decimal(zoom: number): string {
  const r = Math.round(zoom * 10) / 10
  return Number.isInteger(r) ? String(r) : r.toFixed(1).replace('.', ',')
}

/**
 * Texte d'un bouton : le repère (« 0,5 », « 2 ») ; celui qui porte le zoom actuel l'affiche avec
 * « × » (« 1× », « 1,4× »), comme sur l'iPhone.
 */
export const zoomLabel = (preset: number, zoom: number, active: boolean): string =>
  active ? `${decimal(zoom)}×` : decimal(preset)

/** Libellé lu par VoiceOver : « Zoom 0,5 (grand angle) ». */
export function zoomName(preset: number): string {
  const name = preset < 1 ? ' (grand angle)' : preset === 1 ? ' (objectif principal)' : ''
  return `Zoom ${decimal(preset)}${name}`
}

/** Relâché près d'un repère, le zoom s'y range. */
export function settleZoom(zoom: number, presets: readonly number[]): number {
  for (const p of presets) if (Math.abs(zoom / p - 1) <= ZOOM.snap) return p
  return Math.round(zoom * 100) / 100
}

/** Rectangle central (px entiers) gardé d'une image `width` × `height` agrandie `zoom` fois. */
export function cropRect(width: number, height: number, zoom: number): { x: number; y: number; width: number; height: number } {
  if (!(zoom > 1)) return { x: 0, y: 0, width, height }
  const w = Math.max(1, Math.round(width / zoom))
  const h = Math.max(1, Math.round(height / zoom))
  return { x: Math.round((width - w) / 2), y: Math.round((height - h) / 2), width: w, height: h }
}

/**
 * Focale équivalente du flux d'une caméra web zoomée `zoom` fois (matériel) : celle de l'objectif
 * principal (`wide`, à 1) multipliée par le zoom ; en dessous de 1, celle de l'ultra grand-angle
 * (`ultraWide`, à 0,5 : mesurée, sinon la moitié de la principale) multipliée de même. Les caméras
 * « virtuelles » de l'iPhone agrandissent l'image d'un objectif à l'autre sans saut de cadrage.
 */
export function focalAtZoom(zoom: number, { wide, ultraWide = null }: { wide: number; ultraWide?: number | null }): number {
  if (zoom >= 1) return wide * zoom
  return (ultraWide ?? wide * ZOOM.ultraWide) * (zoom / ZOOM.ultraWide)
}

/**
 * Reproduire une photo : zoom de départ pour retrouver son cadrage (`target`, focale de l'originale)
 * avec cette caméra (`base`, focale à 1). Écart de moins de 10 % : 1 (le calque montre le reste).
 */
export function reproduceZoom(target: number, base: number, range: ZoomRange): number {
  const ratio = target / base
  if (!Number.isFinite(ratio) || ratio <= 0 || Math.abs(ratio - 1) < 0.1) return 1
  return Math.round(clampZoom(ratio, range) * 100) / 100
}

/** Objectifs de l'appareil vus par le suivi visuel (plugin `ArTracking` de l'app iOS). */
export interface ArLenses {
  /** Le plugin sait agrandir et recadrer l'image d'ARKit. */
  zoom: boolean
  /** Il y a un ultra grand-angle (la caméra web s'en sert pour le 0,5). */
  ultraWide: boolean
  /** Facteur du téléobjectif (3, 5…), null sans téléobjectif. */
  telephoto: number | null
}

/** Caméra qui sert : celle d'ARKit (suivi visuel) ou la caméra web. */
export type ZoomRoute = 'ar' | 'web'

export interface ZoomPlan {
  route: ZoomRoute
  /** Zoom affiché et photographié. */
  zoom: number
  /** Zoom à demander à la caméra web (matériel) ; 1 si elle ne zoome pas. */
  hardware: number
  /** Agrandissement de l'image à l'écran (et recadrage à la prise) : ARKit, ou caméra web sans zoom matériel. */
  digital: number
  range: ZoomRange
  presets: number[]
}

/**
 * Comment obtenir le zoom `requested` :
 * - `ar` : suivi visuel possible (app iOS, objectif arrière ; null sinon) et ce que le plugin sait faire
 *   (null tant qu'on ne le sait pas) ;
 * - `hardware` : zoom matériel de la caméra web (undefined tant qu'elle n'a pas été ouverte) ;
 * - `lock` : pendant un pincement, la caméra ne change pas (le zoom est borné à ce qu'elle sait faire).
 */
export function zoomPlan({
  requested,
  ar,
  hardware,
  lock = null,
}: {
  requested: number
  ar: { lenses: ArLenses | null } | null
  hardware: ZoomRange | null | undefined
  lock?: ZoomRoute | null
}): ZoomPlan {
  if (ar) {
    const lenses = ar.lenses
    // Grand angle : l'appareil en a un et la caméra web sait l'atteindre (ou on ne l'a pas encore ouverte).
    const wide = !!lenses?.ultraWide && (hardware === undefined || (hardware != null && hardware.min < 1))
    const range = { min: wide ? Math.max(hardware?.min ?? ZOOM.ultraWide, ZOOM.ultraWide) : 1, max: lenses?.zoom ? ZOOM.digitalMax : 1 }
    const presets = zoomPresets(range, lenses?.telephoto ?? null)
    const route: ZoomRoute = lock ?? (clampZoom(requested, range) < 1 ? 'web' : 'ar')
    if (route === 'ar') {
      const zoom = clampZoom(requested, { min: 1, max: range.max })
      return { route, zoom, hardware: 1, digital: zoom, range, presets }
    }
    const webMax = hardware ? Math.min(hardware.max, range.max) : 1
    const zoom = clampZoom(requested, { min: range.min, max: Math.max(webMax, range.min) })
    return { route, zoom, hardware: zoom, digital: 1, range, presets }
  }
  const range = { min: hardware ? Math.min(hardware.min, 1) : 1, max: Math.max(hardware?.max ?? 1, ZOOM.digitalMax) }
  const zoom = clampZoom(requested, range)
  const hw = hardware ? clampZoom(zoom, hardware) : 1
  return { route: 'web', zoom, hardware: hw, digital: Math.max(1, zoom / hw), range, presets: zoomPresets(range) }
}
