import { reloadApp, useUpdateAvailable } from '../data/appUpdate'
import { Icon } from './Icon'

/** Notification affichée quand une nouvelle version de PICTI est en ligne. */
export function UpdateBanner() {
  const available = useUpdateAvailable()
  if (!available) return null
  return (
    <div className="update-banner" role="status">
      <Icon name="download" size={18} />
      <span>Nouvelle version de PICTI disponible</span>
      <button type="button" onClick={reloadApp}>
        Mettre à jour
      </button>
    </div>
  )
}
