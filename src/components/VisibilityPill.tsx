import { nextVisibility, VISIBILITY_SHORT, VISIBLE_BY, type Visibility } from '../data/types'
import { Icon } from './Icon'
import { VISIBILITY_ICON } from './visibilityIcon'

/**
 * Pastille « Public » / « Amis » / « Privé » : visibilité des photos importées ;
 * un appui fait défiler les trois valeurs. (Au viseur, c'est le déclencheur qui choisit : `Shutter`.)
 */
export function VisibilityPill({
  value,
  onChange,
  what = 'la prochaine photo',
  className = '',
}: {
  value: Visibility
  onChange: (v: Visibility) => void
  /** Pour le nom accessible : « la prochaine photo », « les photos importées »… */
  what?: string
  className?: string
}) {
  return (
    <button
      type="button"
      className={`visibility-pill ${value} ${className}`}
      onClick={() => onChange(nextVisibility(value))}
      aria-label={`Visibilité de ${what} : ${VISIBLE_BY[value]}. Toucher pour changer`}
      title="Qui pourra la découvrir (toucher pour changer)"
    >
      <Icon name={VISIBILITY_ICON[value]} size={18} />
      {VISIBILITY_SHORT[value]}
    </button>
  )
}
