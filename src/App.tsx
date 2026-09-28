import { Logo } from './components/Icon'
import { useSession } from './data/auth'
import { StoreProvider } from './data/store'
import { useStore } from './data/storeContext'
import { supabase } from './data/supabase'
import { useRoute } from './router'
import { Auth } from './screens/Auth'
import { Home } from './screens/Home'
import { Hunt } from './screens/Hunt'
import { Hunts } from './screens/Hunts'
import { Nearby } from './screens/Nearby'
import { PhotoDetail } from './screens/PhotoDetail'
import { Profile } from './screens/Profile'
import { Recaler } from './screens/Recaler'
import { Search } from './screens/Search'

export default function App() {
  const session = useSession()
  if (session === undefined) return <Splash />
  // Un compte est obligatoire pour utiliser PICTI.
  if (!session) return <Auth />
  return (
    <StoreProvider key={session.user.id} userId={session.user.id}>
      <Screens />
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
      return <Profile />
    case 'chasses':
      return <Hunts />
    case 'proximite':
      return <Nearby />
    case 'recherche':
      return <Search filters={route.filters} />
    case 'photo':
      return <PhotoDetail key={route.id} id={route.id} />
    case 'chasse':
      return <Hunt key={route.id} id={route.id} />
    case 'recaler':
      return <Recaler key={route.id} id={route.id} />
    default:
      return <Home />
  }
}
