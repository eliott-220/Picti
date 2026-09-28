# 2026-09-28 — Photos d'un même endroit empilées

Projet : [PICTI](../../CLAUDE.md) · Dépôt `eliott-220/picti` · Branche `claude/beautiful-edison-87l36d`
(suite de [Selfies géocadrés](2026-09-28-selfies.md))

## Demande

« Lorsque 2 photos sont prises au même endroit (quelques cm d'écart), superpose-les et c'est
à l'utilisateur de les faire défiler en les faisant swiper comme les profils sur Tinder ;
indiquer par des petits points le nombre de photos, comme sur Insta. Je viens d'en prendre 2
à l'instant et ça n'a pas marché. »

## Pourquoi ça ne marchait pas

- **Viseur** : il n'affichait que les photos renvoyées par la recherche « à proximité »
  (`nearby`), rafraîchie seulement après 50 m de déplacement ou 1 min. Deux photos qu'on
  vient de prendre n'y apparaissaient donc pas.
- **Viseur (bis)** : un lieu n'était représenté que par sa photo « du dessus » ; si elle
  n'était pas dans le champ, tout le lieu disparaissait, même si une autre photo du lieu
  était visée.
- **Carte** : deux photos au même point étaient regroupées jusqu'au zoom 19 puis séparées
  (« Zoomer ici » allait au zoom 20) : les deux vignettes se superposaient exactement et
  l'une cachait l'autre, sans compteur.
- **Mes photos** (profil) et **détail** : deux vignettes / pages séparées, sans lien.

## Réalisé

- `src/components/useCardSwipe.ts` : geste « Tinder » — la carte suit le doigt en
  s'inclinant, s'envole si on la lâche loin (80 px) ou vite, sinon revient. Gauche =
  suivante (plus ancienne), droite = précédente ; en boucle (`cycle` dans `src/geo/spots.ts`,
  testé). Un glissement n'ouvre pas la photo ; geste vertical laissé au défilement.
- `src/components/Dots.tsx` : points façon Instagram (fenêtre glissante au-delà de 7).
- `src/components/SwipeDeck.tsx` : pile de cartes (suivante dessous, qui grandit pendant le
  geste ; flèches du clavier).
- **Viseur** (`ArSpotsLayer`) : toutes les photos géocadrées connues (une nouvelle photo
  apparaît aussitôt) ; pile = photos du lieu visibles dans la direction visée, chacune à sa
  place dans le décor ; la photo du dessus se fait glisser, points sous la photo.
- **Détail** : en-tête = pile des photos du même endroit (`usePhotosHere`), glisser change de
  photo (adresse remplacée, pas d'empilement de l'historique), points en bas.
- **Carte** : photos regroupées par endroit avant le regroupement Supercluster (un endroit ne
  se sépare jamais) ; marqueur en pile + nombre de photos ; fiche = pile à faire glisser,
  « Chasser » vise la photo affichée.
- **Mes photos** : une vignette par endroit, en pile, avec points.
- **Chasse** : la frise affiche les points au lieu de « 1/2 ».
- `src/data/imageUrls.ts` : une image déjà chargée s'affiche dès le premier rendu (pas de
  clignement en changeant de photo dans la pile).

## Vérifications

- `npm test` (62 verts), `npm run lint`, `npm run build` : OK.
- Chromium (page de test isolée, 3 photos à 3 cm d'écart) : viseur → pile, 3 points ;
  glisser à gauche → photo 2, à droite → photo 1, glissement court → retour en place, appui →
  ouverture ; pile de la fiche carte, vignette empilée, en-tête du détail : OK.
- Pas testé sur un vrai téléphone.

## À faire

- Tester sur iPhone (geste sur la photo dans le viseur, carte, détail).
- Mettre en ligne sur https://picti.vercel.app.
