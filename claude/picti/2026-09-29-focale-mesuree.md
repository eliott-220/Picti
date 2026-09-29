# 2026-09-29 — Photo encore un peu décalée sur iPhone Pro : focale mesurée (0.011.1)

Projet : [PICTI](../../CLAUDE.md) · Dépôt `eliott-220/picti` · Branche `claude/nice-cori-zbpf7v`
(suite de [La photo bouge et reste trop grande de loin](2026-09-29-photo-stable-et-lointaine.md))

## Retour d'Eliott (test de 0.010.1 sur iPhone Pro)

« Ça bouge encore un peu. » Précisé : en tournant, la photo glisse plus ou moins vite que le
décor et **reste décalée** (elle ne revient pas).

## Cause

Signature d'un champ de vision faux, pas de la boussole : PICTI supposait une caméra de
**26 mm** ; la caméra principale des iPhone Pro récents est un **24 mm** (et Safari peut
recadrer le flux). La photo défilait alors ~8 % moins vite que le décor : 2,7° d'écart après
avoir tourné de 30°.

## Réalisé (0.011.1)

- `src/geo/focalCalibration.ts` (nouveau, testé) : l'image est réduite à un profil de colonnes ;
  son glissement d'une image à l'autre (moitié centrale, précision au dixième de pixel) est
  comparé à la rotation du gyroscope, uniquement pendant une rotation régulière (même vitesse
  sur deux demi-fenêtres de 250 ms), ce qui rend la mesure insensible au retard de la vidéo.
  Mesures de 15° de rotation, médiane de 15, biais de perspective corrigé, focales plausibles
  14–45 mm.
- `src/sensors/useFocalCalibration.ts` : analyse chaque image de la vidéo (240 px de large)
  sur l'accueil et en chasse ; `src/sensors/cameraFocal.ts` garde la focale sur le téléphone
  (`picti.focale`).
- La focale mesurée sert à l'écran (accueil, chasse, recalage) et aux **nouvelles photos**.
- Menu : « Caméra 24 mm (mesurée) » sous le numéro de version.
- Version **0.011.1** (avec la carte orientable de 0.011.0).

## Vérifications

- 6 tests : glissement retrouvé, décor uni ignoré, 24 mm et 26 mm mesurés à 2 % près malgré
  80 ms de retard de la vidéo, rien sans balayage, lecture d'une image. Précision : 24 → 24,1–24,2 ;
  26 → 25,5 ; 22 → 22,6 ; 28 → 28,4, quel que soit le retard (0 à 150 ms).
- Banc d'essai (app entière, caméra simulée de 24 mm filmant un décor qui défile, balayages
  ±30°) : focale mesurée 23,6–23,8 mm en ~15 s de balayages ; écart de la photo à l'arrêt après
  un balayage : **2,7° → 0,5–0,8°**.
- `npm test`, `npm run lint`, `npm run build` : OK.

## À tester sur l'iPhone

Faire quelques balayages lents à gauche et à droite (face à un décor varié, pas un mur uni),
puis regarder le menu : « Caméra 24 mm (mesurée) » attendu sur un iPhone Pro récent. Ensuite,
la photo ne doit plus rester décalée après avoir tourné.
