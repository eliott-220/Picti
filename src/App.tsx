import { Logo } from './components/Icon'
import { useStore } from './data/storeContext'
import { useRoute } from './router'
import { Home } from './screens/Home'
import { Hunt } from './screens/Hunt'
import { Hunts } from './screens/Hunts'
import { Nearby } from './screens/Nearby'
import { PhotoDetail } from './screens/PhotoDetail'
import { Profile } from './screens/Profile'
import { Recaler } from './screens/Recaler'
import { Search } from './screens/Search'
import { Welcome } from './screens/Welcome'

export default function App() {
  const route = useRoute()
  const { ready, profile, error } = useStore()

  if (!ready) {
    return (
      <div className="splash">
        <Logo size={72} />
      </div>
    )
  }
  if (error) {
    return (
      <div className="splash">
        <Logo size={56} />
        <p>{error}</p>
      </div>
    )
  }
  // Première connexion
  if (!profile) return <Welcome />

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
