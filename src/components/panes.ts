// Les cinq écrans de la barre du bas (0.23.1), côte à côte dans l'ordre de la barre :
// [ Carte ] [ Amis ] [ Viseur ] [ Mes photos ] [ Profil ]. Glisser le doigt mène à l'écran voisin.
// Le viseur ne bouge jamais : les autres écrans glissent par-dessus lui (ceux des bords par-dessus
// ceux du milieu), comme des feuilles posées de chaque côté. Entre deux écrans qui ne sont pas le
// viseur (0.23.3), le nouveau pousse l'ancien : les deux glissent ensemble, collés l'un à l'autre.

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
  /** Écran visible sous celui qui glisse (avant d'arriver, ou découvert en repartant) ; poussé s'il y a `push`. */
  under: Pane
  /** Écran affiché à la fin. */
  to: Pane
  /**
   * Entre deux écrans qui ne sont pas le viseur (0.23.3) : `pane` arrive en poussant `under`, les deux
   * glissent ensemble dans le sens de la barre (`pushOffsets`).
   */
  push: boolean
}

/**
 * Depuis le viseur, le nouvel écran arrive par-dessus lui ; vers le viseur, l'écran actuel repart et le
 * découvre (comme avant la 0.23.3). Entre deux autres écrans, le nouveau pousse l'ancien.
 */
export function paneMove(from: Pane, to: Pane): PaneMove | null {
  if (from === to) return null
  if (to === 'viseur') return { pane: from as SidePane, arriving: false, under: to, to, push: false }
  return { pane: to as SidePane, arriving: true, under: from, to, push: from !== 'viseur' }
}

/**
 * Translations (%) des deux écrans d'une poussée de `from` vers `to`, `shown` de 0 (départ) à 1 (`to` en
 * place) : vers la droite de la barre, `to` arrive par la droite et pousse `from` vers la gauche ; l'inverse
 * vers la gauche. Toujours collés : `to − from` vaut ±100.
 */
export function pushOffsets(from: SidePane, to: SidePane, shown: number): { from: number; to: number } {
  const s = Math.min(1, Math.max(0, shown))
  const dir = Math.sign(indexOf(to) - indexOf(from))
  return { from: -dir * s * 100 + 0, to: dir * (1 - s) * 100 + 0 }
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

/** Place de chaque écran dans la barre (0 Carte … 2 bouton rouge … 4 Profil) : celle de la bulle (0.24.0). */
export const tabSlot = (p: Pane) => indexOf(p)

/**
 * Bulle de l'onglet actif (0.24.0) : sa place dans la barre (`--tab`, de 0 à 4 ; 2 = le bouton rouge, où
 * elle n'est pas visible) pendant un mouvement, `shown` comme pour l'écran qui glisse — elle va de l'écran
 * de départ à celui d'arrivée en suivant le doigt, et revient si le geste est annulé.
 */
export function tabOf(move: PaneMove, shown: number): number {
  const s = Math.min(1, Math.max(0, shown))
  const [from, to] = move.arriving ? [move.under, move.pane] : [move.pane, move.under]
  const progress = move.arriving ? s : 1 - s
  return indexOf(from) + (indexOf(to) - indexOf(from)) * progress + 0
}

/**
 * Teinte rouge d'un onglet (0 neutre → 1 rouge PICTI) quand la bulle est à la place `tab` : l'icône active
 * prend la couleur, qui passe de l'ancienne à la nouvelle pendant le glissement (même formule que le CSS).
 */
export function tabTint(slot: number, tab: number): number {
  return Math.min(1, Math.max(0, 1 - Math.abs(tab - slot)))
}

/**
 * Opacité de la bulle : nulle au bouton rouge (le rond rouge montre le viseur), pleine à une place d'onglet ;
 * `away` : éloignement du viseur (la bulle naît de l'appareil photo en quittant le viseur).
 */
export function bubbleAlpha(tab: number, away: number): number {
  return Math.min(Math.max(0, Math.min(1, away)), Math.min(1, Math.abs(tab - CENTER)))
}
