# PICTI — le géocadrage

> Redécouvrir chaque photo **à l'endroit précis et sous l'angle exact** où elle a été prise.

PICTI associe géotaggage et réalité augmentée : chaque photo est marquée de la position
GPS, du cap et de l'inclinaison de l'objectif au moment du déclenchement (le
**géocadrage**), puis « flotte » dans l'espace augmenté de l'application. De retour sur
les lieux, on la voit de biais et au loin, on s'approche de l'axe de la prise de vue… et
une fois au point de vue exact, le téléphone devient une **fenêtre sur le passé** : la
photo se reconnecte à son hors-champ.

Concept imaginé par Yannick Devin et Denis Servais (présentation, storyboard, analyse
fonctionnelle et maquettes V2 dans le Google Drive du projet).

## Prototype v0.1 — ce qui fonctionne

Application web mobile (PWA) utilisable dans le navigateur d'un smartphone :

| Service | Écran | Détail |
| --- | --- | --- |
| **Géocadrage en direct** | Accueil (viseur) | Le déclencheur rouge fige l'image de la caméra et enregistre position GPS (lissée), cap, inclinaison et roulis. |
| **Selfie géocadré** | Accueil → bouton caméra | Caméra avant : on géocadre l'objectif avant (cap retourné). Le selfie se retrouve comme toute photo, en visant depuis la place du téléphone l'endroit où posait son auteur. |
| **Géocadrage en différé (EXIF)** | « + » → Importer | Une photo de smartphone contenant position **et** direction (`GPSImgDirection`) est géocadrée automatiquement. |
| **Géocadrage en différé (sur place)** | Recaler | Pour les photos sans direction ou sans GPS : sur le lieu, on superpose le cliché (transparence + cadrage/focale) au décor réel, puis « Géocadrer ici ». |
| **Chasse in situ** | Chasser | Guidage vers le point de vue (distance, direction), photo projetée en perspective dans la vue caméra, jauges cap/inclinaison ; alignement tenu 1,5 s ⇒ photo **capturée**. |
| Profil, Mes chasses | Menu | Photos géocadrées, captures, photos à recaler. |
| À proximité, Recherche | Rail de droite | Photos triées par distance avec flèche de direction ; filtres par type. |

| **Viseur augmenté** | Accueil | Les photos géocadrées autour de soi (150 m) flottent à leur place et **y restent quand on se déplace** ; pour un même endroit, **la plus récente est devant** et la frise permet de remonter vers les plus anciennes. |
| **Carte du monde** | Bouton repère / Menu | Carte type Google Maps (MapLibre + OpenFreeMap) : photos **regroupées** de loin (vignette = la plus récente, compteur), **position exacte** en zoomant ; fiche du groupe de la plus récente à la plus ancienne ; carte **orientable** (deux doigts), bouton boussole pour remettre le nord en haut. |
| Enregistrer une photo | Détail | Gratuit pour ses propres photos, **PICTI Premium** pour celles des autres. |

Sur ordinateur (sans boussole), la chasse passe en **mode démo** : on se place au point de
vue et on regarde autour de soi en faisant glisser l'image.

**Réseau social (v0.2, Supabase)** : un compte est obligatoire. Chaque photo géocadrée est
publiée — **publique** par défaut, ou réservée aux **amis**, ou **privée** — et quiconque passe
au même endroit la voit apparaître dans « À proximité » et peut la chasser. Amis ajoutés par
code, *chasseurs* (ceux qui ont capturé mes photos) et *proies* (ceux dont j'ai capturé les
photos). Le géocadrage en direct est gratuit ; sont réservés à **PICTI Premium** :
l'enregistrement des photos des autres (`SAVE_OTHERS_PREMIUM_REQUIRED`) et le géocadrage en
différé (`DIFFERE_PREMIUM_REQUIRED`, également refusé par la base aux comptes gratuits) — voir
`src/config.ts` ; le plan d'un compte est la colonne `profiles.plan` (`free` / `premium`).
On passe en Premium par paiement (à venir) ou avec un **code** (profil → « J'ai un code »),
vérifié côté serveur (codes hachés, 5 essais par heure).

## Démarrer

```bash
npm install
npm run dev          # http://localhost:5173 (caméra OK sur localhost)
```

**Tester sur un téléphone** : caméra, GPS et boussole exigent HTTPS.

```bash
npm run dev:https    # sert l'app en HTTPS sur le réseau local (certificat auto-signé)
```

**Version en ligne** : https://picti.vercel.app (création de compte à la première ouverture).

En local, ouvrir `https://<ip-de-l-ordinateur>:5173` depuis le téléphone (même Wi-Fi), accepter le
certificat, puis autoriser caméra, position et — sur iPhone — « mouvement et orientation »
(bouton **Activer la boussole**). On peut aussi déployer tel quel sur Vercel (site
statique, `npm run build` → `dist/`).

Numéro de version au format x.xxx.x (ex. 0.008.1), visible en bas du menu.
Quand une nouvelle version est en ligne, l'app affiche « Nouvelle version de PICTI
disponible » ; le menu propose aussi un bouton **Recharger** (utile depuis l'écran d'accueil
de l'iPhone, où Safari n'affiche pas de bouton de rechargement).

| Script | Rôle |
| --- | --- |
| `npm run dev` / `dev:https` | Serveur de développement |
| `npm run build` | Vérification TypeScript + build de production |
| `npm test` | Tests unitaires (Vitest) du moteur de géocadrage |
| `npm run lint` | Lint (oxlint) |

## Comment marche le géocadrage

- **Orientation** (`src/geo/orientation.ts`) : les angles W3C `alpha/beta/gamma` sont
  convertis en base caméra (avant, droite, haut) dans le repère Est-Nord-Haut, puis en cap /
  inclinaison / roulis. Sur iOS, les mouvements viennent du gyroscope (`alpha`, sans retard) et
  son écart avec le nord de `webkitCompassHeading` n'est recalé que lentement, téléphone stable et
  objectif proche de l'horizon (`src/geo/heading.ts`) : la boussole, bruitée et en retard quand on
  tourne, faisait traîner les photos derrière le téléphone.
- **Plan-photo** (`src/geo/projection.ts`) : la photo est un rectangle placé devant le point
  de vue, à la « distance du sujet » (réglable, 6 m par défaut), orienté comme l'objectif et
  dimensionné d'après sa focale équivalente 24×36. Ses coins sont projetés dans la caméra du
  spectateur, et une homographie (CSS `matrix3d`) déforme l'image en conséquence. Vu du point
  de vue exact, le plan-photo recouvre parfaitement le décor. En s'éloignant, il rapetisse plus
  vite que ne le voudrait la seule perspective (`displayScale`) : la photo paraît lointaine (à
  20 m, environ 12 % de la largeur de l'écran au lieu de 37 %) et garde de très loin une hauteur
  minimale de 5°.
- **Alignement** (`src/geo/alignment.ts`) : distance au point de vue, écarts de cap,
  d'inclinaison et de roulis, score global et consignes de guidage.
- **Photo ancrée dans le décor** (`src/geo/alignment.ts`, `viewerEye`) : la projection part
  toujours de la position réelle du spectateur, même tout près du point de vue ; quand on se
  déplace, la photo reste à sa place (elle se décale, grandit, rapetisse, disparaît une fois
  dépassée — vue de dos, elle n'est pas affichée). L'altitude GPS, trop imprécise, est ignorée.
- **Suivi de la position** (`src/geo/tracking.ts`, `src/geo/motion.ts`) : filtre de Kalman
  « vitesse constante » sur le GPS ; entre deux relevés (un par seconde), la position avance à
  la vitesse de marche et les corrections sont amorties à l'écran (`useLivePosition`).
  L'accéléromètre compte les pas (au moins trois rebonds réguliers : viser, lever ou tourner le
  téléphone n'est pas marcher). À l'arrêt, plus d'élan, le GPS rattrape son retard quelques
  instants ; ensuite la position est tenue (une photo à 6 m se décalerait de près de 30° pour
  3 m de dérive du GPS) : seul un écart moyen qui persiste (4 m, ou la moitié de la précision,
  pendant quelques secondes) est rattrapé ; un saut confirmé ou une vitesse de véhicule sont
  suivis. Sans accéléromètre, la vitesse GPS dit si l'on bouge. Le viseur affiche la distance à
  la photo visée ; « · marche » sur la pastille GPS quand les pas sont détectés.
- **Précision GPS et recalage** : un téléphone n'est précis qu'à quelques mètres. En chasse,
  quand la photo est alignée (sur place, bonne orientation, téléphone immobile) juste avant
  sa capture, l'écart restant avec le point de vue est attribué au GPS
  (`useSpotCalibration`) : la photo se confond avec le décor, puis garde sa place si l'on
  bouge.

## Architecture

```
src/
  geo/        moteur pur et testé : géodésie, orientation, optique, projection, alignement, EXIF
  sensors/    hooks React : caméra, géolocalisation, orientation
  data/       modèle, client Supabase, store (photos, amis, captures), pipeline de création/import
supabase/migrations/  schéma, règles d'accès (RLS), recherche à proximité, stockage
  screens/    écrans (Accueil, Import, Profil, Mes chasses, Détail, Chasse, Recaler…)
  components/ icônes, boutons, feuilles, notifications
```

## Limites connues

- Le GPS a environ une seconde de retard : en se mettant à marcher, la photo « traîne » un
  instant avant de reprendre sa place. Les photos des autres peuvent être décalées de
  l'écart entre les GPS des deux prises (quelques mètres), corrigé au moment de la capture.
- Précision GPS de 5 à 10 m : la présentation de 2018 prévoyait balises BLE puis Galileo ;
  aujourd'hui, le positionnement visuel (VPS, p. ex. ARCore Geospatial API) donne une
  précision sub-métrique — piste pour une future version native.
- Cap magnétique (boussole) et cap EXIF (souvent vrai nord) ne sont pas corrigés de la
  déclinaison (≈ 0 à 2° en France).
- Champ de vision de la caméra supposé équivalent à un 26 mm (module principal) ; les
  photos EXIF sans inclinaison sont supposées horizontales.
- Application verrouillée en portrait.

## Feuille de route

1. **Réseau social** (Supabase) : comptes, amis, *chasseurs* et *proies*, partage des photos
   géocadrées, notifications de proximité (« une photo de Paul vous attend ici »).
2. **Précision** : VPS / application native (ARCore, ARKit) pour un calage centimétrique.
3. **Offres** : géocadrage en direct gratuit, géocadrage en différé et analyse statistique
   (cartographie des lieux les plus photographiés) payants, pour particuliers et
   professionnels (municipalités, musées, tourisme…).
