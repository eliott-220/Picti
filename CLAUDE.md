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

- Vite + React 19 + TypeScript, PWA statique (routage par ancre `#/…`), données locales IndexedDB.
- `src/geo/` = moteur pur, couvert par Vitest : **toute modification de la géométrie doit
  garder `npm test` vert**. Repère monde ENU (x Est, y Nord, z Haut) ; caméra = base
  (f avant, r droite, u haut) ; angles en degrés.
- Commandes : `npm run dev`, `npm run dev:https` (test sur téléphone), `npm test`,
  `npm run lint`, `npm run build` (inclut `tsc -b`).
- Conventions : identifiants en anglais, commentaires et UI en français, pas de point-virgule,
  guillemets simples.

## État et suite

- v0.1 (sept. 2026) : prototype complet local (direct, différé EXIF, recalage sur place,
  chasse AR avec capture, profil, chasses, proximité, recherche, mode démo).
- Prochaines étapes : backend Supabase (comptes, amis, chasseurs/proies, partage,
  notifications de proximité) ; test terrain sur iPhone et Android ; calibration de la
  focale caméra ; piste VPS/native pour la précision.

## Journal des discussions

- [2026-09-28 — Reprise du projet et prototype v0.1](claude/picti/2026-09-28-prototype-v0.1.md)
