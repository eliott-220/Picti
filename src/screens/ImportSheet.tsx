import { useRef, useState } from 'react'
import { Icon } from '../components/Icon'
import { EmptyState, IconButton, PhotoTile, Sheet } from '../components/ui'
import { failureReason, importLine, lineStatus, refuseFile, reportTitle, type ImportLine } from '../data/importReport'
import { importPhotoFile, type ImportResult } from '../data/pipeline'
import { PremiumCard } from '../components/PremiumCard'
import { VisibilityPill } from '../components/VisibilityPill'
import { canUseDiffere } from '../data/premium'
import { setShotVisibility, useShotVisibility } from '../data/shotVisibility'
import { useStore } from '../data/storeContext'
import { isGeoframed, VISIBLE_BY } from '../data/types'
import { distanceMeters, formatDistance, type GeoFix, type GeoPoint } from '../geo/geodesy'
import { navigate } from '../router'

/** Clé des lignes du bilan (uniques pendant la visite). */
let lineCount = 0

function plural(n: number, word: string) {
  return `${n} ${word}${n > 1 ? 's' : ''}`
}

/**
 * Géocadrage en différé : import de photos existantes (« + » de la carte depuis 0.23.0). Celles qui
 * portent position et direction (smartphone) sont géocadrées aussitôt ; les autres attendent d'être
 * recalées sur le lieu de la prise de vue. `placeAt` (centre de la carte) : celles qui n'ont pas de
 * position du tout peuvent y être posées (position approchée, comme une photo GPS sans direction).
 * Depuis 0.24.0, le bilan est une liste — une ligne par fichier : miniature, date de prise de vue, état
 * (Placée → fiche ; position trouvée / sans position → Recaler ; illisible + raison).
 */
export function ImportSheet({ onClose, fix, placeAt = null }: { onClose: () => void; fix: GeoFix | null; placeAt?: GeoPoint | null }) {
  const { myPhotos, addPhoto, profile } = useStore()
  const allowed = canUseDiffere(profile)
  // Même mode que le déclencheur du viseur, appliqué à tout le lot importé (et gardé s'il change ici).
  const visibility = useShotVisibility()
  const input = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [lines, setLines] = useState<ImportLine[]>([])
  // Photos lues sans aucune position : en attente de la réponse « les placer au centre de la carte ? ».
  const [unplaced, setUnplaced] = useState<ImportResult[]>([])

  async function onFiles(files: FileList | null) {
    if (!files?.length) return
    setBusy(true)
    const done: ImportLine[] = []
    const waiting: ImportResult[] = []
    for (const file of Array.from(files)) {
      const key = `l${++lineCount}`
      const refused = refuseFile(file)
      if (refused) {
        done.push({ key, id: null, title: file.name, state: 'failed', position: null, reason: refused })
        continue
      }
      try {
        const r = await importPhotoFile(file)
        if (placeAt && !r.photo.hintPosition && !r.photo.geoframe) {
          waiting.push(r)
          continue
        }
        await addPhoto(r.photo, r.images, { visibility })
        done.push(importLine(key, r.photo))
      } catch (e) {
        done.push({ key, id: null, title: file.name, state: 'failed', position: null, reason: failureReason(e) })
      }
    }
    setLines((was) => [...was, ...done])
    setUnplaced(waiting)
    setBusy(false)
    if (input.current) input.current.value = ''
  }

  /** Photos sans position : posées au centre de la carte (`at`), ou gardées sans position (à recaler). */
  async function keepUnplaced(at: GeoPoint | null) {
    const list = unplaced
    setUnplaced([])
    setBusy(true)
    const done: ImportLine[] = []
    for (const r of list) {
      const key = `l${++lineCount}`
      try {
        const photo = at ? { ...r.photo, hintPosition: { lat: at.lat, lon: at.lon, alt: null } } : r.photo
        await addPhoto(photo, r.images, { visibility })
        done.push(importLine(key, photo))
      } catch (e) {
        done.push({ key, id: null, title: r.photo.title, state: 'failed', position: null, reason: failureReason(e) })
      }
    }
    setLines((was) => [...was, ...done])
    setBusy(false)
  }

  // Fermée sans répondre : les photos sans position sont gardées sans position (rien n'est perdu).
  const close = () => {
    if (unplaced.length) void keepUnplaced(null)
    onClose()
  }

  const pending = myPhotos.filter((p) => !isGeoframed(p))
  const located = pending
    .filter((p) => p.hintPosition)
    .map((p) => ({ p, d: fix ? distanceMeters(fix, p.hintPosition!) : null }))
    .sort((a, b) => (a.d ?? Infinity) - (b.d ?? Infinity))
  const others = pending.filter((p) => !p.hintPosition)

  return (
    <Sheet onClose={close} label="Géocadrer en différé">
      {!allowed && <PremiumCard reason="Géocadrage en différé : PICTI Premium" />}
      <div className="sheet-head">
        <button type="button" className="import-btn" onClick={() => input.current?.click()} disabled={busy || !allowed}>
          <Icon name={busy ? 'image' : 'plus'} />
          {busy ? 'Analyse des photos…' : 'Importer des photos'}
        </button>
        <IconButton icon="close" label="Fermer" onClick={close} />
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

      {unplaced.length > 0 && placeAt && (
        <div className="import-place" role="group" aria-label="Photos sans position">
          <p>
            <strong>{plural(unplaced.length, 'photo')} sans position.</strong> La{unplaced.length > 1 ? 's' : ''} placer au centre de la
            carte ? Tu la{unplaced.length > 1 ? 's' : ''} géocadreras ensuite sur place.
          </p>
          <div className="import-place-actions">
            <button type="button" className="btn small" onClick={() => void keepUnplaced(placeAt)} disabled={busy}>
              <Icon name="pin" size={18} /> Placer ici
            </button>
            <button type="button" className="btn small ghost" onClick={() => void keepUnplaced(null)} disabled={busy}>
              Sans position
            </button>
          </div>
        </div>
      )}

      {lines.length > 0 && (
        <section className="import-report" aria-labelledby="bilan-import">
          <h2 className="section-title" id="bilan-import">
            {reportTitle(lines)}
          </h2>
          <ul>
            {lines.map((l) => (
              <li key={l.key} className={`import-line ${l.state}`}>
                {l.id ? (
                  <PhotoTile id={l.id} size="mini" label={l.title} onClick={() => navigate(`/photo/${l.id}`)} />
                ) : (
                  <span className="import-line-icon" aria-hidden="true">
                    <Icon name="warning" size={22} />
                  </span>
                )}
                <span className="import-line-text">
                  <strong>{l.title}</strong>
                  <span>
                    <i aria-hidden="true" />
                    {lineStatus(l, fix)}
                  </span>
                </span>
                {l.id && (l.state === 'located' || l.state === 'none') && (
                  <button type="button" className="btn small" onClick={() => navigate(`/recaler/${l.id}`)}>
                    Recaler
                  </button>
                )}
              </li>
            ))}
          </ul>
          {lines.some((l) => l.state === 'none') && (
            <p className="import-tip">
              Une photo de ton iPhone arrive sans position ? Dans le choix des photos, « … » › Options : « Lieu » doit être
              activé.
            </p>
          )}
        </section>
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
