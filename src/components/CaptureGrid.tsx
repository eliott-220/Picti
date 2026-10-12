import { useState } from 'react'
import { useStore } from '../data/storeContext'
import { formatDateTime, ofName, type Capture, type GeoPhoto } from '../data/types'
import { navigate } from '../router'
import { Icon } from './Icon'
import { useToast } from './toastContext'
import { PhotoTile, Sheet } from './ui'
import { useLongPress } from './useLongPress'

/**
 * « Retirer cette capture ? » (0.23.0) : ma ligne de `captures` est supprimée, la photo repasse en noir
 * et blanc et redevient à chasser. Mes reproductions déjà faites restent (ce sont mes photos).
 */
export function RemoveCaptureSheet({ photo, onClose, onDone }: { photo: GeoPhoto; onClose: () => void; onDone?: () => void }) {
  const { removeCapture } = useStore()
  const toast = useToast()
  const [busy, setBusy] = useState(false)
  async function remove() {
    setBusy(true)
    try {
      await removeCapture(photo.id)
      toast('Capture retirée : la photo est de nouveau à chasser')
      onDone?.()
      onClose()
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Impossible de retirer la capture')
      setBusy(false)
    }
  }
  return (
    <Sheet onClose={onClose} label="Retirer la capture" className="above-panes">
      <div className="shot-sheet">
        <Icon name="flag" size={28} />
        <p>
          <strong>Retirer cette capture ?</strong> La photo repassera en noir et blanc et tu pourras la chasser à nouveau.
        </p>
        <button type="button" className="btn danger" onClick={() => void remove()} disabled={busy}>
          {busy ? 'Un instant…' : 'Retirer'}
        </button>
        <button type="button" className="btn ghost" onClick={onClose} disabled={busy}>
          Annuler
        </button>
      </div>
    </Sheet>
  )
}

/** Une capture de la grille : appui = fiche, appui long = « Retirer de mes captures » (photo d'un autre). */
function CaptureItem({ capture, photo, onRemove }: { capture: Capture; photo: GeoPhoto; onRemove: (() => void) | null }) {
  const { isMine } = useStore()
  const longPress = useLongPress(onRemove)
  return (
    <div className="grid-item" {...longPress}>
      <PhotoTile
        id={capture.photoId}
        caption={formatDateTime(capture.capturedAt, { short: true })}
        label={`Capture ${isMine(photo) ? 'de ma photo' : `de la photo ${ofName(photo.ownerName || 'quelqu’un')}`} : voir sa fiche${onRemove ? ' (appui long : retirer de mes captures)' : ''}`}
        onClick={() => navigate(`/photo/${capture.photoId}`)}
      />
      {/* L'auteur, à part : appui = son profil public. */}
      {isMine(photo) ? (
        <span className="tile-author">Ma photo</span>
      ) : (
        <button type="button" className="tile-author name-link" onClick={() => navigate(`/personne/${photo.owner}`)}>
          {photo.ownerName || 'Quelqu’un'}
        </button>
      )}
    </div>
  )
}

/** Mes captures (Mon profil, Mes chasses) : appui long sur la photo d'un autre pour la retirer. */
export function CaptureGrid({ captures }: { captures: { capture: Capture; photo: GeoPhoto }[] }) {
  const { isMine } = useStore()
  const [removing, setRemoving] = useState<GeoPhoto | null>(null)
  return (
    <>
      <div className="grid">
        {captures.map(({ capture, photo }) => (
          <CaptureItem
            key={capture.id}
            capture={capture}
            photo={photo}
            onRemove={isMine(photo) ? null : () => setRemoving(photo)}
          />
        ))}
      </div>
      {removing && <RemoveCaptureSheet photo={removing} onClose={() => setRemoving(null)} />}
    </>
  )
}
