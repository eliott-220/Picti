import type { CSSProperties } from 'react'

/** Au-delà, les points défilent (comme sur Instagram). */
const MAX_DOTS = 7

/**
 * Petits points indiquant combien de photos sont empilées et laquelle est
 * affichée. Au-delà de sept, seule une fenêtre défile, les points du bord
 * rapetissant pour signaler qu'il y en a d'autres. Une reproduction (`rings`) est
 * un anneau au lieu d'un rond plein. Avec `onOpen`, un appui ouvre la galerie du lieu.
 */
export function Dots({
  count,
  index,
  className = '',
  style,
  rings,
  onOpen,
}: {
  count: number
  index: number
  className?: string
  style?: CSSProperties
  /** Pour chaque photo de la pile : est-ce une reproduction (version) ? */
  rings?: readonly boolean[]
  /** Appui sur les points : galerie de toutes les photos du lieu. */
  onOpen?: () => void
}) {
  if (count < 2) return null
  const shown = Math.min(count, MAX_DOTS)
  const first = Math.min(Math.max(0, index - Math.floor(shown / 2)), count - shown)
  const dots = Array.from({ length: shown }, (_, k) => {
    const i = first + k
    const edge = (k === 0 && first > 0) || (k === shown - 1 && first + shown < count)
    return <span key={i} className={`dot ${i === index ? 'active' : ''} ${edge ? 'small' : ''} ${rings?.[i] ? 'ring' : ''}`} />
  })
  if (onOpen) {
    return (
      <button
        type="button"
        className={`dots dots-button ${className}`}
        style={style}
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.stopPropagation()
          onOpen()
        }}
        aria-label={`Photo ${index + 1} sur ${count} : voir toutes les photos du lieu`}
      >
        {dots}
      </button>
    )
  }
  return (
    <div className={`dots ${className}`} style={style} role="img" aria-label={`Photo ${index + 1} sur ${count}`}>
      {dots}
    </div>
  )
}
