import { describe, expect, it } from 'vitest'
import { groupNotifications, notificationText, unreadCount } from './notifications'
import type { AppNotification } from './types'

let seq = 0
const notif = (kind: 'like' | 'capture', photoId: string, actor: string, at: number, read = false): AppNotification => ({
  id: `n${++seq}`,
  kind,
  photoId,
  thumbPath: `${photoId}_vignette.jpg`,
  actorId: actor,
  actorName: actor[0].toUpperCase() + actor.slice(1),
  createdAt: at,
  read,
})

describe('groupNotifications', () => {
  const list = [
    notif('like', 'port', 'paul', 10),
    notif('like', 'port', 'marie', 20),
    notif('capture', 'port', 'jean', 15),
    notif('like', 'phare', 'paul', 5, true),
    notif('like', 'port', 'lea', 30, true),
    notif('like', 'port', 'zoe', 25),
    notif('capture', 'port', 'paul', 12),
  ]
  const groups = groupNotifications(list)

  it('réunit les likes d’une même photo, garde chaque capture à part', () => {
    expect(groups.map((g) => g.key)).toEqual(['like:port', 'capture:n3', 'capture:n7', 'like:phare'])
  })

  it('cite le plus récent en premier, compte les autres', () => {
    expect(groups[0].actors.map((a) => a.id)).toEqual(['lea', 'zoe', 'marie', 'paul'])
    expect(notificationText(groups[0])).toBe('Lea et 3 autres aiment votre photo')
    expect(groups[0].ids).toHaveLength(4)
  })

  it('non lu si au moins une notification du groupe n’est pas lue', () => {
    expect(groups[0].unread).toBe(true)
    expect(groups[3].unread).toBe(false)
    expect(unreadCount(list)).toBe(5)
  })

  it('textes : capture, un like, deux likes', () => {
    expect(notificationText(groups[1])).toBe('Jean a capturé votre photo')
    expect(notificationText(groups[3])).toBe('Paul aime votre photo')
    expect(notificationText({ kind: 'like', actors: [{ id: 'a', name: 'Paul' }, { id: 'b', name: 'Marie' }] })).toBe(
      'Paul et Marie aiment votre photo',
    )
  })

  it('un même auteur n’est compté qu’une fois', () => {
    const twice = groupNotifications([notif('like', 'x', 'paul', 1), notif('like', 'x', 'paul', 2)])
    expect(twice[0].actors).toHaveLength(1)
    expect(notificationText(twice[0])).toBe('Paul aime votre photo')
  })
})
