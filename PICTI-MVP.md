# PICTI — MVP (détail)

(Index du dossier : [PICTI.md](./PICTI.md) · Contexte projet : [CLAUDE.md](./CLAUDE.md))

Artifact publié : https://claude.ai/artifact/RYhVHUuM1awGHaB1h4vkx4

## Nature technique
Application web mono-fichier (HTML + CSS + JS vanilla en IIFE, sans framework ni build), pensée mobile-first (max-width 460px, safe-area-insets iOS). Police display *Fraunces*, police mono *IBM Plex Mono* (Google Fonts). Thème clair/sombre géré via `prefers-color-scheme` + attribut `data-theme`.

Aucune dépendance externe autre que les polices. Tout l'état est en mémoire JS + `localStorage` (clé `picti_plaques_v1`).

## Parcours utilisateur

### 1. Écran d'entrée
- Bouton « Entrer » qui déclenche :
  - une demande de position (`navigator.geolocation.getCurrentPosition`, puis `watchPosition` en continu),
  - une demande de permission capteurs de mouvement (`DeviceOrientationEvent.requestPermission()` sur iOS),
  - puis l'entrée dans l'app (shell à 3 onglets).
- Message rassurant : version démo locale, les plaques restent sur l'appareil.

### 2. Carnet (onglet par défaut)
- Liste des « plaques » (photos gravées), triées de la plus récente à la plus ancienne.
- Chaque plaque affiche : miniature, titre (ou « Plaque sans nom »), date, et si la position de l'utilisateur est connue : distance jusqu'à la plaque + une flèche orientée (grâce à la boussole) vers elle.
- Une plaque prise sans position GPS au moment de la capture peut être « gravée en différé » plus tard (bouton dédié qui recapture la position courante).
- État vide avec appel à l'action « Graver ma première plaque ».
- Bouton flottant (FAB) pour ouvrir la capture, visible uniquement sur l'onglet Carnet.

### 3. Capture d'une plaque
- Ouvre la caméra arrière (`getUserMedia({video:{facingMode:'environment'}}`).
- Déclencheur (shutter) qui :
  1. fige l'image sur un `<canvas>` (redimensionnée à 480px de large max, JPEG qualité 0.55) → stockée en `data:` URL,
  2. joue un effet flash,
  3. lance en parallèle la récupération de la position GPS et un délai artificiel d'1s (« développement en cours » avec barre de progression), simulant un développement photo argentique.
- Écran de confirmation : titre optionnel, méta affichées (coordonnées GPS + orientation si disponibles, ou mention que la position est indisponible et pourra être gravée en différé).
- Sauvegarde de la plaque dans `state.plaques` + `localStorage`.
- Gestion d'erreur si la caméra est indisponible.

### 4. Viseur (réalité augmentée)
- Ouvre le flux caméra en plein écran et calcule, pour chaque plaque géocadrée :
  - la **distance** (formule haversine) entre la position courante et la plaque,
  - le **cap/bearing** vers la plaque,
  - l'écart angulaire avec la boussole du téléphone (`deviceorientation` / `webkitCompassHeading`).
- Affiche la photo de la plaque en surimpression, avec une opacité et une échelle qui augmentent à mesure qu'on se rapproche et qu'on s'aligne (superposition progressive « on y est presque »).
- Une aiguille de boussole tourne en fonction de l'écart angulaire.
- Messages contextuels : « Repérage GPS… », « Trop loin… », « Avance… », « Tourne à droite/gauche », « Tu es tout près… », « Tu y es. Regarde. »
- Si plusieurs plaques géocadrées existent, navigation précédente/suivante (triées par proximité).

### 5. Profil
- Nombre total de plaques gravées.
- Statut position / boussole (active ou indisponible sur l'appareil).
- Citation thématique sur le concept du géocadrage.
- Bouton pour réinitialiser (effacer) tout le carnet local (avec confirmation).

## Limites connues du MVP
- Stockage local uniquement (par appareil/navigateur) : pas de synchronisation, pas de partage entre utilisateurs.
- Pas de backend, pas de compte.
- Boussole absolue (`deviceorientationabsolute`/`webkitCompassHeading`) pas disponible sur tous les appareils — dégradation gracieuse prévue (le viseur reste utilisable via la distance seule).
- Photos compressées en JPEG basse résolution pour tenir dans le localStorage.
