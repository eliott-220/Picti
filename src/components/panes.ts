// Les cinq écrans de la barre du bas (0.23.1), côte à côte dans l'ordre de la barre :
// [ Carte ] [ Amis ] [ Viseur ] [ Mes photos ] [ Profil ]. Glisser le doigt mène à l'écran voisin.
// Le viseur ne bouge jamais : les autres écrans glissent par-dessus lui (ceux des bords par-dessus
// ceux du milieu), comme des feuilles posées de chaque côté.

import type { SwipeDirection } from './swipeOpen'

export const PANES = ['carte', 'amis', 'viseur', 'photos', 'profil'] as const
export type Pane = (typeof PANES)[number]
/** Écrans qui glissent (tous sauf le viseur). */
export type SidePane = Exclude<Pane, 'viseur'>

const CENTER = PANES.indexOf('viseur')
const indexOf = (p: Pane) => PANES.indexOf(p)
/** −1 à gauche du viseur, +1 à droite, 0 le viseur. */
export const sideOf = (p: Pane) => Math.sign(indexOf(p) - CENTER)
/** Éloignement du viseur (0 le viseur, 1 les voisins, 2 les bords). */
export const distanceOf = (p: Pane) => Math.abs(indexOf(p) - CENTER)

/**
 * Écran voisin quand le doigt glisse dans le sens `dir` : vers la gauche, celui de droite arrive ; vers la
 * droite, celui de gauche. Null au bout de la rangée.
 */
export function neighborPane(pane: Pane, dir: SwipeDirection): Pane | null {
  const i = indexOf(pane) + (dir === 'left' ? 1 : -1)
  return i >= 0 && i < PANES.length ? PANES[i] : null
}

/** Mouvement d'un écran à l'autre : l'écran qui glisse, s'il arrive ou s'il repart, et celui qu'on voit dessous. */
export interface PaneMove {
  /** Écran qui glisse. */
  pane: SidePane
  /** Vrai : il arrive par son côté, par-dessus ; faux : il repart vers son côté et découvre `under`. */
  arriving: boolean
  /** Écran visible sous celui qui glisse (avant d'arriver, ou découvert en repartant). */
  under: Pane
  /** Écran affiché à la fin. */
  to: Pane
}

/**
 * Vers le viseur, ou vers un écran plus proche du viseur du même côté : l'écran actuel repart et découvre
 * le suivant ; sinon (plus loin, ou de l'autre côté), le suivant arrive par-dessus.
 */
export function paneMove(from: Pane, to: Pane): PaneMove | null {
  if (from === to) return null
  const backward = to === 'viseur' || (sideOf(to) === sideOf(from) && distanceOf(to) < distanceOf(from))
  if (backward && from !== 'viseur') return { pane: from, arriving: false, under: to, to }
  return { pane: to as SidePane, arriving: true, under: from, to }
}

/** Translation (%) d'un écran qui glisse, `shown` de 0 (caché sur son côté) à 1 (en place). */
export function paneOffset(pane: SidePane, shown: number): number {
  return (1 - Math.min(1, Math.max(0, shown))) * 100 * sideOf(pane)
}

/**
 * Réduction du bouton rouge (`--away`, 0 sur le viseur) : quand l'écran qui glisse couvre le viseur, elle
 * suit sa part affichée `shown` (il arrive : 0 → 1 ; il repart : 1 → 0) ; entre deux autres écrans, 1.
 */
export function awayOf(move: PaneMove, shown: number): number {
  return move.under === 'viseur' ? Math.min(1, Math.max(0, shown)) : 1
}
