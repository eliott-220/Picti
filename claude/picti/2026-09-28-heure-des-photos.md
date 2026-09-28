# 2026-09-28 — Heure des photos (0.008.2)

Projet : [PICTI](../../CLAUDE.md) · Dépôt `eliott-220/picti` · Branche `claude/beautiful-edison-87l36d`
(suite de [Numéro de version x.xxx.x](2026-09-28-numero-de-version.md))

## Demande

« Rajoute l'heure sur les infos des photos que l'on voit avec la date. »

## Réalisé

- `src/data/types.ts` : `formatTime` (« 17:05 »), `formatDateTime` (« 28 septembre 2026 à
  17:05 », ou court « 28 sept. 2026 · 17:05 »), `photoDate` (sous le titre ; seulement
  « à 17:05 » si le titre est déjà la date), `photoTitleAndDate`. Tests : `src/data/dates.test.ts`.
- Heure ajoutée partout où la date d'une photo s'affiche : détail (sous le titre), chasse
  (bandeau du haut), frise des photos d'un même endroit (viseur, chasse), fiche de la carte,
  « Mes chasses » (date et heure de capture).
- Les titres automatiques restent la date seule (« 28 septembre 2026 »).
- Version **0.008.2**.

## Vérifications

- `npm test` (67 verts), `npm run lint`, `npm run build` : OK.
