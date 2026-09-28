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
  (e-mail + mot de passe), tables `profiles`, `friendships`, `photos`, `captures`, RPC
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
- Photos d'un même endroit (rayon 10 m, `src/geo/spots.ts`) : la plus récente devant,
  frise pour remonter le temps — viseur de l'accueil (`ArSpotsLayer`) et chasse.
- `src/geo/` = moteur pur, couvert par Vitest : **toute modification de la géométrie doit
  garder `npm test` vert**. Repère monde ENU (x Est, y Nord, z Haut) ; caméra = base
  (f avant, r droite, u haut) ; angles en degrés.
- Commandes : `npm run dev`, `npm run dev:https` (test sur téléphone), `npm test`,
  `npm run lint`, `npm run build` (inclut `tsc -b`).
- Déploiement : projet Vercel `picti` (compte d'Eliott) → https://picti.vercel.app, public
  (le compte PICTI protège l'accès). Déployé depuis la branche `claude/upbeat-bell-330fij`
  via l'API Vercel.
- Mises à jour : le build publie `version.json` (commit Vercel) ; `UpdateBanner` affiche
  « Nouvelle version disponible » (vérif. au retour dans l'app et toutes les 5 min) ;
  bouton « Recharger » + version dans le menu.
- Conventions : identifiants en anglais, commentaires et UI en français, pas de point-virgule,
  guillemets simples.

## État et suite

- v0.1 (sept. 2026) : prototype complet local (direct, différé EXIF, recalage sur place,
  chasse AR avec capture, profil, chasses, proximité, recherche, mode démo).
- v0.2 : Supabase (comptes, publication des photos, photos des autres à proximité,
  visibilité publique/amis/privée, amis par code, chasseurs/proies, captures partagées).
- v0.3 : carte du monde, viseur augmenté (photos du lieu empilées), enregistrement Premium.
- v0.4 : passage en Premium par code administrateur.
- v0.5 : fin de l'essai gratuit (différé réservé à Premium, vérifié en base), notification
  de mise à jour et bouton « Recharger ».
- Fond caméra en noir et blanc (accueil, chasse, recalage) ; photos géocadrées en couleur.
- Prochaines étapes : test terrain à plusieurs ; paiement Premium ; mot de passe oublié ;
  notifications de proximité ; calibration de la focale ; piste VPS/native.

## Journal des discussions

- [2026-09-28 — Reprise du projet et prototype v0.1](claude/picti/2026-09-28-prototype-v0.1.md)
- [2026-09-28 — Fond caméra en noir et blanc](claude/picti/2026-09-28-fond-camera-noir-et-blanc.md)
