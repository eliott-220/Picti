# 2026-10-09 — Croix de visée pour capturer (0.22.0)

Parent : [CLAUDE.md](../../CLAUDE.md)

Question d'Eliott : « y a-t-il bien la petite croix pour viser une photo que l'on souhaite
capturer ? ». Réponse : non — la seule croix de l'app était celle de « Reproduire » (0.16.1). Le
viseur choisissait déjà la photo visée (la plus proche du centre de l'écran), mais rien ne
montrait le centre. Ajoutée à sa demande (« oui »).

- `src/components/AimCrosshair.tsx` : croix fixe au centre de l'écran, même trait que la croix
  fixe de « Reproduire » (blanc, ombre sombre), sans interaction. `.aim-crosshair` dans
  `styles.css` : apparition en fondu, passage au jaune `#ffdc3c` et ×1,25 en 150 ms (sans
  animation avec `prefers-reduced-motion`).
- `src/geo/aim.ts` : `pointInQuad` (quadrilatère convexe, coins dans un sens ou dans l'autre :
  photo vue de dos ; aplati = jamais) et `aimsAt` (centre de l'écran dans la carte projetée,
  telle qu'affichée, taille plafonnée comprise). Tests : `aim.test.ts`.
- Viseur (`ArSpotsLayer`) : croix dès qu'une photo est à l'écran ; jaune si elle est sur la photo
  du dessus du lieu visé et que celle-ci se capture d'ici (`capturable` : d'un autre, pas encore
  capturée, à moins de 5 m). Pas en selfie ni en Reproduire (couche non affichée).
- Chasse (`Hunt`) : croix pendant la chasse ; jaune si `canCapture` et croix sur la photo.
- Masquée pendant l'agrandissement de la capture (la photo vient couvrir l'écran).
- Règles inchangées : « Capturer » reste actif quand la photo est à l'écran mais à côté de la
  croix ; capture automatique de la chasse (alignement tenu 0,5 s) inchangée.
- Constat au banc : à moins de 5 m, la carte de la chasse fait environ la moitié de la largeur de
  l'écran ; la croix la quitte vers 7° d'écart de cap et 9° d'inclinaison (alignement à ±6°).
- Vérifié au banc (Chrome, capteurs simulés) : viseur au point de vue → jaune + « Capturer » ;
  12° de côté → blanche ; à 20 m → blanche + « Chasser » ; aucune photo → pas de croix ; chasse à
  20 m → blanche ; au point de vue, 7° trop haut → jaune ; capture lancée → masquée. Pas encore vu
  sur l'iPhone.
- Version 0.22.0 (affichée 0.022.0, iOS `MARKETING_VERSION` et Android `versionName` aussi),
  sur la branche `claude/suivi-visuel` (0.21.0, pas encore en production). 360 tests, lint et
  build OK.
