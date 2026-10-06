import { useEffect, useMemo } from 'react'
import { Icon } from '../components/Icon'
import { EmptyState, RoundButton, Thumb } from '../components/ui'
import { registerThumbs } from '../data/imageUrls'
import { groupNotifications, notificationText } from '../data/notifications'
import { useStore } from '../data/storeContext'
import { formatDateTime } from '../data/types'
import { goBack, navigate } from '../router'

/** Notifications : qui a aimé ou capturé mes photos (likes d'une même photo regroupés). */
export function Notifications() {
  const { notifications, markNotificationsRead, reloadNotifications } = useStore()
  const groups = useMemo(() => groupNotifications(notifications), [notifications])
  const unread = groups.filter((g) => g.unread)

  useEffect(() => {
    void reloadNotifications().catch(() => undefined)
  }, [reloadNotifications])
  useEffect(() => {
    registerThumbs(groups.filter((g) => g.thumbPath).map((g) => ({ id: g.photoId, thumbPath: g.thumbPath! })))
  }, [groups])

  return (
    <main className="screen page">
      <header className="card red page-header compact">
        <RoundButton icon="back" label="Retour" onClick={goBack} className="back-btn" />
        <h1 className="display">Notifications</h1>
        {unread.length > 0 && (
          <button
            type="button"
            className="btn small light notif-read-all"
            onClick={() => void markNotificationsRead(unread.flatMap((g) => g.ids))}
          >
            Tout marquer comme lu
          </button>
        )}
      </header>
      <section className="card white">
        {groups.length ? (
          <ul className="notif-list">
            {groups.map((g) => (
              <li key={g.key}>
                <button
                  type="button"
                  className={`notif-row ${g.unread ? 'unread' : ''}`}
                  onClick={() => {
                    void markNotificationsRead(g.ids)
                    navigate(`/photo/${g.photoId}`)
                  }}
                >
                  <Thumb id={g.photoId} className="notif-thumb" />
                  <span className="notif-text">
                    <strong>
                      <Icon name={g.kind === 'capture' ? 'flag' : 'heart'} size={16} /> {notificationText(g)}
                    </strong>
                    <span>{formatDateTime(g.latest, { short: true })}</span>
                  </span>
                  {g.unread && <span className="notif-dot" aria-label="Non lue" />}
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState icon="bell">Quand quelqu’un aimera ou capturera l’une de vos photos, vous le verrez ici.</EmptyState>
        )}
      </section>
    </main>
  )
}
