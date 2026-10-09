/**
 * Croix de visée, fixe au centre de l'écran (viseur, chasse) : on vise la photo à capturer.
 * Jaune (`ready`) quand elle est sur une photo qui se capture d'ici, comme les croix alignées de
 * « Reproduire ». Calque sans interaction.
 */
export function AimCrosshair({ ready }: { ready: boolean }) {
  return (
    <div className={`aim-crosshair ${ready ? 'ready' : ''}`} aria-hidden="true">
      <svg viewBox="-16 -16 32 32" width="32" height="32">
        <path d="M-10 0H10M0-10V10" />
      </svg>
    </div>
  )
}
