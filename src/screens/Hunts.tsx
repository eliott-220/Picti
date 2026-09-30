import { AvatarRow, EmptyState, PhotoTile, RoundButton } from '../components/ui'
import { useStore } from '../data/storeContext'
import { formatDateTime, isGeoframed } from '../data/types'
import { goBack, navigate } from '../router'

/** « Mes chasses » : mes proies (auteurs des photos retrouvées) et mes captures. */
export function Hunts() {
  const { photos, captures, nearby, isMine } = useStore()
  const byId = new Map(photos.map((p) => [p.id, p]))
  const captured = captures.filter((c) => byId.has(c.photoId))
  const capturedIds = new Set(captured.map((c) => c.photoId))

  // Mes proies : les autres utilisateurs dont j'ai retrouvé des photos.
  const prey = new Map<string, { id: string; name: string; count: number }>()
  for (const c of captured) {
    const p = byId.get(c.photoId)!
    if (isMine(p)) continue
    const entry = prey.get(p.owner) ?? { id: p.owner, name: p.ownerName, count: 0 }
    entry.count++
    prey.set(p.owner, entry)
  }
  const proies = [...prey.values()].map((p) => ({ ...p, detail: `${p.count} prise${p.count > 1 ? 's' : ''}` }))

  // À retrouver : photos à proximité (et les miennes) pas encore capturées.
  const toHunt = photos.filter(
    (p) => isGeoframed(p) && !capturedIds.has(p.id) && (nearby.has(p.id) || isMine(p)),
  )

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
        <h2 className="section-title">
          Mes proies ({proies.length})
        </h2>
        {proies.length ? (
          <AvatarRow people={proies} />
        ) : (
          <EmptyState icon="user">
            Retrouvez sur place les photos des autres utilisateurs : leurs auteurs deviendront vos proies.
          </EmptyState>
        )}
      </section>

      <section className="card white">
        <h2 className="section-title">
          Mes captures ({captured.length})
        </h2>
        {captured.length ? (
          <div className="grid">
            {captured.map((c) => {
              const p = byId.get(c.photoId)!
              return (
                <PhotoTile
                  key={c.id}
                  id={c.photoId}
                  caption={isMine(p) ? formatDateTime(c.capturedAt, { short: true }) : `${p.ownerName} · ${formatDateTime(c.capturedAt, { short: true })}`}
                  onClick={() => navigate(`/photo/${c.photoId}`)}
                />
              )
            })}
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
                <PhotoTile
                  key={p.id}
                  id={p.id}
                  caption={isMine(p) ? p.title : p.ownerName}
                  onClick={() => navigate(`/chasse/${p.id}`)}
                />
              ))}
            </div>
          </>
        )}
      </section>
    </main>
  )
}
