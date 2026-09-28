import { useMemo, useState } from 'react'
import { viewportCamera, type GeoframedPhoto } from '../components/arProjection'
import { ArSpotsLayer } from '../components/ArSpotsLayer'
import { Icon } from '../components/Icon'
import { SensorStatus } from '../components/SensorStatus'
import { useElementSize } from '../components/useElementSize'
import { RoundButton } from '../components/ui'
import { useToast } from '../components/toastContext'
import { createDirectPhoto } from '../data/pipeline'
import { useStore } from '../data/storeContext'
import { isGeoframed } from '../data/types'
import { useNearbyRefresh } from '../data/useNearbyRefresh'
import { navigate } from '../router'
import { useCamera } from '../sensors/useCamera'
import { useGeolocation } from '../sensors/useGeolocation'
import { useOrientation } from '../sensors/useOrientation'
import { ImportSheet } from './ImportSheet'
import { MenuSheet } from './MenuSheet'

/** Accueil : le viseur, point de départ du géocadrage en direct. */
export function Home() {
  const [sheet, setSheet] = useState<'import' | 'menu' | null>(null)
  const [flash, setFlash] = useState(false)
  const [busy, setBusy] = useState(false)
  const { videoRef, status: cameraStatus, error: cameraError, size: cameraSize, capture } = useCamera()
  const [stageRef, stage] = useElementSize<HTMLElement>()
  const geo = useGeolocation()
  const orientation = useOrientation()
  const { addPhoto, nearby, captures, isMine, photos } = useStore()
  const toast = useToast()
  useNearbyRefresh(geo.fix)

  // Photos d'autres utilisateurs à chasser autour de soi.
  const captured = new Set(captures.map((c) => c.photoId))
  const toHunt = photos.filter((p) => nearby.has(p.id) && !isMine(p) && !captured.has(p.id)).length
  const arPhotos = useMemo(
    () => photos.filter((p): p is GeoframedPhoto => nearby.has(p.id) && isGeoframed(p)),
    [photos, nearby],
  )

  async function shoot() {
    if (busy) return
    if (orientation.status === 'needs-permission') {
      // iOS : l'accès à la boussole ne peut être demandé que sur un geste.
      const granted = await orientation.requestPermission()
      toast(granted ? 'Boussole activée : vous pouvez géocadrer' : 'Sans boussole, vos photos seront à géocadrer sur place')
      if (granted) return
    }
    if (cameraStatus !== 'ready') {
      toast(cameraError ?? 'La caméra démarre…')
      return
    }
    setBusy(true)
    setFlash(true)
    setTimeout(() => setFlash(false), 160)
    try {
      const frame = await capture()
      const { photo, images } = await createDirectPhoto(frame, {
        fix: geo.fix,
        angles: orientation.angles,
        absolute: orientation.absolute,
      })
      await addPhoto(photo, images)
      navigator.vibrate?.(30)
      if (photo.geoframe) {
        toast('Photo géocadrée et publiée', { label: 'Voir', to: `/photo/${photo.id}` })
      } else {
        const missing = !geo.fix ? 'position GPS' : 'boussole'
        toast(`Photo gardée sans ${missing} : à géocadrer sur place`, { label: 'Voir', to: `/photo/${photo.id}` })
      }
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Capture impossible')
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="screen viewfinder" ref={stageRef}>
      {/* Monde en noir et blanc : seules les photos géocadrées gardent leur couleur. */}
      <video ref={videoRef} className="camera-video mono" playsInline muted autoPlay />
      {cameraStatus === 'error' && (
        <div className="camera-fallback">
          <Icon name="image" size={40} />
          <p>{cameraError}</p>
        </div>
      )}
      {!sheet && (
        <ArSpotsLayer
          photos={arPhotos}
          fix={geo.fix}
          basis={orientation.absolute ? orientation.basis : null}
          cam={viewportCamera(stage, cameraSize)}
          isMine={isMine}
          onOpen={(p) => navigate(`/chasse/${p.id}`)}
        />
      )}
      {flash && <div className="flash" />}

      <SensorStatus geo={geo} orientation={orientation} />

      <nav className="rail" aria-label="Explorer">
        <RoundButton
          icon="pin"
          label="Carte des photos"
          onClick={() => navigate('/carte')}
          dim={!!sheet}
          badge={toHunt}
        />
        <RoundButton icon="filter" label="Filtrer" onClick={() => navigate('/recherche?filtres')} dim={!!sheet} />
        <RoundButton icon="search" label="Rechercher" onClick={() => navigate('/recherche')} dim={!!sheet} />
      </nav>

      <div className="bottom-bar">
        <RoundButton icon="plus" label="Géocadrer en différé (importer)" onClick={() => setSheet('import')} />
        <button
          type="button"
          className="shutter"
          onClick={shoot}
          disabled={busy}
          aria-label="Géocadrer en direct (prendre une photo)"
        >
          <Icon name="scan" size={40} />
        </button>
        <RoundButton icon="grid" label="Menu" onClick={() => setSheet('menu')} />
      </div>

      {sheet === 'import' && <ImportSheet onClose={() => setSheet(null)} fix={geo.fix} />}
      {sheet === 'menu' && <MenuSheet onClose={() => setSheet(null)} />}
    </main>
  )
}
