import { useState } from 'react'
import { reloadApp, useUpdateAvailable } from '../update'
import { Icon } from './Icon'

/** Bandeau affiché dès qu'une nouvelle version de PICTI est en ligne. */
export function UpdateBanner() {
  const available = useUpdateAvailable()
  const [dismissed, setDismissed] = useState(false)
  if (!available || dismissed) return null
  return (
    <div className="update-banner" role="status">
      <span>Nouvelle version de PICTI disponible</span>
      <button type="button" className="update-go" onClick={reloadApp}>
        Mettre à jour
      </button>
      <button type="button" className="update-close" onClick={() => setDismissed(true)} aria-label="Plus tard">
        <Icon name="close" size={18} />
      </button>
    </div>
  )
}
