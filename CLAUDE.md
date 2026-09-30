# CLAUDE.md — projet PICTI

Mémoire de projet pour Claude. Lire aussi `README.md` (fonctionnalités, architecture, limites).

## Le projet

**PICTI** = application de **géocadrage** : ancrer une photo à la position GPS et à
l'orientation exactes (cap, inclinaison, roulis) de sa prise de vue, pour la redécouvrir
*in situ* en réalité augmentée. Concept de Yannick Devin et Denis Servais (2018, La Rochelle).
Porté aujourd'hui par Eliott (dépôt `eliott-220/picti`).

Vocabulaire (à respecter dans l'UI, toujours en français) :

- **Géocadrage en direct** : photo prise dans PICTI, géocadrée à la volée (gratuit).
- **Géocadrage en différé** : photo importée, géocadrée via EXIF (auto) ou recalée à la main
  sur le lieu (payant dans le modèle économique).
- **Chasse** : aller retrouver une photo sur place ; une fois aligné sur son point de vue,
  la photo est **capturée**. **Chasseurs** = ceux qui chassent mes photos ; **proies** =
  ceux dont je chasse les photos ; **captures/prises** = photos retrouvées.
- Arborescence des maquettes : Accueil (capturer / géocadrer en direct ou en différé),
  Moi (Mon profil, Mes photos géocadrées, Mes chasseurs), Mes amis (Mes prises, Mes proies).

## Sources (Google Drive du projet)

- `PICTI - Présentation - Sans compression.pdf` (42 p., id `1Fn8JjNKLyS3UPEzrJg9968-nS-T0wrse`)
- `PICTI _ PRESENTATION SIMPLIFIEE.pdf` (id `1Pfk6kFHRufEUeJJxI7yfv3MZM4dssGf2`)
- `PICTI - Storyboard - Compression forte.pdf` (id `1EwCYqCvMtMeEhpkY24It2r1S2OJ7yrTw`)
- Carte mentale `Picti.jpg` / `PIcti.xmind` (dossier Analyse fonctionnelle / V2)
- Maquettes d'écrans : dossier `Ecrans/V2` (Accueil, Profil, Mes chasses, Capture…)
- Ancien APK de démo : `APK/Picti_demo_no_circle.apk`

Charte (maquettes V2) : rouge `#eb0c0c`, saumon `#ff8484`, blanc ; cartes empilées à grands
coins arrondis ; boutons ronds blancs flottants ; police ronde (Outfit).

## Technique

- Vite + React 19 + TypeScript, PWA statique (routage par ancre `#/…`).
- Backend **Supabase** (projet `picti`, ref `fiybbfiyrnptnpwqkrji`, Paris) : compte obligatoire
  (e-mail + mot de passe ; **mot de passe oublié** depuis 0.010.0 : `resetPasswordForEmail` → lien vers `window.location.origin` → écran `NewPassword`, repéré par `openedFromRecoveryLink` lu avant que Supabase n'efface l'adresse, et par l'événement `PASSWORD_RECOVERY`), tables `profiles`, `friendships`, `photos`, `captures`, RPC
  `nearby_photos`, bucket privé `photos` (dossier par utilisateur, URLs signées). Toutes les
  règles d'accès sont en RLS : voir `supabase/migrations/`. Visibilité par photo :
  `public` (défaut) / `amis` / `prive`. Config client : `src/config.ts`.
- Modèle économique : géocadrage en direct gratuit ; **Premium** (colonne `profiles.plan`,
  non modifiable par l'utilisateur) : enregistrer les photos des autres
  (`SAVE_OTHERS_PREMIUM_REQUIRED = true`) et le géocadrage en différé
  (`DIFFERE_PREMIUM_REQUIRED = true`, doublé côté serveur par le déclencheur
  `photos_differe_premium`) — `src/config.ts`. Plus de période d'essai gratuite. Accès Premium :
  paiement (à venir) ou **code** (`PremiumCard` → RPC `redeem_premium_code`, codes hachés
  bcrypt dans `private.premium_codes`, 5 essais/heure). Ne jamais écrire un code en clair
  dans le dépôt ; gestion des codes : voir `supabase/migrations/20260928160000_premium_codes.sql`.
- Carte du monde : `src/screens/WorldMap.tsx` (chargée à la demande), MapLibre GL 6 +
  fond OpenFreeMap (gratuit, sans clé), regroupement Supercluster (vignette = photo la plus
  récente), RPC `photos_in_bounds`. Carte **orientable** depuis 0.011.0 (rotation à deux doigts,
  à plat : `touchPitch` coupé, `maxPitch: 0`) ; bouton boussole `.map-north` (visible dès que la
  carte est tournée, remet le nord en haut) ; les cônes de direction des vignettes sont
  compensés (`heading - bearing`). Vignettes et point « moi » : éléments React (portail dans le
  conteneur de la carte) **replacés directement à chaque événement `move`** (`place`, attributs
  `data-lon`/`data-lat`/`data-heading`) : sur iPhone, le rendu React attend la fin du geste et
  les vignettes restaient figées 2 à 3 s (corrigé en 0.011.3). Le processus de fond MapLibre est assemblé par Vite
  (`?worker&url` + `setWorkerUrl`).
- Photos d'un même endroit (rayon 10 m, `src/geo/spots.ts`) : **empilées**, la plus récente
  devant ; on fait glisser celle du dessus comme sur Tinder (`useCardSwipe`, `SwipeDeck`,
  en boucle via `cycle`) et des **points façon Instagram** (`Dots`) indiquent leur nombre.
  Partout : viseur de l'accueil (`ArSpotsLayer` : pile des photos du lieu visibles dans la
  direction visée), en-tête du détail (`usePhotosHere`), carte (les photos d'un endroit
  forment un seul point, jamais séparé au zoom), grille « Mes photos » (une vignette par
  endroit), frise de la chasse. Le viseur affiche toutes les photos géocadrées connues à
  moins de 150 m : une photo qu'on vient de prendre y apparaît aussitôt.
- `src/geo/` = moteur pur, couvert par Vitest : **toute modification de la géométrie doit
  garder `npm test` vert**. Repère monde ENU (x Est, y Nord, z Haut) ; caméra = base
  (f avant, r droite, u haut) ; angles en degrés.
- **Photos ancrées dans le décor** (depuis 0.009.1) : la projection part toujours de la
  position réelle du spectateur (`viewerEye`, altitude GPS ignorée) ; ne **jamais** recaler
  l'œil sur le point de vue selon la distance (l'ancien `parallaxEye` faisait suivre la photo
  au téléphone dans un rayon de 8 à 30 m). Position : un seul suivi GPS partagé
  (`useGeolocation`, filtre de Kalman `src/geo/tracking.ts`) + accéléromètre
  (`src/geo/motion.ts`, `src/sensors/motion.ts` : **comptage des pas**, au moins 3 rebonds
  verticaux réguliers — viser ou bouger le téléphone n'est pas marcher ; marche / vient de
  s'arrêter / immobile) ; à l'arrêt, la position est **tenue** (`holdGain`) : une photo à 6 m se
  décale de ~30° pour 3 m de dérive GPS ; seul un écart moyen **persistant** (`persistentShift`
  4 m ou ½ précision, ~5 s) est rattrapé (`catchUp`) — ne jamais figer la position sans cette
  porte de sortie (0.009.1 le faisait : 5 m de marche pouvaient être ignorés) ; sans
  accéléromètre, la vitesse GPS dit si l'on bouge ; `useLivePosition` la fait avancer à chaque image (accueil, chasse).
  **Pas à pas** (depuis 0.011.3) : le GPS ne voit pas quelques mètres (±5 m), la photo gardait
  sa taille et suivait le téléphone en avançant ou en reculant. Chaque pas d'une marche reconnue
  (`MotionDetector.walked`) avance la position de `MOTION.stepLength` (0,65 m) dans le sens de la
  marche : `direction`, tirée de l'élan des 3 premiers pas (vitesse horizontale intégrée dans le
  repère de l'objectif : avant, arrière, côté ; à défaut droit devant), tournée sur le terrain
  par `stepDirection` (orientation du téléphone), appliquée par `walkPosition` → `walkTrack` ;
  signe de l'accéléromètre vérifié contre l'orientation (`accelerometerSign` : certains
  navigateurs l'inversent, ce qui inverserait avant/arrière).
  Tant qu'un écran avance ainsi (`keepStepping`, `updateTrack(…, stepping)`), le GPS (en retard)
  ne tire pas la position pendant la marche ni juste après ; seul un écart qui persiste une fois
  arrêté la corrige (pas comptés dans le mauvais sens). Depuis 0.013.1 : **sens inconnu** (élan
  trop faible, balancement sur place) → `direction` null, les pas ne déplacent rien et le GPS
  reprend la main ; **à l'arrêt, pas comptés**, un écart du GPS n'est rattrapé qu'au-delà de
  `steppedShift` (8 m ou sa précision) — en deçà ce n'est que sa dérive. **Une seule position
  pour les trois écrans caméra** : accueil, chasse et recalage enregistrent / projettent tous la
  position suivie (`useLivePosition`, pas à pas). Une
  photo prise est enregistrée à la position affichée. En chasse seulement,
  `useSpotCalibration` attribue au GPS l'écart restant quand la photo est alignée avant la
  capture (téléphone immobile), puis le fige. **Photo dépassée (vue de dos)** (depuis 0.012.0) :
  reste visible comme **imprimée sur une vitre dépolie** — l'homographie du plan vu de derrière
  donne d'elle-même l'image en miroir (rien n'est retourné à la main) ; `ArPhoto glass` : classe
  `.glass` (flou 12 px, désaturée, éclaircie), opacité × `GLASS_OPACITY` (0,45) et calque de reflet
  `.overlay-glass` (même taille, même transformation). Vue **par la tranche**, elle s'efface en
  douceur : `viewCosine` (|cos| entre la visée vers le centre du plan et l'axe de prise de vue)
  → `edgeFade` (smoothstep, `EDGE_FADE` : 0 sous 0,08, 1 au-delà de 0,35) → `ArProjection.fade`,
  multiplié à l'opacité (viseur, pile, chasse). Pas de texte sur la vitre (il serait en miroir).
  La capture ne change pas.
- **Cap sur iPhone** (depuis 0.010.1, `src/geo/heading.ts`) : les mouvements viennent du
  gyroscope (`alpha`) ; le nord de `webkitCompassHeading` n'est recalé que **lentement**
  (τ 2 s), téléphone stable (< 8°/s) et objectif à moins de 55° de l'horizon ; recalage rapide
  au démarrage, après une pause, ou si un grand écart persiste. Ne jamais revenir à un suivi
  direct de la boussole : en retard quand on tourne, elle faisait « suivre la caméra » aux photos
  (17° d'erreur en balayant, 14° encore après l'arrêt, contre 3,5° et 0,2°). **Nord partagé**
  par tous les écrans (`sharedNorth` dans `useOrientation`, depuis 0.013.1) : passer de l'accueil
  à la chasse ne repart plus de la boussole brute (la photo restait décalée quelques secondes) ;
  horodatage des événements pour ne l'intégrer qu'une fois par mesure.
- **Focale mesurée** (depuis 0.011.1, `src/geo/focalCalibration.ts`, `useFocalCalibration`,
  `cameraFocal.ts`) : en tournant le téléphone, glissement de l'image (profil de colonnes, moitié
  centrale, image réduite à 240 px) comparé à la rotation du gyroscope, seulement en rotation
  régulière (même vitesse sur deux demi-fenêtres de 250 ms : insensible au retard de la vidéo) ;
  médiane de 15 mesures de 15°, biais de perspective corrigé ; gardée dans `localStorage`
  `picti.focale`, utilisée par l'écran (accueil, chasse, recalage) et les nouvelles photos ;
  affichée dans le menu (« Caméra 24 mm (mesurée) »). Sans elle (26 mm supposés), sur iPhone
  Pro (24 mm) la photo défilait moins vite que le décor et restait décalée (2,7° à 30°).
- **Taille de loin** (depuis 0.010.1, `displayScale` dans `src/geo/projection.ts`) : le plan-photo
  est réduit par `farScale` (1 au point de vue, ~⅓ à 20 m) avec une hauteur apparente minimale
  de 5° : à 20 m, ~12 % de la largeur de l'écran (37 % avant) ; au point de vue, inchangé.
- Commandes : `npm run dev`, `npm run dev:https` (test sur téléphone), `npm test`,
  `npm run lint`, `npm run build` (inclut `tsc -b`).
- Déploiement : projet Vercel `picti` (compte d'Eliott) → https://picti.vercel.app, public
  (le compte PICTI protège l'accès). Projet relié au dépôt GitHub : chaque push construit un
  aperçu ; la **production** se fait en redéployant cet aperçu avec `target: production`
  (API Vercel, `create_deployment` + `deploymentId`). **Attention : depuis le 30/09, chaque fusion dans
  `main` est mise en production automatiquement** (vu avec eliott-220/Picti#3 et #4) : fusionner une
  pull request = mettre en ligne. **Production actuelle : 0.011.3** (`dpl_DqK5cFg7S4rQjTvfyzb4j11gSdZA`, commit `bfc2431`, branche `claude/youthful-cannon-962c45`, confirmée READY sur picti.vercel.app le 30/09/2026 ; fusionnée dans `main` le 30/09 par eliott-220/Picti#3). Retour arrière possible : 0.011.2 (`dpl_4PtSLtuydm9DTrwmnGfytBNsJ3NE`), 0.011.1 (`dpl_2wRsESgFE6868PMCUVwA13LGwZLr`), 0.010.1 (`dpl_3n1rUFb8urWWDRK7VuR57eqYfEBZ`), 0.009.2 (`dpl_GTeorpPpLWapoMQyyV7tcW8sMFaB`), 0.009.1 (`dpl_CH3VQP2FGb3572UpwuMzskCNv7yp`) ou 0.009.0 (`dpl_EPnnkgHnE3p8ENQJr7WHPTKcco4h`). **`main` est la branche de référence** (depuis le 29/09/2026, tout le travail des branches `claude/*` y a été rassemblé) : chaque nouvelle session part de `main`. 
- Mises à jour : le build publie `version.json` (commit Vercel + numéro) ; `UpdateBanner`
  affiche « Nouvelle version de PICTI disponible : 0.009.0 » (vérif. au retour dans l'app et
  toutes les 5 min, comparaison sur le commit) ; bouton « Recharger » + numéro dans le menu.
- **Numéro de version** au format **x.xxx.x** (`src/data/versionNumber.ts`), tiré du champ
  `version` de `package.json` (écrit en semver : `0.8.1` → affiché `0.008.1`). Premier chiffre =
  grande version (1 = sortie officielle), trois du milieu = nouvelle fonctionnalité, dernier =
  correction / petit ajustement. **À chaque changement livré, augmenter `version` dans
  `package.json` (et `package-lock.json`)** : fonctionnalité → `0.9.0`, correction → `0.8.2`.
- **Couleurs inversées** (depuis 0.013.0, remplace le fond noir et blanc de 0.006.0) : caméra en
  couleur partout ; une photo est en couleur si j'en suis l'auteur ou si je l'ai capturée, en noir
  et blanc sinon — règle unique `photoInColor` / `useColorRule` / `usePhotoInColor`
  (`src/data/photoColor.ts`), appliquée au viseur et aux piles (`ArPhoto saturation`), à la chasse,
  aux vignettes (`PhotoTile` : classe `.mono`), à la carte (vignettes et pile, auteur fourni par la
  carte) et à l'en-tête du détail. En chasse, la saturation suit le score d'alignement existant :
  `huntSaturation` = 0 sous 0,15, courbe douce jusqu'à 40 % au score atteint à la limite des
  tolérances de capture (`TOLERANCE_SCORE`, calculé depuis `ALIGN_TOLERANCE` et `ALIGN_SCORE`).
  Première capture d'une photo d'un autre : copie en couleur révélée depuis le centre en 600 ms
  (`.overlay-reveal`, `clip-path`), immédiate avec `prefers-reduced-motion` ; la carte « Capturée ! »
  attend la fin (`.captured.after-reveal`). **Capture directe** : rester immobile était trop dur
  (le moindre mouvement annulait le maintien `HOLD_MS`) → bouton « Capturer » dans la chasse
  (photo d'un autre visible à l'écran) et dans l'étiquette du viseur (`onCapture`, révélation sur
  place) ; la capture automatique par alignement maintenu reste. **Capture à moins de 5 m** du
  point de vue (`CAPTURE_RADIUS`, `withinCaptureRadius`, depuis 0.013.1), quelle que soit la
  précision du GPS : au-delà, bouton désactivé « Capturer à moins de 5 m : encore X m » (chasse)
  ou « Chasser » (viseur). Photos en couleur (miennes ou
  capturées), de face : **surbrillance animée** `.overlay-shine` (bord clair ≈ 4 px à l'écran quelle
  que soit la distance, `--shine` via `overlayScale`, halo qui respire, éclat qui traverse ;
  opacité/translation seulement ; figée avec `prefers-reduced-motion`). Filtres CSS sur les
  images seulement (`--sat`, `--glass-sat` pour la vitre), jamais sur la vidéo ; liseré clair fin +
  ombre légère sur les photos en noir et blanc du viseur (`.overlay-photo.tinted`).
- Selfies (`photos.selfie`) : géocadrage en direct avec la caméra avant ; on enregistre
  l'orientation de l'objectif avant (`frontCameraBasis` : cap +180°, inclinaison et roulis
  inversés), focale 23 mm, image non inversée (seul l'aperçu est en miroir). Distance du sujet
  **0,6 m** (`SELFIE_DEPTH`, l'auteur à bout de bras) depuis 0.011.3 : à 6 m comme les autres, le
  visage devenait un portrait géant ; les selfies enregistrés avant à 6 m sont lus à 0,6 m
  (`rowToPhoto`). Ensuite, mêmes
  règles que toute photo : on la retrouve en visant, depuis la place du téléphone, l'endroit
  où se tenait l'auteur.
- **Autorisations mémorisées** (`src/sensors/permissions.ts`, `localStorage`
  `picti.autorisation.boussole`) : iOS redemande la boussole à chaque ouverture ; si elle a
  déjà été accordée, `useOrientation` la réactive seul (sans geste si le système l'accepte,
  sinon au premier appui n'importe où ; pastille « Boussole : touchez l'écran »). **Caméra** :
  un seul flux partagé par toute l'app (`useCamera`), gardé 15 s après avoir quitté un écran
  caméra (accueil ↔ chasse ↔ recalage sans redemande), coupé en arrière-plan et relancé au
  retour. L'autorisation navigateur elle-même ne se règle que dans Safari (aA › Réglages du
  site web › Caméra / Localisation › Autoriser) : message affiché en cas de refus.
- Conventions : identifiants en anglais, commentaires et UI en français, pas de point-virgule,
  guillemets simples.

## État et suite

- 0.001.0 (sept. 2026) : prototype complet local (direct, différé EXIF, recalage sur place,
  chasse AR avec capture, profil, chasses, proximité, recherche, mode démo).
- 0.002.0 : Supabase (comptes, publication des photos, photos des autres à proximité,
  visibilité publique/amis/privée, amis par code, chasseurs/proies, captures partagées).
- 0.003.0 : carte du monde, viseur augmenté (photos du lieu empilées), enregistrement Premium.
- 0.004.0 : passage en Premium par code administrateur.
- 0.005.0 : fin de l'essai gratuit (différé réservé à Premium, vérifié en base), notification
  de mise à jour et bouton « Recharger ».
- 0.006.0 : fond caméra en noir et blanc (accueil, chasse, recalage) ; photos géocadrées en couleur.
- 0.007.0 : selfies géocadrés (caméra avant), filtre « Selfies » dans la recherche.
- 0.008.0 : photos d'un même endroit empilées, à faire glisser (Tinder) avec points (Instagram).
- 0.008.1 : numéro de version au format x.xxx.x (menu, notification de mise à jour).
- 0.008.2 : heure de prise de vue à côté de la date (`formatDateTime`, `photoTitleAndDate`).
- 0.009.0 : autorisations caméra et boussole gardées en mémoire.
- 0.009.1 : photos ancrées dans le décor (elles ne suivent plus le téléphone) : position réelle
  du spectateur, suivi GPS + accéléromètre, recalage au moment de la capture.
- 0.009.2 : à l'arrêt, un déplacement que l'accéléromètre n'a pas vu (ou un GPS en retard) est
  rattrapé ; distance à la photo visée affichée dans le viseur, « · marche » sur la pastille GPS.
- 0.010.0 : mot de passe oublié (demande d'un lien par e-mail, écran « Nouveau mot de passe », lien expiré signalé).
- 0.010.1 : photos stables et lointaines : cap iPhone gyroscope + recalage lent de la boussole,
  comptage des pas, position tenue à l'arrêt, photo réduite de loin (à 20 m : 12 % de l'écran).
- 0.011.0 : carte orientable (deux doigts) avec bouton boussole pour remettre le nord en haut.
- 0.011.1 : focale de la caméra mesurée automatiquement (iPhone Pro : la photo ne reste plus
  décalée après avoir tourné) ; affichée dans le menu.
- 0.011.2 : défauts d'affichage de la revue ergonomique du 30/09 : bouton retour qui chevauchait
  les titres et crayon « Renommer » invisible (`:where(.round-btn)` sans poids, pour que
  `.back-btn` / `.detail-edit` gardent leur position absolue), recherche qui débordait à droite
  (`.search-field { min-width: 0 }`), titres « Mes proies (1) » au lieu de « Mes 1 proie »,
  étiquette du viseur sans l'année en cours (`formatDayTime`) pour ne plus couper l'heure.
- 0.011.3 : selfies à taille réelle (sujet à 0,6 m au lieu de 6 m) ; position qui avance pas à pas
  (accéléromètre + orientation) : en avançant ou en reculant de quelques mètres, la photo grandit
  ou rapetisse à sa place au lieu de suivre le téléphone ; carte : vignettes et position qui suivent
  le doigt pendant le déplacement (elles restaient figées puis se replaçaient 2 à 3 s après).
- 0.012.0 : photos vues de dos, comme sur une vitre dépolie (floues, en miroir, avec un reflet) au lieu
  de disparaître une fois dépassées ; effacement en douceur quand on les voit par la tranche.
- 0.013.0 : couleurs inversées — caméra en couleur, photos des autres en noir et blanc jusqu'à leur
  capture (couleur progressive en s'alignant, jusqu'à 40 %, puis la couleur envahit la photo) ;
  capture directe d'un appui (« Capturer », chasse et viseur) ; surbrillance animée des photos en
  couleur ; même règle partout (profil, chasses, listes, carte, piles). Combinée à la vitre (0.012.0).
- 0.013.1 : capture à moins de 5 m du point de vue ; ancrage renforcé — nord de la boussole
  partagé entre les écrans, pas au sens inconnu ignorés (plus de glissement en se balançant),
  dérive GPS < 8 m ignorée à l'arrêt, même position pour accueil / chasse / recalage, avertissement
  quand une photo est prise avec un GPS imprécis (> ±15 m).
- Test terrain du 30/09 (iPhone, 0.011.2) : selfie beaucoup trop grand ; en avançant et en reculant,
  la photo garde sa taille et suit le téléphone (rotation sur place : OK) → 0.011.3.
- Test terrain du 30/09 (iPhone, 0.011.1) : ancrage « pratiquement parfait » — la photo ne bouge
  pratiquement plus quand on pivote le téléphone à 3-4 m d'elle. Reste à tester la marche (5-10 m).
- Prochaines étapes : test terrain en marchant (reculer de 5 à 10 m) et de la carte orientable ;
  choix d'Eliott sur les autres points de la revue ergonomique du 30/09 (voir sa note) ; test terrain à
  plusieurs ; paiement Premium ; tester « mot de passe oublié » avec un vrai e-mail (modèles
  d'e-mails français dans `supabase/templates/`, à coller dans Supabase › Authentication › Emails ;
  envoi d'e-mails : SMTP intégré limité) ; notifications de proximité ; piste VPS/native.

## Journal des discussions

- [2026-09-28 — Reprise du projet et prototype v0.1](claude/picti/2026-09-28-prototype-v0.1.md)
- [2026-09-28 — Mettre à jour l'app installée sur l'écran d'accueil](claude/picti/2026-09-28-mises-a-jour-ecran-accueil.md)
- [2026-09-28 — Fond caméra en noir et blanc](claude/picti/2026-09-28-fond-camera-noir-et-blanc.md)
- [2026-09-28 — Selfies géocadrés](claude/picti/2026-09-28-selfies.md)
- [2026-09-28 — Photos d'un même endroit empilées](claude/picti/2026-09-28-photos-empilees.md)
- [2026-09-28 — Numéro de version x.xxx.x](claude/picti/2026-09-28-numero-de-version.md)
- [2026-09-28 — Heure des photos](claude/picti/2026-09-28-heure-des-photos.md)
- [2026-09-28 — Autorisations caméra et boussole mémorisées](claude/picti/2026-09-28-autorisations-memorisees.md)
- [2026-09-28 — Photos ancrées dans le décor (géolocalisation)](claude/picti/2026-09-28-photos-ancrees.md)
- [2026-09-28 — Photo qui suit encore après 5 m (0.009.2)](claude/picti/2026-09-28-photo-suit-encore.md)
- [2026-09-29 — Point d'étape : sur quoi se concentrer](claude/picti/2026-09-29-point-etape.md)
- [2026-09-29 — Objectifs du jour](claude/picti/2026-09-29-objectifs-du-jour.md)
- [2026-09-29 — Mot de passe oublié (0.010.0)](claude/picti/2026-09-29-mot-de-passe-oublie.md)
- [2026-09-29 — La photo bouge et reste trop grande de loin (0.010.1)](claude/picti/2026-09-29-photo-stable-et-lointaine.md)
- [2026-09-29 — Carte orientable (0.011.0)](claude/picti/2026-09-29-carte-orientable.md)
- [2026-09-29 — Photo encore un peu décalée sur iPhone Pro : focale mesurée (0.011.1)](claude/picti/2026-09-29-focale-mesuree.md)
- [2026-09-30 — Améliorer l'ergonomie de l'app](claude/picti/2026-09-30-ergonomie.md)
- [2026-09-30 — Selfie trop grand, photo qui suit en avançant, carte figée (0.011.3)](claude/picti/2026-09-30-selfie-et-marche.md)
- [2026-09-30 — Photos vues de dos, comme sur une vitre dépolie (0.012.0)](claude/picti/2026-09-30-photos-de-dos-vitre.md)
- [2026-09-30 — Couleurs inversées : la couleur, récompense de la chasse (0.013.0)](claude/picti/2026-09-30-couleurs-inversees.md)
- [2026-09-30 — Capture à moins de 5 m, photo qui ne bouge plus (0.013.1)](claude/picti/2026-09-30-capture-5m-ancrage.md)
