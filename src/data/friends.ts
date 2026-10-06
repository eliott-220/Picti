// État d'une amitié vu de l'utilisateur connecté (bouton d'amitié de la fiche et du profil public).

import type { FriendState, Friendship } from './types'

/** Amitié avec `userId` d'après la liste du store : rien, demande envoyée, demande reçue, amis. */
export function friendState(friends: readonly Friendship[], userId: string): FriendState {
  // Deux demandes croisées (rare) : l'amitié acceptée d'abord, puis la demande reçue (on peut l'accepter).
  const links = friends.filter((f) => f.userId === userId)
  if (links.some((f) => f.status === 'accepted')) return 'friends'
  if (links.some((f) => !f.outgoing)) return 'incoming'
  if (links.length) return 'outgoing'
  return 'none'
}

/** Libellé du bouton d'amitié dans chaque état. */
export const FRIEND_BUTTON_LABEL: Record<FriendState, string> = {
  none: 'Ajouter en ami',
  outgoing: 'Demande envoyée',
  incoming: 'Accepter',
  friends: 'Amis ✓',
}
