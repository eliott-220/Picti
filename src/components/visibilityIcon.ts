import type { Visibility } from '../data/types'
import type { IconName } from './Icon'

/** Symbole de chaque mode : déclencheur du viseur, pastille de l'import. */
export const VISIBILITY_ICON: Record<Visibility, IconName> = {
  public: 'globe',
  amis: 'friends',
  prive: 'lock',
}
