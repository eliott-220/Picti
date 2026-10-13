import { useSyncExternalStore } from 'react'
import { answerPublicNotice, onPublicNotice, publicNoticePending } from '../data/publicPhotoNotice'
import { Icon } from './Icon'
import { Sheet } from './ui'

/** Feuille de la première photo publique (0.24.0) ; voir `data/publicPhotoNotice.ts`. */
export function PublicPhotoNotice() {
  const open = useSyncExternalStore(onPublicNotice, publicNoticePending)
  if (!open) return null
  return (
    <Sheet onClose={() => answerPublicNotice('amis')} label="Ta première photo publique" className="above-panes">
      <div className="shot-sheet public-notice">
        <Icon name="globe" size={28} />
        <h2>Ta première photo publique</h2>
        <p>
          Les photos publiques sont visibles par tout le monde, à l’endroit exact où tu les as prises. Évite ton
          domicile, les visages et les plaques.
        </p>
        <button type="button" className="btn" onClick={() => answerPublicNotice('public')}>
          Compris
        </button>
        <button type="button" className="btn ghost" onClick={() => answerPublicNotice('amis')}>
          Passer en Amis
        </button>
      </div>
    </Sheet>
  )
}
