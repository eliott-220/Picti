import { nextVisibility, VISIBILITY_SHORT, VISIBLE_BY, type Visibility } from '../data/types'
import { Icon, type IconName } from './Icon'

const VISIBILITY_ICON: Record<Visibility, IconName> = {
  public: 'globe',
  amis: 'friends',
  prive: 'lock',
}

/**
 * Pastille « Amis » / « Public » / « Privé » : visibilité des prochaines photos ;
 * un appui fait défiler les trois valeurs.
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
