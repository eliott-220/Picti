import { RoundButton } from '../components/ui'
import { usePhoto } from '../data/usePhoto'
import { isGeoframed } from '../data/types'
import { goBack } from '../router'
import { Home } from './Home'

/** « Reproduire cette photo » : le viseur, avec l'originale en calque pour retrouver son cadrage. */
export function Reproduce({ id }: { id: string }) {
  const { photo, loading } = usePhoto(id)
  if (!photo || !isGeoframed(photo)) {
    return (
      <main className="screen page missing">
        <RoundButton icon="back" label="Retour" onClick={goBack} className="back-btn" />
        <p>
          {loading
            ? 'Chargement…'
            : photo
              ? 'Cette photo n’est pas géocadrée : impossible de la reproduire.'
              : 'Cette photo n’existe plus ou ne vous est pas accessible.'}
        </p>
      </main>
    )
  }
  return <Home reproduce={photo} />
}
