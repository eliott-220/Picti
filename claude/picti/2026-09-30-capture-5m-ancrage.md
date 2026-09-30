# Capture à moins de 5 m, photo qui ne bouge plus — 30 septembre 2026 (0.013.1)

Projet : [PICTI](../../CLAUDE.md) · Branche `claude/couleurs-inversees`
Voir aussi : [Couleurs inversées (0.013.0)](2026-09-30-couleurs-inversees.md) ·
[Selfie, marche pas à pas (0.011.3)](2026-09-30-selfie-et-marche.md)

## Demande d'Eliott

> Pour capturer il faut être à moins de 5 m, corrige ça. Relie bien tous les fichiers de
> positions GPS de l'image avec son orientation, corrige tout ce que tu vois pour vraiment que
> l'image soit exactement là où on a pris la photo et qu'elle ne bouge plus. Puis publie par
> toi-même la nouvelle version sans redemander mon accord.

## Relecture de la chaîne position → orientation → projection

Relus : `geo/orientation.ts`, `geo/heading.ts`, `sensors/useOrientation.ts`, `geo/tracking.ts`,
`geo/motion.ts`, `sensors/useGeolocation.ts`, `sensors/useLivePosition.ts`, `geo/alignment.ts`
(`viewerEye`), `useSpotCalibration`, `data/pipeline.ts` (prise de vue, import EXIF),
`screens/Home.tsx` (déclencheur), `screens/Recaler.tsx`, `geo/projection.ts`, `geo/optics.ts`.

Chaîne correcte sur le fond : la photo est enregistrée avec la position affichée et
l'orientation du même instant (celles du rendu au moment de l'appui), sa focale mesurée et les
dimensions du flux ; elle est projetée depuis la position réelle du spectateur, avec la même
convention d'axes (ENU, base f/r/u). Causes de décalage ou de mouvement trouvées :

1. **Nord recalculé à chaque écran** : chaque écran avait son propre recalage gyroscope ↔
   boussole ; en passant de l'accueil à la chasse, il repartait de la boussole brute (bruitée,
   en retard) pendant une seconde : la photo pouvait se décaler de quelques degrés.
2. **Pas au sens inconnu** : sans élan net au départ (balancement, gestes), la marche était
   supposée « droit devant » : 3 pas comptés à tort déplaçaient la photo de 2 m.
3. **Dérive GPS à l'arrêt** : un écart de 4 m qui persistait 5 s était rattrapé comme un
   déplacement — la photo glissait alors qu'on n'avait pas bougé.
4. **Recalage manuel** : il enregistrait le dernier relevé GPS, pas la position suivie pas à pas
   des autres écrans (et n'avançait pas avec les pas).
5. **GPS imprécis à la prise de vue** (premières secondes, intérieur : ±30 m) : rien ne le
   signalait, la photo pouvait être enregistrée loin de sa place.

## Corrections (0.013.1)

- **Capture à moins de 5 m** : `CAPTURE_RADIUS = 5` (`ALIGN_TOLERANCE.radius`, sans élargissement
  selon la précision du GPS), `withinCaptureRadius`. Chasse : bouton « Capturer » désactivé
  au-delà, avec « Capturer à moins de 5 m : encore X m » (ou « Visez la photo » si elle est hors
  de l'écran) ; capture automatique par alignement : aussi à moins de 5 m. Viseur : « Capturer »
  seulement à moins de 5 m, sinon « Chasser » ; vérification répétée au moment de la capture.
- **Nord partagé** (`sharedNorth`, `useOrientation`) : un seul recalage pour toute l'app, gardé
  d'un écran à l'autre ; horodatage des événements pour ne l'intégrer qu'une fois par mesure.
- **Sens de marche inconnu** → `direction` null : les pas ne déplacent rien, le GPS reprend la
  main (`useLivePosition` n'annonce plus la marche pas à pas pour cette marche-là).
- **À l'arrêt, pas comptés** : écart GPS rattrapé seulement au-delà de 8 m ou de la précision
  (`TRACKING.steppedShift`) ; sans accéléromètre, inchangé (4 m).
- **Recalage** : même position suivie que l'accueil et la chasse (`useLivePosition`).
- **Prise de vue avec GPS > ±15 m** : message « … GPS à ±X m : elle pourra paraître décalée ».

## Vérifications

- Tests : rayon de capture (4 m oui, 6 m non même avec GPS ±20 m, 5 m inclus, sans position non),
  sens inconnu (balancement, avant toute marche), dérive GPS de 6 m ignorée à l'arrêt, écart de
  12 m rattrapé. 149 tests, lint, build OK.
- Simulation Chromium (viseur, accéléromètre simulé, GPS immobile) : recul 1622 → 830 px, stable,
  avancée 1609 px ; **balancement sur place** (pas sans élan) : 1620 → 1620 px, rien ne bouge ;
  capture à 2 m : révélation puis surbrillance ; chasse à 35 m : « Capturer à moins de 5 m :
  encore 31 m », désactivé.

## Limites (honnêtement)

- Le GPS d'un téléphone se trompe de 3 à 10 m, différemment d'un jour à l'autre et d'un
  téléphone à l'autre : une photo prise un jour peut paraître décalée de quelques mètres pour
  quelqu'un d'autre. Seul un repérage visuel (VPS / appli native ARKit) l'éliminerait.
- Avec un rayon de 5 m, ce même écart peut empêcher de capturer tant que le GPS est mauvais :
  le bouton affiche la distance restante.
- La boussole iPhone peut être perturbée par du métal (voitures, rambardes).

## Publication

Autorisée par Eliott sans nouvelle validation : fusion dans `main` (mise en production
automatique), avec 0.012.0 (vitre) et 0.013.0 (couleurs inversées, capture directe).
