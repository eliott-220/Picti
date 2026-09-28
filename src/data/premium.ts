import { DIFFERE_PREMIUM_REQUIRED } from '../config'
import type { Profile } from './types'

/** Le géocadrage en différé (import) est-il accessible à ce compte ? */
export function canUseDiffere(profile: Profile | null): boolean {
  return !DIFFERE_PREMIUM_REQUIRED || profile?.plan === 'premium'
}
