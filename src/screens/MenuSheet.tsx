import { Icon, type IconName } from '../components/Icon'
import { IconButton, Sheet } from '../components/ui'
import { APP_NUMBER } from '../data/appUpdate'
import { useStore } from '../data/storeContext'
import { navigate } from '../router'

/**
 * Menu (bouton 4 carrés de la barre, 0.23.0) : feuille Explorer. Grille 2 × 2 — À proximité, Rechercher,
 * Mes chasses, Amis — puis « Carte du monde » (le même écran que le glissé vers la droite, pour qui ne
 * connaît pas le geste). Mon profil a son bouton dans la barre ; compte, tutoriel, version et réglages
 * sont dans Mon profil › Paramètres.
 */
export function MenuSheet({ onClose, onMap, onFriends }: { onClose: () => void; onMap: () => void; onFriends: () => void }) {
  const { photos, nearby, captures, isMine, friends } = useStore()
  const captured = new Set(captures.map((c) => c.photoId))
  const toHunt = photos.filter((p) => nearby.has(p.id) && !isMine(p) && !captured.has(p.id)).length
  const requests = friends.filter((f) => f.status === 'pending' && !f.outgoing).length
  const plural = (n: number, word: string) => `${n} ${word}${n > 1 ? 's' : ''}`

  const tiles: { icon: IconName; label: string; detail: string; open: () => void; badge?: number }[] = [
    {
      icon: 'pin',
      label: 'À proximité',
      detail: toHunt ? `${plural(toHunt, 'photo')} à chasser autour de toi` : 'Photos à chasser autour de toi',
      open: () => navigate('/proximite'),
    },
    { icon: 'search', label: 'Rechercher', detail: 'Titre, type, selfies, personnes', open: () => navigate('/recherche') },
    {
      icon: 'flag',
      label: 'Mes chasses',
      detail: captured.size ? `${plural(captured.size, 'capture')}` : 'En cours et capturées',
      open: () => navigate('/chasses'),
    },
    {
      icon: 'friends',
      label: 'Amis',
      detail: requests ? `${plural(requests, 'demande')} à accepter` : 'Inviter par lien ou QR code',
      open: onFriends,
      badge: requests,
    },
  ]

  return (
    <Sheet onClose={onClose} label="Explorer" className="explorer">
      <div className="explorer-head">
        <h2>Explorer</h2>
        <IconButton icon="close" label="Fermer" onClick={onClose} />
      </div>
      <ul className="explorer-grid">
        {tiles.map((t) => (
          <li key={t.label}>
            <button type="button" className="explorer-tile" onClick={t.open}>
              <span className="explorer-icon">
                <Icon name={t.icon} size={26} />
                {!!t.badge && (
                  <span className="round-badge" aria-label={plural(t.badge, 'demande') + ' d’ami'}>
                    {t.badge > 99 ? '99+' : t.badge}
                  </span>
                )}
              </span>
              <strong>{t.label}</strong>
              <span>{t.detail}</span>
            </button>
          </li>
        ))}
      </ul>
      <button type="button" className="explorer-row" onClick={onMap}>
        <Icon name="compass" />
        <span>
          <strong>Carte du monde</strong>
          <small>Ou glisse vers la droite sur le viseur</small>
        </span>
      </button>
      <p className="explorer-footer">PICTI {APP_NUMBER}</p>
    </Sheet>
  )
}
