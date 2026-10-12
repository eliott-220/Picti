import { useRef } from 'react'
import { presetFor, zoomLabel, zoomName } from '../geo/zoom'
import { useGlassButton } from '../glassButtons'

/**
 * Boutons d'objectif au-dessus du déclencheur, comme dans l'appareil photo de l'iPhone : « 0,5 » (grand
 * angle), « 1× », « 2 », « 5 ». Celui qui porte le zoom actuel l'affiche (« 1,4× » après un pincement).
 * Rien si la caméra ne zoome pas. Dans l'app iOS 26+, ce sont de vrais boutons Liquid Glass.
 */
export function ZoomLenses({
  presets,
  zoom,
  onSelect,
}: {
  presets: readonly number[]
  zoom: number
  onSelect: (zoom: number) => void
}) {
  if (presets.length < 2) return null
  const current = presetFor(zoom, presets)
  return (
    <div className="zoom-lenses" role="radiogroup" aria-label="Zoom">
      {presets.map((p) => (
        <LensButton key={p} preset={p} zoom={zoom} active={p === current} onSelect={onSelect} />
      ))}
    </div>
  )
}

function LensButton({
  preset,
  zoom,
  active,
  onSelect,
}: {
  preset: number
  zoom: number
  active: boolean
  onSelect: (zoom: number) => void
}) {
  const ref = useRef<HTMLButtonElement>(null)
  const title = zoomLabel(preset, zoom, active)
  const label = zoomName(preset)
  const native = useGlassButton(ref, { title, label, active })
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
