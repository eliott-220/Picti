import { EmptyState, PhotoTile, RoundButton } from '../components/ui'
import { useStore } from '../data/storeContext'
import { formatDate, isGeoframed, type Capture } from '../data/types'
import { goBack, navigate } from '../router'

/** « Mes chasses » : proies suivies et photos capturées in situ. */
export function Hunts() {
  const { photos, captures } = useStore()
  const byId = new Map(photos.map((p) => [p.id, p]))
  // Une capture par photo : la plus récente.
  const seen = new Set<string>()
  const captured: Capture[] = []
  for (const c of captures) {
    if (!byId.has(c.photoId) || seen.has(c.photoId)) continue
    seen.add(c.photoId)
    captured.push(c)
  }
  const toHunt = photos.filter((p) => isGeoframed(p) && !seen.has(p.id))

  return (
    <main className="screen page">
      <header className="card red page-header">
        <RoundButton icon="back" label="Retour" onClick={goBack} className="back-btn" />
        <h1 className="display">
          Mes
          <br />
          chasses
        </h1>
      </header>

      <section className="card salmon">
        <h2 className="section-title">Mes proies</h2>
        <EmptyState icon="user">
          Suivez vos amis pour chasser leurs photos : le partage entre comptes PICTI arrive dans une prochaine version.
        </EmptyState>
      </section>

      <section className="card white">
        <h2 className="section-title">
          Mes {captured.length} capture{captured.length > 1 ? 's' : ''}
        </h2>
        {captured.length ? (
          <div className="grid">
            {captured.map((c) => (
              <PhotoTile
                key={c.id}
                id={c.photoId}
                caption={formatDate(c.capturedAt)}
                onClick={() => navigate(`/photo/${c.photoId}`)}
              />
            ))}
          </div>
        ) : (
          <EmptyState icon="flag">
            Rendez-vous sur le lieu d’une photo géocadrée et alignez-vous sur son point de vue pour la capturer.
          </EmptyState>
        )}

        {toHunt.length > 0 && (
          <>
            <h2 className="section-title">À retrouver in situ ({toHunt.length})</h2>
            <div className="grid">
              {toHunt.map((p) => (
                <PhotoTile key={p.id} id={p.id} caption={p.title} onClick={() => navigate(`/chasse/${p.id}`)} />
              ))}
            </div>
          </>
        )}
      </section>
    </main>
  )
}
