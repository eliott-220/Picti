import type { GeolocationState } from '../sensors/useGeolocation'
import { isRemembered } from '../sensors/permissions'
import type { OrientationState } from '../sensors/useOrientation'
import { Icon } from './Icon'

/** Pastilles d'état du GPS et de la boussole, indispensables au géocadrage. */
export function SensorStatus({ geo, orientation }: { geo: GeolocationState; orientation: OrientationState }) {
  const gps = geo.fix
    ? { ok: geo.fix.accuracy <= 25, text: `GPS ±${Math.round(geo.fix.accuracy)} m` }
    : { ok: false, text: geo.error ?? 'GPS…' }

  let compass: { ok: boolean; text: string }
  switch (orientation.status) {
    case 'active':
      compass = orientation.absolute ? { ok: true, text: 'Boussole' } : { ok: false, text: 'Boussole relative' }
      break
    case 'needs-permission':
      // Déjà autorisée lors d'une ouverture précédente : un appui n'importe où la réactive.
      compass = { ok: false, text: isRemembered('boussole') ? 'Boussole : touchez l’écran' : 'Activer la boussole' }
      break
    case 'denied':
      compass = { ok: false, text: 'Boussole refusée' }
      break
    case 'unsupported':
      compass = { ok: false, text: 'Sans boussole' }
      break
    default:
      compass = { ok: false, text: 'Boussole…' }
  }

  return (
    <div className="sensor-status">
      <span className={`chip ${gps.ok ? 'ok' : ''}`}>
        <Icon name="pin" size={14} /> {gps.text}
      </span>
      {orientation.status === 'needs-permission' ? (
        <button type="button" className="chip action" onClick={() => void orientation.requestPermission()}>
          <Icon name="compass" size={14} /> {compass.text}
        </button>
      ) : (
        <span className={`chip ${compass.ok ? 'ok' : ''}`}>
          <Icon name="compass" size={14} /> {compass.text}
        </span>
      )}
    </div>
  )
}
