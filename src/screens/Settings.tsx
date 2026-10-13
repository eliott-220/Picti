import { useEffect, useRef, useState } from 'react'
import { Icon } from '../components/Icon'
import { PremiumCard } from '../components/PremiumCard'
import { Chip, RoundButton } from '../components/ui'
import { useToast } from '../components/toastContext'
import { formatVersion, reloadApp } from '../data/appUpdate'
import { setShotVisibility, useShotVisibility } from '../data/shotVisibility'
import { useStore } from '../data/storeContext'
import { supabase } from '../data/supabase'
import { VISIBILITIES, VISIBILITY_AUDIENCE, visibilityHelp } from '../data/types'
import { hasArTracking, isNative } from '../native'
import { goBack, navigate } from '../router'
import { setArSetting, useArState } from '../sensors/arTracking'
import { useCameraFocal } from '../sensors/cameraFocal'

/** Réglages avancés montrés après 7 appuis sur la version (gardé sur l'appareil). */
const ADVANCED_KEY = 'picti.avance'
/** Appuis sur la version qui montrent les réglages avancés. */
export const ADVANCED_TAPS = 7

function advancedUnlocked(): boolean {
  try {
    return localStorage.getItem(ADVANCED_KEY) === 'oui'
  } catch {
    return false
  }
}

/**
 * Paramètres (0.23.0, Mon profil › ⚙️) : seulement les réglages qui existent déjà — mode par défaut des
 * photos, compte (pseudo, e-mail, Premium, déconnexion ; « Supprimer mon compte » depuis 0.24.0),
 * confidentialité (utilisateurs bloqués, 0.24.0), tutoriel, à propos (conditions d'utilisation et
 * confidentialité, version, focale, Recharger sur le site) ; « Avancé » (suivi visuel) après 7 appuis sur la
 * version.
 */
export function Settings() {
  const { profile } = useStore()
  const toast = useToast()
  const visibility = useShotVisibility()
  const { focal35, measured } = useCameraFocal()
  const [email, setEmail] = useState<string | null>(null)
  useEffect(() => {
    let alive = true
    void supabase.auth.getUser().then(({ data }) => alive && setEmail(data.user?.email ?? null))
    return () => {
      alive = false
    }
  }, [])
  // App iPhone : le suivi visuel (ARKit) se coupe ici, pour comparer avec le GPS et la boussole seuls.
  const ar = useArState()
  const arToggle = hasArTracking() && ar.status !== 'unavailable'
  const arOn = ar.status !== 'disabled'

  const [advanced, setAdvanced] = useState(advancedUnlocked)
  const taps = useRef(0)
  function tapVersion() {
    if (advanced) return
    taps.current++
    const left = ADVANCED_TAPS - taps.current
    if (left > 0) {
      if (left <= 3) toast(`Encore ${left} appui${left > 1 ? 's' : ''} pour les réglages avancés`)
      return
    }
    try {
      localStorage.setItem(ADVANCED_KEY, 'oui')
    } catch {
      // Stockage refusé : affichés pour cette visite.
    }
    setAdvanced(true)
    toast('Réglages avancés affichés')
  }

  return (
    <main className="screen page settings">
      <header className="card red page-header compact">
        <RoundButton icon="back" label="Retour" onClick={goBack} className="back-btn" />
        <h1 className="display">Paramètres</h1>
      </header>

      <section className="card white settings-body">
        <div className="settings-group" aria-labelledby="reglages-prise">
          <h2 className="section-title" id="reglages-prise">
            Prise de vue
          </h2>
          <div className="visibility default-visibility">
            Mes nouvelles photos sont visibles par :
            <div className="chips" role="radiogroup" aria-label="Visibilité par défaut de mes nouvelles photos">
              {VISIBILITIES.map((v) => (
                <Chip key={v} label={VISIBILITY_AUDIENCE[v]} selected={visibility === v} onClick={() => v !== visibility && setShotVisibility(v)} />
              ))}
            </div>
            <small>
              {visibilityHelp(visibility, { plural: true })} Tu peux aussi changer avant chaque photo (reste appuyé sur le
              bouton rouge et glisse vers le haut) ou après coup, dans la fiche de la photo.
            </small>
          </div>
        </div>

        <div className="settings-group" aria-labelledby="reglages-compte">
          <h2 className="section-title" id="reglages-compte">
            Compte
          </h2>
          <dl className="settings-list">
            <div>
              <dt>Pseudo</dt>
              <dd>{profile?.name || '—'}</dd>
            </div>
            <div>
              <dt>E-mail</dt>
              <dd>{email ?? '…'}</dd>
            </div>
          </dl>
          <PremiumCard />
          <button type="button" className="btn ghost settings-signout" onClick={() => void supabase.auth.signOut()}>
            Se déconnecter
          </button>
          {/* 0.24.0 (règle 5.1.1 v d'Apple) : en rouge, en bas du groupe. */}
          <button type="button" className="settings-row danger" onClick={() => navigate('/supprimer-compte')}>
            <Icon name="trash" />
            <span>
              <strong>Supprimer mon compte</strong>
              <small>Mes photos, captures, likes et amis sont effacés</small>
            </span>
          </button>
        </div>

        <div className="settings-group" aria-labelledby="reglages-confidentialite">
          <h2 className="section-title" id="reglages-confidentialite">
            Confidentialité
          </h2>
          <button type="button" className="settings-row" onClick={() => navigate('/bloques')}>
            <Icon name="lock" />
            <span>
              <strong>Utilisateurs bloqués</strong>
              <small>Débloquer quelqu’un</small>
            </span>
          </button>
        </div>

        <div className="settings-group" aria-labelledby="reglages-aide">
          <h2 className="section-title" id="reglages-aide">
            Aide
          </h2>
          <button type="button" className="settings-row" onClick={() => navigate('/tutoriel')}>
            <Icon name="scan" />
            <span>
              <strong>Revoir le tutoriel</strong>
              <small>Prendre une photo d’essai et la retrouver, en 30 secondes</small>
            </span>
          </button>
        </div>

        <div className="settings-group" aria-labelledby="reglages-a-propos">
          <h2 className="section-title" id="reglages-a-propos">
            À propos
          </h2>
          <button type="button" className="settings-row" onClick={() => navigate('/cgu')}>
            <Icon name="flag" />
            <span>
              <strong>Conditions d’utilisation</strong>
            </span>
          </button>
          <button type="button" className="settings-row" onClick={() => navigate('/confidentialite')}>
            <Icon name="lock" />
            <span>
              <strong>Confidentialité</strong>
            </span>
          </button>
          <button type="button" className="settings-version" onClick={tapVersion} aria-label={formatVersion()}>
            {formatVersion()}
          </button>
          <p className="settings-note">
            Caméra {focal35.toFixed(0)} mm{measured ? ' (mesurée)' : ''}
          </p>
          {!isNative() && (
            <button type="button" className="btn small ghost" onClick={reloadApp}>
              <Icon name="reload" size={18} /> Recharger
            </button>
          )}
        </div>

        {advanced && (
          <div className="settings-group" aria-labelledby="reglages-avance">
            <h2 className="section-title" id="reglages-avance">
              Avancé
            </h2>
            {arToggle ? (
              <button type="button" className="settings-row" aria-pressed={arOn} onClick={() => setArSetting(!arOn)}>
                <Icon name="eye" />
                <span>
                  <strong>Suivi visuel : {arOn ? 'activé' : 'coupé'}</strong>
                  <small>
                    {arOn
                      ? 'Les photos restent à leur place quand tu bouges (caméra et capteurs de l’iPhone)'
                      : 'Position par le GPS et la boussole seuls, comme sur le site'}
                  </small>
                </span>
              </button>
            ) : (
              <p className="settings-note">Rien à régler sur cet appareil (le suivi visuel n’existe que dans l’app iPhone).</p>
            )}
          </div>
        )}
      </section>
    </main>
  )
}
