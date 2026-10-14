import { useEffect, useMemo, useRef, useState } from 'react'
import { useDeviceSetting } from '../data/deviceSettings'
import { useGuideChoice } from '../data/guideTarget'
import { isHiddenPhoto, useHiddenContent } from '../data/hiddenContent'
import { useStore } from '../data/storeContext'
import { isGeoframed } from '../data/types'
import { bearingDeg, type GeoFix } from '../geo/geodesy'
import { steadyViewer } from '../geo/guidance'
import { logGuide, pickGuideTarget, WARM_COLD, warmth, type GuideCandidate, type GuideLog, type GuideTarget, type Warmth } from '../geo/warmCold'
import { haptic } from '../native'

export interface WarmColdGuide extends GuideTarget {
  /** Cap vers la photo (°). */
  bearing: number
  warmth: Warmth
  /** La précision du GPS est pire que la distance restante : « Position imprécise ». */
  imprecise: boolean
  trend: 'Plus chaud' | 'Plus froid' | null
  /** 20 m franchis il y a moins de 5 s : « Tu y es presque : lève le téléphone ». */
  almost: boolean
}

/**
 * Guidage chaud / froid vers une photo (0.24.0) : la cible (`pickGuideTarget`, parmi les photos déjà chargées
 * — aucune requête de plus), sa distance et son cap depuis une position qui ne suit pas le bruit du GPS.
 * `haptics` (viseur) : un `tick` aux paliers 200, 100, 50 m, `strong` à 20 m, et le mot « Plus chaud / Plus
 * froid ». Null : réglage « Guidage chaud / froid » coupé, pas de position, ou rien à moins de 500 m.
 */
export function useWarmCold(fix: GeoFix | null, { haptics = false }: { haptics?: boolean } = {}): WarmColdGuide | null {
  const on = useDeviceSetting('guidage')
  const { photos, captures, isMine } = useStore()
  const hidden = useHiddenContent()
  const { chosen, ignored } = useGuideChoice()

  const candidates = useMemo<GuideCandidate[]>(() => {
    const captured = new Set(captures.map((c) => c.photoId))
    return photos
      .filter((p) => !isHiddenPhoto(p, hidden))
      .map((p) => ({
        id: p.id,
        position: p.geoframe?.position ?? p.hintPosition,
        mine: isMine(p),
        geoframed: isGeoframed(p),
        captured: captured.has(p.id),
      }))
  }, [photos, captures, isMine, hidden])

  // Position de référence : les sauts du GPS plus petits que sa précision ne font pas bouger la flèche.
  const [anchor, setAnchor] = useState<GeoFix | null>(null)
  if (fix) {
    const steady = steadyViewer(anchor, fix)
    if (steady !== anchor) setAnchor(steady)
  }
  const viewer = anchor ?? fix
  // Les photos ignorées le restent une heure : l'heure est celle de la position.
  const target = on && viewer ? pickGuideTarget(candidates, viewer, { chosen, ignored, now: fix?.timestamp || undefined }) : null

  const id = target?.id ?? null
  const distance = target?.distance ?? null
  const accuracy = fix?.accuracy ?? Infinity
  const imprecise = distance != null && accuracy > distance

  // Paliers et tendance, propres à la cible ; rien tant que la position est imprécise. Un relevé par
  // position (heure du GPS), appliqué au rendu ; seules les vibrations passent par un effet.
  const sample = id != null && distance != null && !imprecise && fix ? { id, distance, at: fix.timestamp } : null
  const [seen, setSeen] = useState<typeof sample>(null)
  const [log, setLog] = useState<GuideLog | null>(null)
  if (sample?.id !== seen?.id || sample?.distance !== seen?.distance || sample?.at !== seen?.at) {
    setSeen(sample)
    setLog(sample ? logGuide(log, sample.id, sample.distance, sample.at, accuracy) : null)
  }
  // Impulsion n° `beats` de la cible `log.id` : vibrée une seule fois.
  const beat = log && log.beats ? `${log.id}:${log.beats}` : ''
  const pulse = log?.pulse ?? null
  const felt = useRef('')
  useEffect(() => {
    if (!beat || beat === felt.current) return
    felt.current = beat
    if (haptics && pulse) haptic(pulse)
  }, [beat, pulse, haptics])

  // « Tu y es presque : lève le téléphone » à 20 m, quelques secondes.
  const [almost, setAlmost] = useState({ beat: '', on: false })
  if (haptics && pulse === 'strong' && beat !== almost.beat) setAlmost({ beat, on: true })
  useEffect(() => {
    if (!almost.on) return
    const timer = setTimeout(() => setAlmost((a) => ({ ...a, on: false })), WARM_COLD.almostMs)
    return () => clearTimeout(timer)
  }, [almost])

  if (!target || !viewer) return null
  return {
    ...target,
    bearing: bearingDeg(viewer, target.position),
    warmth: warmth(target.distance),
    imprecise,
    trend: imprecise ? null : (log?.trend ?? null),
    almost: almost.on,
  }
}
