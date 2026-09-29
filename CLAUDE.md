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
  récente), RPC `photos_in_bounds`. Le processus de fond MapLibre est assemblé par Vite
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
  (`src/geo/motion.ts`, `src/sensors/motion.ts` : marche / vient de s'arrêter / immobile) ;
  à l'arrêt, les allers-retours du GPS sont amortis mais un écart **persistant** est rattrapé
  (`persistentShift` : marche non détectée, GPS en retard) — ne jamais figer la position sans
  cette porte de sortie (0.009.1 le faisait : 5 m de marche pouvaient être ignorés) ; `useLivePosition` la fait avancer à chaque image (accueil, chasse). Une
  photo prise est enregistrée à la position affichée. En chasse seulement,
  `useSpotCalibration` attribue au GPS l'écart restant quand la photo est alignée avant la
  capture (téléphone immobile), puis le fige. Photo dépassée (vue de dos) : non affichée.
- Commandes : `npm run dev`, `npm run dev:https` (test sur téléphone), `npm test`,
  `npm run lint`, `npm run build` (inclut `tsc -b`).
- Déploiement : projet Vercel `picti` (compte d'Eliott) → https://picti.vercel.app, public
  (le compte PICTI protège l'accès). Projet relié au dépôt GitHub : chaque push construit un
  aperçu ; la **production** se fait en redéployant cet aperçu avec `target: production`
  (API Vercel, `create_deployment` + `deploymentId`). **Production actuelle : 0.009.2** (`dpl_GTeorpPpLWapoMQyyV7tcW8sMFaB`, commit `f0092fc`, confirmée READY sur picti.vercel.app le 29/09/2026). Retour arrière possible : 0.009.1 (`dpl_CH3VQP2FGb3572UpwuMzskCNv7yp`) ou 0.009.0 (`dpl_EPnnkgHnE3p8ENQJr7WHPTKcco4h`). **`main` est la branche de référence** (depuis le 29/09/2026, tout le travail des branches `claude/*` y a été rassemblé) : chaque nouvelle session part de `main`. 
- Mises à jour : le build publie `version.json` (commit Vercel + numéro) ; `UpdateBanner`
  affiche « Nouvelle version de PICTI disponible : 0.009.0 » (vérif. au retour dans l'app et
  toutes les 5 min, comparaison sur le commit) ; bouton « Recharger » + numéro dans le menu.
- **Numéro de version** au format **x.xxx.x** (`src/data/versionNumber.ts`), tiré du champ
  `version` de `package.json` (écrit en semver : `0.8.1` → affiché `0.008.1`). Premier chiffre =
  grande version (1 = sortie officielle), trois du milieu = nouvelle fonctionnalité, dernier =
  correction / petit ajustement. **À chaque changement livré, augmenter `version` dans
  `package.json` (et `package-lock.json`)** : fonctionnalité → `0.9.0`, correction → `0.8.2`.
- Selfies (`photos.selfie`) : géocadrage en direct avec la caméra avant ; on enregistre
  l'orientation de l'objectif avant (`frontCameraBasis` : cap +180°, inclinaison et roulis
  inversés), focale 23 mm, image non inversée (seul l'aperçu est en miroir). Ensuite, mêmes
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
- Prochaines étapes : test terrain de l'ancrage sur iPhone (0.009.2, en ligne depuis le 29/09) ; test terrain à plusieurs ; paiement Premium ; tester « mot de passe oublié » avec un vrai e-mail (modèles d'e-mails français dans `supabase/templates/`, à coller dans Supabase ›
  Authentication › Emails ; envoi d'e-mails : SMTP intégré limité) ;
  notifications de proximité ; calibration de la focale ; piste VPS/native.

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
