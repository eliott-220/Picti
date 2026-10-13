import { useRef, type RefObject } from 'react'
import { presetFor, zoomLabel, zoomName } from '../geo/zoom'
import { readOpacity, useGlassButton } from '../glassButtons'

/**
 * Boutons d'objectif, comme dans l'appareil photo de l'iPhone : « 0,5 » (grand angle), « 1× », « 2 »,
 * « 5 ». Celui qui porte le zoom actuel l'affiche (« 1,4× » après un pincement). Rien si la caméra ne
 * zoome pas. Depuis 0.24.0, petite rangée centrée juste au-dessus de la barre du bas ; `faded` (menu
 * ouvert) ou choix du mode en cours (CSS) : effacée en fondu. Dans l'app iOS 26+, ce sont de vrais boutons
 * Liquid Glass, qui suivent le fondu (`fade`).
 */
export function ZoomLenses({
  presets,
  zoom,
  onSelect,
  faded = false,
}: {
  presets: readonly number[]
  zoom: number
  onSelect: (zoom: number) => void
  faded?: boolean
}) {
  const row = useRef<HTMLDivElement>(null)
  if (presets.length < 2) return null
  const current = presetFor(zoom, presets)
  return (
    <div ref={row} className={`zoom-lenses${faded ? ' faded' : ''}`} role="radiogroup" aria-label="Zoom" aria-hidden={faded || undefined}>
      {presets.map((p) => (
        <LensButton key={p} preset={p} zoom={zoom} active={p === current} onSelect={onSelect} row={row} />
      ))}
    </div>
  )
}

function LensButton({
  preset,
  zoom,
  active,
  onSelect,
  row,
}: {
  preset: number
  zoom: number
  active: boolean
  onSelect: (zoom: number) => void
  row: RefObject<HTMLElement | null>
}) {
  const ref = useRef<HTMLButtonElement>(null)
  const title = zoomLabel(preset, zoom, active)
  const label = zoomName(preset)
  // Le verre natif suit le fondu de la rangée (opacité lue à chaque image).
  const native = useGlassButton(ref, { title, label, active, fade: () => readOpacity(row.current) })
  return (
    <button
      ref={ref}
      type="button"
      role="radio"
      aria-checked={active}
      aria-label={label}
      className={`zoom-lens${active ? ' active' : ''}${native ? ' glass-native' : ''}`}
      onClick={() => onSelect(preset)}
    >
      {title}
    </button>
  )
}
