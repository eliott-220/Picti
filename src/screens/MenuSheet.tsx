import { Icon, Logo, type IconName } from '../components/Icon'
import { Sheet } from '../components/ui'
import { useStore } from '../data/storeContext'
import { supabase } from '../data/supabase'
import { isGeoframed } from '../data/types'
import { navigate } from '../router'

export function MenuSheet({ onClose }: { onClose: () => void }) {
  const { myPhotos, captures, profile } = useStore()
  const geoframed = myPhotos.filter(isGeoframed).length
  const hunted = new Set(captures.map((c) => c.photoId)).size

  const items: { icon: IconName; label: string; detail: string; to: string }[] = [
    { icon: 'user', label: 'Mon profil', detail: `${geoframed} photo${geoframed > 1 ? 's' : ''} géocadrée${geoframed > 1 ? 's' : ''}`, to: '/profil' },
    { icon: 'flag', label: 'Mes chasses', detail: `${hunted} capture${hunted > 1 ? 's' : ''}`, to: '/chasses' },
    { icon: 'compass', label: 'Carte du monde', detail: 'Les photos géocadrées partout sur Terre', to: '/carte' },
    { icon: 'pin', label: 'À proximité', detail: 'Photos à retrouver autour de moi', to: '/proximite' },
    { icon: 'search', label: 'Rechercher', detail: 'Par titre ou par type', to: '/recherche' },
  ]

  return (
    <Sheet onClose={onClose} label="Menu">
      <div className="menu-head">
        <Logo size={40} />
        <div>
          <strong>PICTI</strong>
          <span>{profile?.name}</span>
        </div>
        <button type="button" className="icon-btn" onClick={onClose} aria-label="Fermer">
          <Icon name="close" />
        </button>
      </div>
      <ul className="menu">
        {items.map((it) => (
          <li key={it.to}>
            <button type="button" onClick={() => navigate(it.to)}>
              <span className="menu-icon">
                <Icon name={it.icon} />
              </span>
              <span className="menu-text">
                <strong>{it.label}</strong>
                <span>{it.detail}</span>
              </span>
            </button>
          </li>
        ))}
      </ul>
      <button type="button" className="btn ghost signout" onClick={() => void supabase.auth.signOut()}>
        Se déconnecter
      </button>
    </Sheet>
  )
}
