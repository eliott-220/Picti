// Notifications de l'auteur d'une photo : likes (regroupés par photo, pour ne pas inonder la
// liste) et captures (une par chasseur).

import type { AppNotification, NotificationKind } from './types'

export interface NotificationGroup {
  /** Clé stable : la photo pour les likes, la notification pour une capture. */
  key: string
  kind: NotificationKind
  photoId: string
  thumbPath: string | null
  /** Auteurs, du plus récent au plus ancien, sans doublon. */
  actors: { id: string; name: string }[]
  /** Notifications regroupées (pour les marquer lues ensemble). */
  ids: string[]
  /** Date de la plus récente (ms). */
  latest: number
  /** Au moins une n'est pas lue. */
  unread: boolean
}

/**
 * Likes d'une même photo réunis en une ligne (« Paul et 4 autres aiment votre photo ») ; chaque
 * capture garde la sienne. Les plus récentes d'abord.
 */
export function groupNotifications(list: AppNotification[]): NotificationGroup[] {
  const sorted = [...list].sort((a, b) => b.createdAt - a.createdAt)
  const groups = new Map<string, NotificationGroup>()
  for (const n of sorted) {
    const key = n.kind === 'like' ? `like:${n.photoId}` : `capture:${n.id}`
    let g = groups.get(key)
    if (!g) {
      g = {
        key,
        kind: n.kind,
        photoId: n.photoId,
        thumbPath: n.thumbPath,
        actors: [],
        ids: [],
        latest: n.createdAt,
        unread: false,
      }
      groups.set(key, g)
    }
    g.ids.push(n.id)
    g.unread ||= !n.read
    if (!g.actors.some((a) => a.id === n.actorId)) g.actors.push({ id: n.actorId, name: n.actorName || 'Quelqu’un' })
  }
  return [...groups.values()].sort((a, b) => b.latest - a.latest)
}

/** Texte d'une ligne de notification. */
export function notificationText(g: Pick<NotificationGroup, 'kind' | 'actors'>): string {
  const [first, second] = g.actors
  const name = first?.name ?? 'Quelqu’un'
  if (g.kind === 'capture') return `${name} a capturé votre photo`
  if (g.actors.length <= 1) return `${name} aime votre photo`
  if (g.actors.length === 2) return `${name} et ${second.name} aiment votre photo`
  const others = g.actors.length - 1
  return `${name} et ${others} autres aiment votre photo`
}

/** Nombre de notifications non lues (pastille de la cloche). */
export const unreadCount = (list: AppNotification[]) => list.filter((n) => !n.read).length
