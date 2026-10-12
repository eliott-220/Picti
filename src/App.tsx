import { lazy, Suspense, useEffect, useState } from 'react'
import { Logo } from './components/Icon'
import { usePasswordRecovery, useSession } from './data/auth'
import { takePendingInvite } from './data/invite'
import { loadOnboardingDone, markOnboardingDone, onboardingDoneNow } from './data/onboarding'
import { ArShotRefiner } from './components/ArShotRefiner'
import { StoreProvider } from './data/store'
import { useStore } from './data/storeContext'
import { authLinkError, supabase } from './data/supabase'
import { isNative } from './native'
import { goBack, navigate, useRoute } from './router'
import { Auth, type AuthMode } from './screens/Auth'
import { Gallery } from './screens/Gallery'
import { Home } from './screens/Home'
import { Hunt } from './screens/Hunt'
import { Hunts } from './screens/Hunts'
import { Invite } from './screens/Invite'
import { Nearby } from './screens/Nearby'
import { NewPassword } from './screens/NewPassword'
import { Notifications } from './screens/Notifications'
import { Person } from './screens/Person'
import { PhotoDetail } from './screens/PhotoDetail'
import { Profile } from './screens/Profile'
import { Recaler } from './screens/Recaler'
import { Reproduce } from './screens/Reproduce'
import { Search } from './screens/Search'
import { Tutorial } from './screens/Tutorial'

// La carte (MapLibre) est lourde : chargée seulement à l'ouverture.
const WorldMap = lazy(() => import('./screens/WorldMap'))

/**
 * Tutoriel du premier lancement (0.22.0) : `pending` tant que le drapeau de l'app n'est pas lu.
 * Pas de tutoriel par-dessus un lien de l'e-mail expiré : on est déjà en pleine inscription.
 */
function initialTutorial(): 'pending' | 'show' | 'done' {
  if (onboardingDoneNow() || authLinkError) return 'done'
  return isNative() ? 'pending' : 'show'
}

export default function App() {
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
      <Screens />
      <ArShotRefiner />
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

function Screens() {
  const route = useRoute()
  const { ready, error } = useStore()

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

  switch (route.name) {
    case 'profil':
      return <Profile section={route.section} />
    case 'ami':
      return <Invite key={route.code} code={route.code} />
    case 'chasses':
      return <Hunts />
    case 'proximite':
      return <Nearby />
    case 'carte':
      return (
        <Suspense fallback={<Splash message="Chargement de la carte…" />}>
          <WorldMap />
        </Suspense>
      )
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
    case 'notifications':
      return <Notifications />
    case 'reproduire':
      return <Reproduce key={route.id} id={route.id} />
    case 'personne':
      return <Person key={route.id} id={route.id} />
    case 'tutoriel':
      // Revu depuis le menu : on revient là où on était (ou à la chasse de la photo la plus proche).
      return (
        <Tutorial
          account
          onExit={(exit) => (exit.to === 'chasse' ? navigate(`/chasse/${exit.id}`, { replace: true }) : goBack())}
        />
      )
    default:
      return <Home />
  }
}
