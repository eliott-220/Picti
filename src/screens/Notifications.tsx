import { useEffect, useMemo } from 'react'
import { Icon } from '../components/Icon'
import { EmptyState, Thumb } from '../components/ui'
import { registerThumbs } from '../data/imageUrls'
import { groupNotifications, notificationParts, notificationText } from '../data/notifications'
import { useStore } from '../data/storeContext'
import { formatDateTime } from '../data/types'
import { navigate } from '../router'

/**
 * Notifications : qui a aimé ou capturé mes photos (likes d'une même photo regroupés). Depuis 0.23.1, en
 * tête de l'onglet Amis (plus d'écran à part ni de cloche au viseur) ; relues quand l'onglet s'affiche.
 */
export function NotificationList({ active }: { active: boolean }) {
  const { notifications, markNotificationsRead, reloadNotifications } = useStore()
  const groups = useMemo(() => groupNotifications(notifications), [notifications])
  const unread = groups.filter((g) => g.unread)

  useEffect(() => {
    if (active) void reloadNotifications().catch(() => undefined)
  }, [active, reloadNotifications])
  useEffect(() => {
    registerThumbs(groups.filter((g) => g.thumbPath).map((g) => ({ id: g.photoId, thumbPath: g.thumbPath! })))
  }, [groups])

  return (
    <section className="notif-section" aria-labelledby="notifications-titre">
      <div className="notif-head">
        <h2 className="section-title" id="notifications-titre">
          Notifications{unread.length ? ` (${unread.length})` : ''}
        </h2>
        {unread.length > 0 && (
          <button
            type="button"
            className="btn small ghost notif-read-all"
            onClick={() => void markNotificationsRead(unread.flatMap((g) => g.ids))}
          >
            Tout marquer comme lu
          </button>
        )}
      </div>
        {groups.length ? (
          <ul className="notif-list">
            {groups.map((g) => (
              <li key={g.key} className={`notif-row ${g.unread ? 'unread' : ''}`}>
                {/* Toute la ligne ouvre la fiche de la photo ; les noms, par-dessus, ouvrent les profils. */}
                <button
                  type="button"
                  className="notif-open"
                  aria-label={`${notificationText(g)}, ${formatDateTime(g.latest, { short: true })}${g.unread ? ', non lue' : ''} : voir la photo`}
                  onClick={() => {
                    void markNotificationsRead(g.ids)
                    navigate(`/photo/${g.photoId}`)
                  }}
                />
                <Thumb id={g.photoId} className="notif-thumb" />
                <span className="notif-text">
                  <strong>
                    <Icon name={g.kind === 'capture' ? 'flag' : 'heart'} size={16} />{' '}
                    {notificationParts(g).map((part, i) =>
                      typeof part === 'string' ? (
                        part
                      ) : (
                        <button
                          key={i}
                          type="button"
                          className="name-link"
                          onClick={() => {
                            void markNotificationsRead(g.ids)
                            navigate(`/personne/${part.id}`)
                          }}
                        >
                          {part.name}
                        </button>
                      ),
                    )}
                  </strong>
                  <span>{formatDateTime(g.latest, { short: true })}</span>
                </span>
                {g.unread && <span className="notif-dot" aria-hidden="true" />}
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState icon="bell">Quand quelqu’un aimera ou capturera l’une de tes photos, tu le verras ici.</EmptyState>
        )}
    </section>
  )
}
