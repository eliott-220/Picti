import { Icon, type IconName } from '../components/Icon'
import { IconButton, Sheet } from '../components/ui'
import { APP_NUMBER } from '../data/appUpdate'
import { useStore } from '../data/storeContext'
import { navigate } from '../router'
import type { CSSProperties } from 'react'

/**
 * Menu (bouton 4 carrés au-dessus de la barre, sur le viseur seulement depuis 0.23.1) : feuille Explorer.
 * Grille 2 × 2 — À proximité, Rechercher, Mes chasses, Paramètres. Carte, Amis, Mes photos et Profil ont
 * leur bouton dans la barre.
 */
export function MenuSheet({ onClose, style }: { onClose: () => void; style?: CSSProperties }) {
  const { photos, nearby, captures, isMine } = useStore()
  const captured = new Set(captures.map((c) => c.photoId))
  const toHunt = photos.filter((p) => nearby.has(p.id) && !isMine(p) && !captured.has(p.id)).length
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
    { icon: 'settings', label: 'Paramètres', detail: 'Mode par défaut, compte, tutoriel', open: () => navigate('/parametres') },
  ]

  return (
    <Sheet onClose={onClose} label="Explorer" className="explorer" inPlace style={style}>
      <div className="explorer-head">
        <h2>Explorer</h2>
        <IconButton icon="close" label="Fermer" onClick={onClose} />
      </div>
      <ul className="explorer-grid">
        {tiles.map((t) => (
          <li key={t.label}>
            <button
              type="button"
              className="explorer-tile"
              onClick={() => {
                onClose()
                t.open()
              }}
            >
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
      <p className="explorer-footer">picti {APP_NUMBER}</p>
    </Sheet>
  )
}
