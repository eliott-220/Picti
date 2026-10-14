import { opensOnRelease, SLOP, swipeIntent } from './swipeOpen'

/** Même verrouillage d'axe que les onglets : un geste appartient à un seul écran. */
export function explorerIntent(dx: number, dy: number, open: boolean): 'vertical' | 'other' | null {
  if (Math.hypot(dx, dy) < SLOP) return null
  if (swipeIntent(dx, dy, ['left', 'right']) !== 'other') return 'other'
  return (open ? dy > 0 : dy < 0) ? 'vertical' : 'other'
}

export function explorerProgress(dy: number, travel: number, open: boolean): number {
  return Math.max(0, Math.min(1, (open ? 1 : 0) - dy / Math.max(1, travel)))
}

export function explorerCommits(dy: number, speed: number, travel: number, open: boolean): boolean {
  return opensOnRelease(dy, open ? speed : -speed, travel, open ? 'right' : 'left')
}

/** Les contrôles gardent leur geste ; Explorer se ferme depuis le haut de sa feuille. */
export function explorerTargetAllowed(target: EventTarget | null, open: boolean): boolean {
  if (!(target instanceof Element)) return false
  if (target.closest('button, a, input, select, textarea, [role="slider"], .bottom-nav, .home-timeline, .timeline-mini, .zoom-lenses, .shell-pane, .explorer-grid')) return false
  const sheet = target.closest<HTMLElement>('.sheet')
  if (open) return !!target.closest('.explorer') && (!sheet || sheet.scrollTop <= 0)
  return !target.closest('[role="dialog"], [role="alertdialog"]')
}
