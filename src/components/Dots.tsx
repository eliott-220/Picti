import type { CSSProperties } from 'react'

/** Au-delà, les points défilent (comme sur Instagram). */
const MAX_DOTS = 7

/**
 * Petits points indiquant combien de photos sont empilées et laquelle est
 * affichée. Au-delà de sept, seule une fenêtre défile, les points du bord
 * rapetissant pour signaler qu'il y en a d'autres.
 */
export function Dots({
  count,
  index,
  className = '',
  style,
}: {
  count: number
  index: number
  className?: string
  style?: CSSProperties
}) {
  if (count < 2) return null
  const shown = Math.min(count, MAX_DOTS)
  const first = Math.min(Math.max(0, index - Math.floor(shown / 2)), count - shown)
  return (
    <div className={`dots ${className}`} style={style} role="img" aria-label={`Photo ${index + 1} sur ${count}`}>
      {Array.from({ length: shown }, (_, k) => {
        const i = first + k
        const edge = (k === 0 && first > 0) || (k === shown - 1 && first + shown < count)
        return <span key={i} className={`dot ${i === index ? 'active' : ''} ${edge ? 'small' : ''}`} />
      })}
    </div>
  )
}
