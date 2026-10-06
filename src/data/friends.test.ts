import { describe, expect, it } from 'vitest'
import { FRIEND_BUTTON_LABEL, friendState } from './friends'
import type { Friendship } from './types'

const link = (userId: string, status: Friendship['status'], outgoing: boolean): Friendship => ({
  userId,
  name: userId,
  city: '',
  status,
  outgoing,
})

describe('bouton d’amitié : friendState', () => {
  const friends = [link('paul', 'accepted', true), link('lea', 'pending', true), link('max', 'pending', false)]

  it('rien, demande envoyée, demande reçue, amis', () => {
    expect(friendState(friends, 'zoe')).toBe('none')
    expect(friendState(friends, 'lea')).toBe('outgoing')
    expect(friendState(friends, 'max')).toBe('incoming')
    expect(friendState(friends, 'paul')).toBe('friends')
    expect(friendState([], 'paul')).toBe('none')
  })

  it('amis quel que soit celui qui a demandé', () => {
    expect(friendState([link('paul', 'accepted', false)], 'paul')).toBe('friends')
  })

  it('demandes croisées : on peut accepter la sienne', () => {
    expect(friendState([link('ana', 'pending', true), link('ana', 'pending', false)], 'ana')).toBe('incoming')
    expect(friendState([link('ana', 'pending', true), link('ana', 'accepted', false)], 'ana')).toBe('friends')
  })

  it('libellés', () => {
    expect(FRIEND_BUTTON_LABEL.none).toBe('Ajouter en ami')
    expect(FRIEND_BUTTON_LABEL.outgoing).toBe('Demande envoyée')
    expect(FRIEND_BUTTON_LABEL.incoming).toBe('Accepter')
    expect(FRIEND_BUTTON_LABEL.friends).toBe('Amis ✓')
  })
})
