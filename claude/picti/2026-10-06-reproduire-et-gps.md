# Reproduire hors de la vue, GPS plus fiable à la prise — 6 octobre 2026 (0.15.2)

Projet : [PICTI](../../CLAUDE.md) · Branche `claude/reproduire-et-gps`
Voir aussi : [Likes et reproductions (0.15.0)](2026-10-06-likes-et-reproductions.md)

## Demande d'Eliott

Prompt « 0.015.2 » (décisions du 06/10 : « Reproduire : que faire si on s'éloigne » et « Problèmes
de GPS »). Deux choses :

1. **Reproduire** : si l'on s'éloigne du point de vue de l'originale avant d'appuyer, ne pas perdre
   la photo (refus de la base), ne pas la rattacher à tort, ne pas laisser l'utilisateur sans
   explication.
2. **GPS plus fiable au moment de la prise** (toutes les prises) : avertir au-delà de ±12 m, moyenner
   les relevés à l'arrêt, enregistrer la précision, expliquer la « position exacte » sur iPhone.

## Ce qui a été fait

- **`src/geo/reproduce.ts`** (pur, testé) : `reproduceStatus(viewer, parent, accuracy, previous)` →
  `in-view` / `drifting` (au-delà de 70 % du rayon) / `out` (distance, cap ou inclinaison : `reason`)
  / `lost` (> 50 m) / `gps-weak` (> 12 m), avec `view` (dans la vue, même GPS imprécis), `inView`
  (verdict immédiat = `sameView`, la règle de `version_of`), distance, cap pour y retourner, rayon,
  écarts. Anti-scintillement sans horloge cachée : `out` seulement après 2 s d'écart
  (`outSince`), retour seulement 1 m à l'intérieur du rayon (et de 50 m).
- **Mode Reproduire** (`Home`) : `useReproduceStatus` (toutes les 200 ms) ; bandeau orange « Revenez
  de 2 m », rouge « Trop loin de la photo d'origine (14 m) » / « Tournez-vous vers la gauche » /
  « Levez le téléphone », avec flèche ; calque à 35 % et ⚠ sur le déclencheur hors de la vue ;
  à plus de 50 m, calque masqué et carte « Vous avez quitté le lieu de la photo » (« Y retourner »,
  « Quitter Reproduire ») ; pastille « GPS imprécis (±18 m), patientez » ; vibration courte en
  sortant de la vue (Android).
- **Déclencheur hors de la vue** : image figée tout de suite, feuille « Cette photo ne sera pas une
  reproduction : vous êtes à 14 m du point de vue de la photo de Marie (il faut être à moins de
  6 m). » → « Revenir au point de vue » (image jetée, mode gardé) / « Garder en photo classique »
  (sans `version_of`, visibilité de l'utilisateur, toast « Enregistrée comme photo classique »).
  Base qui refuse quand même `version_of` : réessai sans parente et toast « Enregistrée comme photo
  classique : vous n'étiez plus dans la vue de l'originale ».
- **Base** : fonction `private.check_photo_version` relue en ligne (identique à la migration 0.15.0) :
  mêmes rayons, avec 1 m et 1° de marge → elle accepte tout ce que le client juge dans la vue.
  **Aucune migration.**
- **GPS à la prise** : `GPS_GOOD_ACCURACY` = 12 m ; pastille orange au-delà ; déclencher au-delà
  fige l'image et ouvre « Position imprécise (±18 m) : la photo risque d'être mal placée. » →
  « Attendre » (bandeau, la photo se prend seule dès que la précision repasse sous 12 m) /
  « Prendre quand même ».
- **Moyenne à l'arrêt** (`updateTrack`) : immobile depuis 2 s, la position est la moyenne pondérée
  (1 / précision²) des relevés depuis l'arrêt, pris pendant au plus 10 s, puis tenue ; sauts isolés
  exclus, écart persistant toujours rattrapé, reprise immédiate à la marche.
- **Précision enregistrée** : direct (déjà fait), import = EXIF `GPSHPositioningError`, sinon null.
- **iPhone « position approximative »** : précision > 100 m pendant 15 s → une fois l'explication
  « Réglages › Confidentialité et sécurité › Service de localisation › Sites web Safari › Position
  exacte » (« Compris » mémorisé, `localStorage` sous try/catch). `watchPosition` était déjà en
  `enableHighAccuracy: true`, `maximumAge: 0`.

## Défauts trouvés en vérifiant (corrigés)

- **Précision périmée** : immobile, `useLivePosition` ne republiait la position que si elle bougeait
  d'1 cm ; sa précision restait celle d'un ancien relevé — enregistrée avec la photo (déjà le cas
  avant) et, ici, « Attendre » ne se déclenchait jamais. Elle est republiée quand la précision change.
- **Selfie reproduit** : les jauges du mode Reproduire comparaient l'orientation de la caméra
  principale à celle, enregistrée, de l'objectif avant (180° d'écart). Elles utilisent désormais
  l'orientation de l'objectif utilisé, comme l'enregistrement.

## Choix faits en codant (à valider)

- **Le déclencheur suit la règle exacte** (`sameView` au moment de l'appui), pas l'état affiché :
  pendant les 2 s de délai on peut voir « dans la vue » et obtenir la feuille, et dans la marge
  d'1 m on peut voir « trop loin » et obtenir une reproduction. Sinon, la feuille et la base se
  contrediraient.
- **Orange à partir de 3,5 m, pas 3 m** : le rayon vaut au moins 5 m, donc 70 % du rayon ≥ 3,5 m. À
  3 m avec un bon GPS, on reste « dans la vue » (sur le banc, l'orange est apparu à 3 m à cause du
  GPS simulé sans accéléromètre, qui dépasse sa cible quelques secondes).
- **Moyenne : les 10 premières secondes de l'arrêt, puis tenue** (pas une fenêtre glissante, qui
  ferait glisser les photos avec la dérive du GPS — invariant de la 0.010.1).
- **Pas de moyenne après une marche comptée pas à pas** : elle déferait les mètres comptés, que le
  GPS ne voit pas (règle de la 0.011.3, testée). Sur téléphone, la moyenne joue donc surtout au
  premier arrêt (ouverture de l'app), sans accéléromètre ni boussole, et après un rattrapage.
- **Précision enregistrée = celle du dernier relevé**, pas celle (meilleure) de la moyenne : moyenner
  réduit le bruit, pas le biais des façades.
- **« Attendre » prend une nouvelle image** au moment où le GPS redevient précis (image, position et
  orientation du même instant) ; « Prendre quand même » garde l'image figée.
- **« Garder en photo classique »** : visibilité de la pastille du déclencheur (le réglage de
  l'utilisateur, sauf s'il l'a changée pour la session), jamais plafonnée par l'originale.
- **GPS imprécis en Reproduire** : pastille seulement ; pas de « Revenez de 2 m » (sans valeur à
  ±18 m) mais toujours le bandeau rouge si l'on est clairement hors de la vue.
- **Explication « Position exacte » sur iPhone et iPad seulement** (texte propre à iOS) ; « dehors »
  ne se détecte pas : seule la précision compte.

## Vérifications

- `npm test` : 248 tests (226 avant) — `reproduceStatus` (dans la vue, s'éloigne, hors de la vue par
  distance, par cap, par inclinaison, perdu à 50 m, GPS imprécis, anti-scintillement dans les deux
  sens, retour d'un lieu quitté), même verdict que `sameView` sur une grille de 6 480 cas, moyenne
  pondérée à l'arrêt (exacte), tenue après 10 s, saut exclu, reprise à la marche, rattrapage
  persistant, pas comptés gardés ; textes des bandeaux et feuilles ; précision EXIF.
  `npm run lint`, `npm run build` : OK.
- **Chrome sans interface** (390 × 844), vraie application sur la fausse base du banc, caméra / GPS
  (un relevé par seconde, position et précision pilotées) / boussole / accéléromètre simulés :
  Reproduire — à 4 m orange « Revenez de 1 m » ; à 12 m orange encore après ~1 s, rouge « Trop loin
  de la photo d'origine (13 m) » après 2 s, calque à 0,17, ⚠ ; un relevé isolé à 12 m : orange
  seulement, jamais rouge ; tourné de 40° : « Tournez-vous vers la gauche » ; 60 m : carte « Vous avez
  quitté le lieu de la photo », « Y retourner » → bandeau et flèche, mode ouvert ; retour → état
  normal. Appui à 12 m : image figée + feuille (« à 13 m … il faut être à moins de 5 m ») ;
  « Revenir » : rien d'enregistré ; « Garder en photo classique » : photo sans `version_of`,
  visibilité « amis » (défaut de Bruno), précision 4. Appui dans la vue : reproduction rattachée,
  détail ouvert. Base forcée à refuser : photo enregistrée sans parente + toast. Viseur à ±20 m :
  pastille orange, feuille « Position imprécise (±20 m) », « Attendre » → bandeau, puis GPS à ±5 m →
  photo prise seule (précision 5). Immobile 11 s, GPS ±4 m avec ±3 m de bruit : photo à 1 cm de la
  moyenne pondérée des relevés ; sa carte reste au centre de l'écran (195, 422) pendant 8 s après la
  prise. iPhone simulé à ±1,5 km : rien à 8 s, explication à 16 s ; « Compris » mémorisé, plus
  affichée après rechargement.
- **Pas fait** : vrai iPhone (vibration, réglage « Position exacte », marche réelle avec les pas).

## Mise en ligne

Pull request vers `main`, **non fusionnée** : fusionner = mise en production automatique sur
picti.vercel.app, seulement avec l'accord d'Eliott. Aucune migration à appliquer.
