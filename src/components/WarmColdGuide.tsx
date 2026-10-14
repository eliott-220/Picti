import { ignoreGuideTarget } from '../data/guideTarget'
import { formatDistance, type GeoFix } from '../geo/geodesy'
import { WARM_COLD } from '../geo/warmCold'
import { navigate } from '../router'
import { useGuideHeading } from '../sensors/useGuideHeading'
import { Icon } from './Icon'
import { GuideArrow } from './ui'
import { useWarmCold } from './useWarmCold'

const WARMTH_LABEL = { froid: 'froid', tiede: 'tiède', chaud: 'chaud' }

/**
 * Chaud / froid sur le viseur (0.24.0) : pastille au-dessus de la rangée de zoom, entre 20 et 500 m d'une photo
 * — flèche vers elle selon le cap du téléphone, distance, couleur du froid (bleu) au chaud (rouge), « Plus
 * chaud / Plus froid » ; appui = sa fiche ; croix = l'ignorer une heure (le guidage passe à la suivante).
 * `shown` : viseur affiché, caméra arrière, hors Reproduire (le tutoriel est un autre écran) ; vibrations aux
 * paliers seulement alors. `wide` : grand angle 0,5 — sans cap fiable, rien. GPS moins précis que la
 * distance : « Position imprécise ».
 */
export function WarmColdGuide({ fix, shown, faded = false, wide = false }: { fix: GeoFix | null; shown: boolean; faded?: boolean; wide?: boolean }) {
  const guide = useWarmCold(fix, { haptics: shown })
  const { heading } = useGuideHeading()
  if (!shown || !guide || (wide && heading == null)) return null
  const className = `warm-cold${faded ? ' faded' : ''}`

  if (guide.almost)
    return (
      <div className={`${className} chaud almost`} role="status">
        Tu y es presque : lève le téléphone
      </div>
    )
  // Sous 20 m : le viseur RA et la chasse prennent le relais.
  if (guide.distance < WARM_COLD.min) return null
  if (guide.imprecise)
    return (
      <div className={`${className} imprecise`} role="status">
        <Icon name="pin" size={16} /> Position imprécise
      </div>
    )

  const distance = formatDistance(guide.distance)
  return (
    <div className={`${className} ${guide.warmth}`} data-warmth={guide.warmth}>
      <button
        type="button"
        className="warm-cold-main"
        aria-label={`Photo à ${distance}, ${WARMTH_LABEL[guide.warmth]}${guide.trend ? `, ${guide.trend.toLowerCase()}` : ''} : ouvrir sa fiche`}
        onClick={() => navigate(`/photo/${guide.id}`)}
      >
        <GuideArrow heading={heading} bearing={guide.bearing} size={18} />
        {heading == null && <small className="warm-cold-north">N</small>}
        <strong>{distance}</strong>
        {guide.trend && <span className="warm-cold-trend">{guide.trend}</span>}
      </button>
      <button type="button" className="warm-cold-ignore" aria-label="Ignorer cette photo pendant une heure" onClick={() => ignoreGuideTarget(guide.id)}>
        <Icon name="close" size={14} />
      </button>
    </div>
  )
}
