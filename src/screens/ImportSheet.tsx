import { useRef, useState } from 'react'
import { Icon } from '../components/Icon'
import { EmptyState, PhotoTile, Sheet } from '../components/ui'
import { importPhotoFile } from '../data/pipeline'
import { PremiumCard } from '../components/PremiumCard'
import { VisibilityPill } from '../components/VisibilityPill'
import { canUseDiffere } from '../data/premium'
import { setShotVisibility, useShotVisibility } from '../data/shotVisibility'
import { useStore } from '../data/storeContext'
import { isGeoframed, VISIBLE_BY } from '../data/types'
import { distanceMeters, formatDistance, type GeoFix } from '../geo/geodesy'
import { navigate } from '../router'

interface Summary {
  auto: number
  pending: number
  failed: number
}

function plural(n: number, word: string) {
  return `${n} ${word}${n > 1 ? 's' : ''}`
}

/**
 * Géocadrage en différé : import de photos existantes. Celles qui portent
 * position et direction (smartphone) sont géocadrées aussitôt ; les autres
 * attendent d'être recalées sur le lieu de la prise de vue.
 */
export function ImportSheet({ onClose, fix }: { onClose: () => void; fix: GeoFix | null }) {
  const { myPhotos, addPhoto, profile } = useStore()
  const allowed = canUseDiffere(profile)
  // Même choix que la pastille du viseur, appliqué à tout le lot importé.
  const visibility = useShotVisibility(profile?.defaultVisibility ?? 'amis')
  const input = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [summary, setSummary] = useState<Summary | null>(null)

  async function onFiles(files: FileList | null) {
    if (!files?.length) return
    setBusy(true)
    const s: Summary = { auto: 0, pending: 0, failed: 0 }
    for (const file of Array.from(files)) {
      try {
        const r = await importPhotoFile(file)
        await addPhoto(r.photo, r.images, visibility)
        if (r.completeness === 'complet') s.auto++
        else s.pending++
      } catch {
        s.failed++
      }
    }
    setSummary(s)
    setBusy(false)
    if (input.current) input.current.value = ''
  }

  const pending = myPhotos.filter((p) => !isGeoframed(p))
  const located = pending
    .filter((p) => p.hintPosition)
    .map((p) => ({ p, d: fix ? distanceMeters(fix, p.hintPosition!) : null }))
    .sort((a, b) => (a.d ?? Infinity) - (b.d ?? Infinity))
  const others = pending.filter((p) => !p.hintPosition)

  return (
    <Sheet onClose={onClose} label="Géocadrer en différé">
      {!allowed && <PremiumCard reason="Géocadrage en différé : PICTI Premium" />}
      <div className="sheet-head">
        <button type="button" className="import-btn" onClick={() => input.current?.click()} disabled={busy || !allowed}>
          <Icon name={busy ? 'image' : 'plus'} />
          {busy ? 'Analyse des photos…' : 'Importer des photos'}
        </button>
        <button type="button" className="icon-btn" onClick={onClose} aria-label="Fermer">
          <Icon name="close" />
        </button>
        <input
          ref={input}
          type="file"
          accept="image/*"
          multiple
          hidden
          onChange={(e) => void onFiles(e.target.files)}
        />
      </div>

      {allowed && (
        <div className="import-visibility">
          <span>
            Photos importées visibles par <strong>{VISIBLE_BY[visibility]}</strong>
          </span>
          <VisibilityPill value={visibility} onChange={setShotVisibility} what="les photos importées" />
        </div>
      )}

      {summary && (
        <p className="import-summary">
          {summary.auto > 0 && <>{plural(summary.auto, 'photo géocadrée')} automatiquement. </>}
          {summary.pending > 0 && <>{plural(summary.pending, 'photo')} à recaler sur place. </>}
          {summary.failed > 0 && <>{plural(summary.failed, 'fichier')} illisible{summary.failed > 1 ? 's' : ''}.</>}
          {summary.auto > 0 && (
            <button type="button" className="link" onClick={() => navigate('/profil')}>
              Voir mes photos géocadrées
            </button>
          )}
        </p>
      )}

      <h2 className="section-title">Mes photos géolocalisées à proximité</h2>
      {located.length ? (
        <div className="strip">
          {located.map(({ p, d }) => (
            <PhotoTile
              key={p.id}
              id={p.id}
              size="strip"
              caption={d != null ? formatDistance(d) : p.title}
              onClick={() => navigate(`/recaler/${p.id}`)}
            />
          ))}
        </div>
      ) : (
        <EmptyState icon="pin">
          Les photos de smartphone sans direction apparaîtront ici : rendez-vous sur place pour les géocadrer.
        </EmptyState>
      )}

      <h2 className="section-title">Mes autres photos</h2>
      {others.length ? (
        <div className="strip">
          {others.map((p) => (
            <PhotoTile key={p.id} id={p.id} size="strip" caption={p.title} onClick={() => navigate(`/recaler/${p.id}`)} />
          ))}
        </div>
      ) : (
        <EmptyState icon="image">
          Photos d’appareil sans GPS : retrouvez le lieu exact de la prise de vue, superposez le cliché au décor, puis
          géocadrez-le.
        </EmptyState>
      )}
    </Sheet>
  )
}
