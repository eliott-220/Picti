import { lazy, Suspense, useEffect } from 'react'
import { Logo } from './components/Icon'
import { usePasswordRecovery, useSession } from './data/auth'
import { takePendingInvite } from './data/invite'
import { ArShotRefiner } from './components/ArShotRefiner'
import { StoreProvider } from './data/store'
import { useStore } from './data/storeContext'
import { supabase } from './data/supabase'
import { navigate, useRoute } from './router'
import { Auth } from './screens/Auth'
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

// La carte (MapLibre) est lourde : chargée seulement à l'ouverture.
const WorldMap = lazy(() => import('./screens/WorldMap'))

export default function App() {
  const session = useSession()
  const [recovery, endRecovery] = usePasswordRecovery()
  if (session === undefined) return <Splash />
  // Un compte est obligatoire pour utiliser PICTI.
  if (!session) return <Auth />
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
    default:
      return <Home />
  }
}
