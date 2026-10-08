import type { GeoFix } from '../geo/geodesy'
import { GPS_GOOD_ACCURACY } from '../geo/tracking'
import { hasNativePosition } from '../native'
import { openAppSettings } from '../sensors/positionSource'
import type { GeolocationState } from '../sensors/useGeolocation'
import { currentMotion } from '../sensors/motion'
import { isRemembered } from '../sensors/permissions'
import type { OrientationState } from '../sensors/useOrientation'
import { Icon } from './Icon'

/** Pastilles d'état du GPS et de la boussole, indispensables au géocadrage. */
export function SensorStatus({
  geo,
  orientation,
  position = null,
  visual = false,
}: {
  geo: GeolocationState
  orientation: OrientationState
  /** Position réellement utilisée (suivi visuel calé : sa précision s'affine en marchant). */
  position?: GeoFix | null
  /** Le cap vient du suivi visuel (app iPhone). */
  visual?: boolean
}) {
  const fix = position ?? geo.fix
  // Au-delà de ±12 m, la pastille passe à l'orange : une photo prise risque d'être mal placée.
  const gps = fix
    ? {
        ok: fix.accuracy <= GPS_GOOD_ACCURACY,
        warn: fix.accuracy > GPS_GOOD_ACCURACY,
        // « marche » : l'accéléromètre voit les pas (la position suit alors le GPS de près).
        // Le mot « GPS » est retiré (0.16.2) : l'épingle suffit, « ±3 m » se lit tout seul.
        text: `±${Math.round(fix.accuracy)} m${!visual && currentMotion() === 'moving' ? ' · marche' : ''}`,
      }
    : { ok: false, warn: false, text: geo.error ?? '…' }

  let compass: { ok: boolean; text: string }
  switch (orientation.status) {
    case 'active':
      compass = visual
        ? { ok: true, text: 'Suivi visuel' }
        : orientation.absolute
          ? { ok: true, text: 'Boussole' }
          : { ok: false, text: 'Boussole relative' }
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

  // App iPhone, position refusée : la pastille ouvre les réglages de l'app (le navigateur, lui,
  // ne permet pas d'y aller).
  const settings = geo.denied && !geo.fix && hasNativePosition()

  return (
    <div className="sensor-status">
      {settings ? (
        <button type="button" className="chip action" onClick={openAppSettings}>
          <Icon name="pin" size={14} /> Position refusée · Réglages
        </button>
      ) : (
        <span className={`chip ${gps.ok ? 'ok' : ''} ${gps.warn ? 'warn' : ''}`} title="Précision du GPS" aria-label={`Précision du GPS : ${gps.text}`}>
          <Icon name="pin" size={14} /> {gps.text}
        </span>
      )}
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
