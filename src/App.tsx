import { useEffect, useLayoutEffect, useRef, useState, type SyntheticEvent } from 'react'
import { Logo } from './components/Icon'
import { PUSH_EASING, PUSH_MS } from './components/swipeOpen'
import { usePasswordRecovery, useSession } from './data/auth'
// Réglages de l'appareil (Vibrations…) appliqués dès le lancement.
import './data/deviceSettings'
import { takePendingInvite } from './data/invite'
import { loadOnboardingDone, markOnboardingDone, onboardingDoneNow } from './data/onboarding'
import { ArShotRefiner } from './components/ArShotRefiner'
import { PublicPhotoNotice } from './components/PublicPhotoNotice'
import { TermsGate } from './components/TermsGate'
import { StoreProvider } from './data/store'
import { useStore } from './data/storeContext'
import { authLinkError, supabase } from './data/supabase'
import { isNative } from './native'
import { goBack, navigate, useRoute, type Route } from './router'
import { ScreenActiveContext, useScreenStack, type SlotTransition } from './screenStack'
import { Auth, type AuthMode } from './screens/Auth'
import { BlockedUsers } from './screens/BlockedUsers'
import { DeleteAccount } from './screens/DeleteAccount'
import { Gallery } from './screens/Gallery'
import { Home } from './screens/Home'
import { Hunt } from './screens/Hunt'
import { Hunts } from './screens/Hunts'
import { Invite } from './screens/Invite'
import { Nearby } from './screens/Nearby'
import { NewPassword } from './screens/NewPassword'
import { Person } from './screens/Person'
import { PhotoDetail } from './screens/PhotoDetail'
import { Recaler } from './screens/Recaler'
import { Reproduce } from './screens/Reproduce'
import { Search } from './screens/Search'
import { Legal } from './screens/Legal'
import { Settings } from './screens/Settings'
import { Tutorial } from './screens/Tutorial'

/**
 * Tutoriel du premier lancement (0.22.0) : `pending` tant que le drapeau de l'app n'est pas lu.
 * Pas de tutoriel par-dessus un lien de l'e-mail expiré : on est déjà en pleine inscription.
 */
function initialTutorial(): 'pending' | 'show' | 'done' {
  if (onboardingDoneNow() || authLinkError) return 'done'
  return isNative() ? 'pending' : 'show'
}

export default function App() {
  const route = useRoute()
  // Conditions d'utilisation et confidentialité (0.24.0) : lisibles sans compte (liens de l'inscription, du
  // site pour App Store Connect) ; connecté, ce sont des pages de la pile comme les autres.
  const legal = route.name === 'cgu' || route.name === 'confidentialite'
  const session = useSession()
  const [recovery, endRecovery] = usePasswordRecovery()
  const [tutorial, setTutorial] = useState(initialTutorial)
  const [authMode, setAuthMode] = useState<AuthMode>('inscription')
  useEffect(() => {
    if (tutorial !== 'pending') return
    let alive = true
    void loadOnboardingDone().then((done) => alive && setTutorial(done ? 'done' : 'show'))
    return () => {
      alive = false
    }
  }, [tutorial])
  // Déjà connecté sur cet appareil (utilisateur d'avant la 0.22.0) : pas de tutoriel s'il se déconnecte.
  if (session && tutorial !== 'done') setTutorial('done')
  useEffect(() => {
    if (session && !onboardingDoneNow()) markOnboardingDone()
  }, [session])

  if (session === undefined) return <Splash />
  if (!session && legal) return <Legal privacy={route.name === 'confidentialite'} />
  // Un compte est obligatoire pour utiliser PICTI ; le tutoriel vient avant (une seule fois).
  if (!session) {
    if (tutorial === 'pending') return <Splash />
    if (tutorial === 'show') {
      return (
        <Tutorial
          account={false}
          onExit={(exit) => {
            markOnboardingDone()
            setAuthMode(exit.to === 'connexion' ? 'connexion' : 'inscription')
            setTutorial('done')
          }}
        />
      )
    }
    return <Auth key={authMode} initialMode={authMode} onTutorial={() => setTutorial('show')} />
  }
  // Arrivée par le lien « mot de passe oublié » : nouveau mot de passe d'abord.
  if (recovery) return <NewPassword onDone={endRecovery} />
  return (
    <StoreProvider key={session.user.id} userId={session.user.id}>
      <TermsGate userId={session.user.id} reading={legal ? <Legal privacy={route.name === 'confidentialite'} /> : null}>
        <Screens />
        <ArShotRefiner />
        <PublicPhotoNotice />
      </TermsGate>
    </StoreProvider>
  )
}

function Splash({ message }: { message?: string }) {
  return (
    <div className="splash">
      <Logo size={72} />
      {message && <p>{message}</p>}
    </div>
  )
}

/**
 * Fait glisser les deux écrans d'un passage (0.23.3) : le nouveau pousse l'ancien, collés l'un à l'autre
 * (« Réduire les animations » : simple fondu). Renvoie les animations, à annuler à la fin.
 */
function slide(incoming: HTMLElement | undefined, outgoing: HTMLElement | undefined, t: SlotTransition): Animation[] {
  const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  // En avançant, le nouvel écran arrive de droite ; au retour, de gauche (et l'ancien repart à droite).
  const side = t.motion === 'forward' ? 1 : -1
  const timing: KeyframeAnimationOptions = reduce
    ? { duration: 200, easing: 'ease-out', fill: 'forwards' }
    : { duration: PUSH_MS, easing: PUSH_EASING, fill: 'forwards' }
  const frames = (from: number, to: number) =>
    reduce ? [] : [{ transform: `translateX(${from}%)` }, { transform: `translateX(${to}%)` }]
  const anims: Animation[] = []
  if (incoming) anims.push(incoming.animate(reduce ? [{ opacity: 0 }, { opacity: 1 }] : frames(100 * side, 0), timing))
  // Fondu : l'ancien écran reste dessous, sauf s'il est au-dessus (retour) — il s'efface alors.
  if (outgoing && (!reduce || t.ghost)) {
    anims.push(outgoing.animate(reduce ? [{ opacity: 1 }, { opacity: 0 }] : frames(0, -100 * side), timing))
  }
  return anims
}

/** Écran qui part en glissant : il reste visible, mais n'est plus touché (le passage dure 300 ms). */
const swallow = (e: SyntheticEvent) => {
  e.stopPropagation()
  e.preventDefault()
}
const SWALLOW_INPUT = {
  onPointerDownCapture: swallow,
  onClickCapture: swallow,
  onTouchStartCapture: (e: SyntheticEvent) => e.stopPropagation(),
}

function Screens() {
  const route = useRoute()
  const { ready, error } = useStore()
  // Écrans gardés montés : celui qu'on quitte en avançant reste caché dessous, et réapparaît tel quel au
  // retour (flèche, geste d'iOS, bouton du navigateur) — pas d'écran blanc le temps de le recharger.
  const { slots, transition, endTransition } = useScreenStack(route)
  const slotEls = useRef(new Map<string, HTMLDivElement>())
  // Passage d'un écran à l'autre (0.23.3) : les deux glissent avant d'être peints ; à la fin, l'ancien
  // est caché (ou démonté s'il a quitté la pile) et les animations retirées dans le même rendu.
  useLayoutEffect(() => {
    if (!transition) return
    const anims = slide(slotEls.current.get(transition.incoming), slotEls.current.get(transition.outgoing.key), transition)
    if (!anims.length) {
      endTransition(transition.id)
      return
    }
    void Promise.all(anims.map((a) => a.finished)).then(
      () => endTransition(transition.id),
      () => {},
    )
    return () => anims.forEach((a) => a.cancel())
  }, [transition, endTransition])

  // Lien d'invitation ouvert avant la connexion (ou confirmation du compte par e-mail, qui
  // ramène à l'accueil) : on y revient une fois connecté.
  useEffect(() => {
    if (!ready) return
    const code = takePendingInvite()
    if (code && route.name !== 'ami') navigate(`/ami/${encodeURIComponent(code)}`, { replace: true })
  }, [ready, route.name])

  if (!ready) return <Splash />
  if (error) {
    return (
      <div className="splash">
        <Logo size={56} />
        <p>{error}</p>
        <button type="button" className="btn ghost" onClick={() => void supabase.auth.signOut()}>
          Se déconnecter
        </button>
      </div>
    )
  }

  return slots.map((slot) => {
    const active = slot.key === (transition?.incoming ?? slots.at(-1)?.key)
    // Écran qui part (pendant le passage) : visible et pas `inert` — ses boutons en verre natif suivent
    // la page (`glassButtons.ts` ne voit que ce qu'on peut toucher) —, mais il n'est plus touché.
    const leaving = !active && slot.key === transition?.outgoing.key
    return (
      <div
        key={slot.key}
        ref={(el) => {
          if (el) slotEls.current.set(slot.key, el)
          else slotEls.current.delete(slot.key)
        }}
        className={`screen-slot${active ? '' : leaving ? ' leaving' : ' covered'}`}
        inert={!active && !leaving}
        aria-hidden={leaving || undefined}
        {...(leaving ? SWALLOW_INPUT : {})}
      >
        <ScreenActiveContext.Provider value={active}>
          <RouteScreen route={slot.route} />
        </ScreenActiveContext.Provider>
      </div>
    )
  })
}

/**
 * Écran d'une route. Viseur, carte, amis, mes photos et profil : un seul `Home` qui reste monté de l'un à
 * l'autre (même place dans la pile, `screenStack.ts`) — la carte n'est pas rechargée, la barre reste en place.
 */
function RouteScreen({ route }: { route: Route }) {
  switch (route.name) {
    case 'carte':
    case 'amis':
    case 'photos':
    case 'profil':
      return <Home pane={route.name} />
    case 'cgu':
    case 'confidentialite':
      return <Legal privacy={route.name === 'confidentialite'} />
    case 'bloques':
      return <BlockedUsers />
    case 'supprimer-compte':
      return <DeleteAccount />
    case 'parametres':
      return <Settings />
    case 'ami':
      return <Invite key={route.code} code={route.code} />
    case 'chasses':
      return <Hunts />
    case 'proximite':
      return <Nearby />
    case 'recherche':
      return <Search filters={route.filters} />
    case 'photo':
      return <PhotoDetail key={route.id} id={route.id} section={route.section} />
    case 'chasse':
      return <Hunt key={route.id} id={route.id} />
    case 'recaler':
      return <Recaler key={route.id} id={route.id} />
    case 'galerie':
      return <Gallery key={route.id} id={route.id} />
    case 'reproduire':
      return <Reproduce key={route.id} id={route.id} />
    case 'personne':
      return <Person key={route.id} id={route.id} />
    case 'tutoriel':
      // Revu depuis les Paramètres : on revient là où on était (ou à la chasse de la photo la plus proche).
      return (
        <Tutorial
          account
          onExit={(exit) => (exit.to === 'chasse' ? navigate(`/chasse/${exit.id}`, { replace: true }) : goBack())}
        />
      )
    default:
      return <Home pane="viseur" />
  }
}
