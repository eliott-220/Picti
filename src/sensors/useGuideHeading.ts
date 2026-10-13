import { useEffect, useState } from 'react'
import { deviceHeading } from '../geo/guidance'
import type { CameraBasis } from '../geo/orientation'
import { currentView, onArPose, useArState } from './arTracking'
import { useOrientation, type OrientationStatus } from './useOrientation'

export interface GuideHeading {
  /** Cap du téléphone tel qu'on le tient (°), null sans cap fiable (flèches nord en haut). */
  heading: number | null
  /** D'où il vient : suivi visuel d'ARKit, boussole + gyroscope, ou rien. */
  source: 'ar' | 'compass' | null
  status: OrientationStatus
  /** iPhone (navigateur, ou app sans accès accordé) : l'accès à la boussole se demande sur un geste. */
  requestPermission(): Promise<boolean>
}

/**
 * Cap pour les flèches de guidage (0.24.0, « À proximité ») : la même source que le viseur — l'orientation
 * calée du suivi visuel d'ARKit tant que sa session tourne (app iOS, gardée un moment après le viseur), sinon
 * le gyroscope recalé sur la boussole, avec le nord partagé par tous les écrans (`useOrientation`). Le cap
 * est celui du téléphone tel qu'on le tient, à plat comme debout (`deviceHeading`).
 */
export function useGuideHeading(): GuideHeading {
  const orientation = useOrientation()
  const ar = useArState()
  const [arBasis, setArBasis] = useState<CameraBasis | null>(null)
  const arRunning = ar.status === 'running'

  useEffect(() => {
    if (!arRunning) return
    let frame = 0
    const tick = () => {
      if (!frame)
        frame = requestAnimationFrame(() => {
          frame = 0
          setArBasis(currentView().basis)
        })
    }
    tick()
    const off = onArPose(tick)
    return () => {
      off()
      cancelAnimationFrame(frame)
    }
  }, [arRunning])

  const compass = orientation.absolute && orientation.basis ? deviceHeading(orientation.basis) : null
  const fromAr = arRunning && arBasis ? deviceHeading(arBasis) : null
  const heading = fromAr ?? compass
  return {
    heading,
    source: fromAr != null ? 'ar' : compass != null ? 'compass' : null,
    status: orientation.status,
    requestPermission: orientation.requestPermission,
  }
}
