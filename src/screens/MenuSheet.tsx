import { Icon, Logo, type IconName } from '../components/Icon'
import { IconButton, Sheet } from '../components/ui'
import { useStore } from '../data/storeContext'
import { useCameraFocal } from '../sensors/cameraFocal'
import { formatVersion, reloadApp } from '../data/appUpdate'
import { supabase } from '../data/supabase'
import { isGeoframed } from '../data/types'
import { navigate } from '../router'

export function MenuSheet({ onClose }: { onClose: () => void }) {
  const { myPhotos, captures, profile, friends } = useStore()
  const { focal35, measured } = useCameraFocal()
  const geoframed = myPhotos.filter(isGeoframed).length
  const hunted = new Set(captures.map((c) => c.photoId)).size
  const requests = friends.filter((f) => f.status === 'pending' && !f.outgoing).length

  const items: { icon: IconName; label: string; detail: string; to: string; badge?: number }[] = [
    requests
      ? {
          icon: 'user',
          label: 'Mon profil',
          detail: `${requests} demande${requests > 1 ? 's' : ''} d’ami à accepter`,
          to: '/profil/amis',
          badge: requests,
        }
      : { icon: 'user', label: 'Mon profil', detail: `${geoframed} photo${geoframed > 1 ? 's' : ''} géocadrée${geoframed > 1 ? 's' : ''}`, to: '/profil' },
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
        <IconButton icon="close" label="Fermer" onClick={onClose} />
      </div>
      <ul className="menu">
        {items.map((it) => (
          <li key={it.to}>
            <button type="button" onClick={() => navigate(it.to)}>
              <span className="menu-icon">
                <Icon name={it.icon} />
                {!!it.badge && (
                  <span className="round-badge" aria-label={`${it.badge} demande${it.badge > 1 ? 's' : ''} d’ami`}>
                    {it.badge > 99 ? '99+' : it.badge}
                  </span>
                )}
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
      <div className="menu-footer">
        <span>
          {formatVersion()}
          <small>
            Caméra {focal35.toFixed(0)} mm{measured ? ' (mesurée)' : ''}
          </small>
        </span>
        <button type="button" className="btn small ghost" onClick={reloadApp}>
          <Icon name="reload" size={18} /> Recharger
        </button>
      </div>
    </Sheet>
  )
}
