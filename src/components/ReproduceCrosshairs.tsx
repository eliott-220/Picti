import { useEffect, useState } from 'react'
import type { ViewportCamera } from '../geo/optics'
import { basisFromAngles, frontCameraBasis, type CameraAngles } from '../geo/orientation'
import { reproduceOrientation } from '../geo/reproduceOrientation'
import type { OrientationState } from '../sensors/useOrientation'

/** Calque sans interaction ; démonté dès que la caméra est masquée par une feuille. */
export function ReproduceCrosshairs({ target, orientation, cam, selfie }: {
  target: CameraAngles
  orientation: OrientationState
  cam: ViewportCamera | null
  selfie: boolean
}) {
  const [clock, setClock] = useState(() => performance.now())
  const [visible, setVisible] = useState(() => !document.hidden)
  useEffect(() => {
    const timer = setInterval(() => setClock(performance.now()), 250)
    const onVisibility = () => {
      setVisible(!document.hidden)
      setClock(performance.now())
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [])
  const fresh = orientation.status === 'active' && orientation.absolute
    && clock - orientation.measuredAt < 1500
  const optical = (basis: OrientationState['basis']) => basis && (selfie ? frontCameraBasis(basis) : basis)
  const targetBasis = basisFromAngles(target)
  const measured = reproduceOrientation(targetBasis, fresh ? optical(orientation.measuredBasis) : null, cam, selfie)
  // Le hook lisse la base en 40 ms. Seule la position visuelle l'utilise ; statut et limites
  // viennent de la mesure non lissée, pour ne jamais rester « aligné » après un mouvement.
  const visual = reproduceOrientation(targetBasis, fresh ? optical(orientation.basis) : null, cam, selfie)
  if (!visible || !cam) return null
  const moving = measured.kind === 'visible' || measured.kind === 'edge'
  const point = visual.kind === measured.kind ? visual : measured
  const x = measured.aligned ? cam.width / 2 : point.x
  const y = measured.aligned ? cam.height / 2 : point.y
  return (
    <div className={`reproduce-crosshairs ${measured.aligned ? 'aligned' : ''}`} data-state={measured.kind}>
      <svg width={cam.width} height={cam.height} aria-hidden="true">
        <g className="cross-fixed" transform={`translate(${cam.width / 2} ${cam.height / 2})`}>
          <path d="M-10 0H10M0-10V10" />
          <circle cy="-14" r="1" />
        </g>
        {moving && (
          <g className="cross-target" transform={`translate(${x} ${y})`}>
            {measured.kind === 'edge' ? (
              <path transform={`rotate(${measured.direction})`} d="M-6 3L0-5L6 3M0-5V10" />
            ) : (
              <g transform={`rotate(${measured.aligned ? 0 : point.roll})`}>
                <path d="M-10 0H10M0-10V10" />
                <circle cy="-14" r="1" />
              </g>
            )}
          </g>
        )}
      </svg>
      <p className="cross-message" role="status">{measured.message}</p>
    </div>
  )
}
