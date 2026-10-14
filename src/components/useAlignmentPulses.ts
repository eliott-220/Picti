import { useEffect, useRef } from 'react'
import { alignmentPulse } from '../geo/tutorial'
import { haptic } from '../native'

/**
 * Alignement qui se sent (0.22.0 dans le tutoriel, 0.24.0 en chasse et en Reproduire) : tant que `active`,
 * de petites impulsions de plus en plus rapprochées à mesure que `level` (0 → 1) monte — `tick` puis
 * `strong` au-delà de la moitié, jamais moins de 120 ms entre deux (`alignmentPulse`). `aligned` : un
 * `success` quand il passe à vrai (« Orientation alignée »). `onBeat` : à chaque impulsion (son du tutoriel).
 */
export function useAlignmentPulses(
  level: number,
  active: boolean,
  { aligned = false, onBeat }: { aligned?: boolean; onBeat?: (level: number) => void } = {},
): void {
  const latest = useRef({ level, onBeat })
  useEffect(() => {
    latest.current = { level, onBeat }
  })

  useEffect(() => {
    if (!active) return
    let timer: ReturnType<typeof setTimeout>
    const beat = () => {
      const { level, onBeat } = latest.current
      const pulse = alignmentPulse(level)
      // Page cachée : rien (pas de rafale au retour).
      if (pulse && !document.hidden) {
        haptic(pulse.kind)
        onBeat?.(level)
      }
      timer = setTimeout(beat, pulse?.gap ?? 250)
    }
    timer = setTimeout(beat, 300)
    return () => clearTimeout(timer)
  }, [active])

  // « Orientation alignée » : une fois en y arrivant.
  const wasAligned = useRef(false)
  useEffect(() => {
    const now = active && aligned
    if (now && !wasAligned.current) haptic('success')
    wasAligned.current = now
  }, [active, aligned])
}
