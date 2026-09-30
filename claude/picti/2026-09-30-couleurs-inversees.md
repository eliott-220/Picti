# Couleurs inversées : la couleur, récompense de la chasse — 30 septembre 2026 (0.013.0)

Projet : [PICTI](../../CLAUDE.md) · Branche `claude/couleurs-inversees` (partie de
`claude/photos-de-dos-vitre`, 0.012.0)
Voir aussi : [Fond caméra en noir et blanc (0.006.0)](2026-09-28-fond-camera-noir-et-blanc.md) ·
[Photos vues de dos, vitre dépolie (0.012.0)](2026-09-30-photos-de-dos-vitre.md)

## Demande d'Eliott

Depuis 0.006.0, la caméra est en noir et blanc et les photos géocadrées en couleur. On inverse :
caméra en couleur, photos en noir et blanc tant qu'elles n'ont pas été capturées. La couleur
devient la récompense de la chasse.

## Où était le noir et blanc

Une seule règle, `.camera-video.mono { filter: grayscale(1) }` (`styles.css`), posée sur la vidéo
de l'accueil, de la chasse et du recalage. Aucune photo n'avait de filtre.

## Ce qui a été fait

1. **Caméra en couleur** : classe `mono` retirée des trois vidéos, règle supprimée.
2. **Règle de couleur** (`src/data/photoColor.ts`) : `photoInColor(photo, { userId, capturedIds })`
   — en couleur si j'en suis l'auteur ou si je l'ai capturée, sinon noir et blanc (auteur inconnu :
   noir et blanc sauf capture) ; hooks `useColorRule`, `usePhotoInColor(id, owner?)`.
3. **Couleur progressive en chasse** : `huntSaturation(score)` sur le score d'alignement existant
   (`computeAlignment`) : 0 sous 0,15, courbe douce jusqu'à 40 % à `TOLERANCE_SCORE` (≈ 0,48, score
   sur place à la limite des tolérances de capture, calculé depuis `ALIGN_TOLERANCE` ; les largeurs
   du score, auparavant écrites en dur, sont nommées dans `ALIGN_SCORE` sans changer le calcul).
4. **Animation de capture** : première capture d'une photo d'un autre → copie en couleur
   (`.overlay-reveal`) révélée depuis le centre par `clip-path: circle()` en 600 ms, par-dessus la
   photo restée à 40 % ; immédiate avec `prefers-reduced-motion`.
5. **Lisibilité** : photos en noir et blanc du viseur avec un liseré clair de 1,5 px et une ombre
   légère (`.overlay-photo.tinted`).
6. **Partout** : viseur et piles (`ArSpotsLayer`), chasse, vignettes (`PhotoTile`, classe `.mono` :
   profil, Mes chasses, À proximité, recherche, import, frise), carte (vignettes et pile, auteur
   fourni par la carte), en-tête du détail.
7. **Avec la vitre** : le filtre de la vitre devient `blur(12px) saturate(var(--glass-sat))
   brightness(1.08)`, `--glass-sat` = 0,55 × saturation : une photo en noir et blanc vue de dos
   reste floue, en miroir, effacée, et se distingue par le reflet et le bord de vitre.

Filtres CSS sur les images seulement, jamais sur la vidéo.

## Vérifications

- Tests : `photoColor` (auteur, capture, autre, auteur inconnu) et `huntSaturation` (0 loin,
  40 % à la limite des tolérances, croissante, départ en douceur). 145 tests, lint, build OK.
- Chromium (Supabase simulé, chasse en mode démo) : cap à −35° → noir et blanc ; −11° → 34 % ;
  −1° → 40 % ; capture → copie en couleur de `circle(0%)` à `circle(75%)` en 600 ms.
- Viseur : caméra en couleur, mes photos vues de dos en vitre, en couleur ; listes : photos
  capturées en couleur.
- **À vérifier sur iPhone** : fluidité (filtres `saturate` sur l'image transformée pendant la
  chasse), rendu de la révélation. Remarque : la carte « Capturée ! » apparaît en même temps et
  cache une partie de l'animation (visible derrière, assombrie) — à revoir si besoin.

## Mise en ligne

Pull request vers `main` (contient aussi 0.012.0). Fusionner dans `main` = mise en production
automatique : seulement avec l'accord d'Eliott.
