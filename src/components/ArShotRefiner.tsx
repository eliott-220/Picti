import { useEffect, useRef } from 'react'
import { useStore } from '../data/storeContext'
import { isGeoframed } from '../data/types'
import { forgetArShot, onArShotRefined } from '../sensors/arTracking'

/**
 * Récrit le géocadrage des photos prises pendant une session de suivi visuel quand le calage s'affine
 * (app iPhone, `trackArShot`). Monté une fois, avec le store ; n'affiche rien.
 */
export function ArShotRefiner() {
  const { photos, updatePhoto, isMine } = useStore()
  const latest = useRef({ photos, isMine })
  useEffect(() => {
    latest.current = { photos, isMine }
  })

  useEffect(
    () =>
      onArShotRefined((r) => {
        const photo = latest.current.photos.find((p) => p.id === r.id)
        if (!photo || !isGeoframed(photo) || !latest.current.isMine(photo)) {
          forgetArShot(r.id)
          return
        }
        const geoframe = {
          ...photo.geoframe,
          position: { lat: r.position.lat, lon: r.position.lon, alt: photo.geoframe.position.alt ?? null },
          accuracy: r.accuracy,
          heading: r.heading,
        }
        // Mise à jour discrète : en cas de refus (photo supprimée entre-temps…), on n'insiste pas.
        updatePhoto({ ...photo, geoframe }).catch(() => forgetArShot(r.id))
      }),
    [updatePhoto],
  )
  return null
}
