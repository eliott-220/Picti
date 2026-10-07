/**
 * Style des boutons selon le téléphone (depuis 0.17.0) :
 * - iPhone / iPad (et ordinateur) : « Liquid Glass » (verre liquide d'iOS 26, façon BeReal) ;
 * - Android : Material 3 (Material You : forme qui se transforme à l'appui, onde).
 * La plateforme est posée sur <html data-ui="ios|android"> avant le premier rendu ;
 * tout le reste est en CSS (`styles.css`, section « Boutons selon la plateforme »).
 *
 * Pour essayer l'autre style : ajouter `?ui=android` ou `?ui=ios` à l'adresse
 * (mémorisé, `?ui=auto` revient à la détection).
 */

export type UiPlatform = 'ios' | 'android'

const STORAGE_KEY = 'picti.ui'

export function detectPlatform({
  userAgent = '',
  platform = '',
}: {
  userAgent?: string
  /** `navigator.userAgentData.platform` (Chrome) ou `navigator.platform`. */
  platform?: string
}): UiPlatform {
  if (/android/i.test(userAgent) || /android/i.test(platform)) return 'android'
  // Le reste (iPhone, iPad — qui se présente comme un Mac tactile —, ordinateur) : verre liquide.
  return 'ios'
}

/** `?ui=android|ios|auto` dans l'adresse (avant ou après le #), sinon le choix mémorisé. */
export function readOverride(search: string, hash: string, stored: string | null): UiPlatform | 'auto' | null {
  const query = `${search}&${hash.includes('?') ? hash.slice(hash.indexOf('?') + 1) : ''}`
  const asked = new URLSearchParams(query.replace(/^\?/, '')).get('ui')
  if (asked === 'ios' || asked === 'android' || asked === 'auto') return asked
  return stored === 'ios' || stored === 'android' ? stored : null
}

export function applyPlatform(): UiPlatform {
  let stored: string | null = null
  try {
    stored = localStorage.getItem(STORAGE_KEY)
  } catch {
    // stockage indisponible (navigation privée) : détection seule
  }
  const override = readOverride(location.search, location.hash, stored)
  try {
    if (override === 'auto') localStorage.removeItem(STORAGE_KEY)
    else if (override) localStorage.setItem(STORAGE_KEY, override)
  } catch {
    // sans mémoire, le choix ne vaut que pour cette ouverture
  }
  const nav = navigator as Navigator & { userAgentData?: { platform?: string } }
  const ui =
    override && override !== 'auto'
      ? override
      : detectPlatform({
          userAgent: nav.userAgent,
          platform: nav.userAgentData?.platform ?? nav.platform,
        })
  document.documentElement.dataset.ui = ui
  if (ui === 'android') installRipple()
  return ui
}

const RIPPLE_TARGETS = '.round-btn, .btn, .shutter, .visibility-pill, .segmented button, button.chip'

/** Android : onde Material qui part du doigt (position posée en variables CSS). */
function installRipple() {
  document.addEventListener(
    'pointerdown',
    (event) => {
      const target = (event.target as Element | null)?.closest<HTMLElement>(RIPPLE_TARGETS)
      if (!target || (target as HTMLButtonElement).disabled) return
      const box = target.getBoundingClientRect()
      const size = Math.hypot(box.width, box.height) * 2
      target.style.setProperty('--ripple-x', `${event.clientX - box.left}px`)
      target.style.setProperty('--ripple-y', `${event.clientY - box.top}px`)
      target.style.setProperty('--ripple-size', `${size}px`)
      target.classList.remove('rippling')
      void target.offsetWidth // relance l'animation à chaque appui
      target.classList.add('rippling')
    },
    { passive: true, capture: true },
  )
  document.addEventListener(
    'animationend',
    (event) => {
      if (event.animationName === 'md-ripple') (event.target as Element).classList.remove('rippling')
    },
    true,
  )
}
