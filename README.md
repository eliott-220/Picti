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
| **Géocadrage en direct** | Accueil (viseur) | Le déclencheur rouge fige l'image de la caméra et enregistre position GPS (lissée ; immobile, moyenne des relevés depuis l'arrêt), sa précision, cap, inclinaison et roulis. Pastille GPS orange au-delà de ±12 m ; déclencher alors fige l'image et demande « Attendre » (la photo se prend seule dès que le GPS repasse sous 12 m) ou « Prendre quand même ». |
| **Selfie géocadré** | Accueil → bouton caméra | Caméra avant : on géocadre l'objectif avant (cap retourné). Le selfie se retrouve comme toute photo, en visant depuis la place du téléphone l'endroit où posait son auteur. |
| **Géocadrage en différé (EXIF)** | « + » → Importer | Une photo de smartphone contenant position **et** direction (`GPSImgDirection`) est géocadrée automatiquement, avec la précision notée par l'appareil (`GPSHPositioningError`) quand elle existe. |
| **Géocadrage en différé (sur place)** | Recaler | Pour les photos sans direction ou sans GPS : sur le lieu, on superpose le cliché (transparence + cadrage/focale) au décor réel, puis « Géocadrer ici ». |
| **Chasse in situ** | Chasser | Guidage vers le point de vue (distance, direction), photo projetée en perspective dans la vue caméra (une carte, jamais plein écran), jauges cap/inclinaison ; à moins de 5 m du point de vue, « Capturer » (ou l'alignement tenu) : on ne bouge plus, la photo s'agrandit en 2 s jusqu'à couvrir l'écran en prenant ses couleurs ⇒ **capturée** à 100 % (marcher ou tourner le téléphone annule). |
| Profil, Mes chasses | Menu | Photos géocadrées, captures, photos à recaler. |
| À proximité, Recherche | Rail de droite | Photos triées par distance avec flèche de direction ; filtres par type. |

| **Viseur augmenté** | Accueil | Les photos géocadrées autour de soi (150 m) flottent à leur place, comme des **cartes** (cadre blanc, taille plafonnée), et **y restent quand on se déplace** ; pour un même lieu (5 m, jusqu'à 10 m selon le GPS, et même direction), **la plus aimée est devant** (une photo de moins de 24 h passe en tête) ; la frise et le glissement font défiler la pile, les points ouvrent la **galerie du lieu**. Appui sur une photo : sa **fiche** (à moins de 5 m, la photo d'un autre se **capture**, puis sa fiche monte en feuille) ; après une prise de vue, **miniature** 5 s dans le coin (appui = sa fiche). |
| **Carte du monde** | Bouton repère / Menu | Carte type Google Maps (MapLibre + OpenFreeMap) : photos **regroupées** de loin (vignette = la plus aimée, compteur), **position exacte** en zoomant ; fiche du groupe des plus aimées aux moins aimées, avec cœurs ; carte **orientable** (deux doigts), bouton boussole pour remettre le nord en haut ; filtre **Monde / Amis** (toutes les photos visibles, ou seulement les miennes et celles de mes amis). |
| **Visibilité** | Accueil, Import, Moi, Détail | Nouvelles photos **réservées aux amis** par défaut (réglable dans Moi) ; pastille au-dessus du déclencheur (Amis / Public / Privé) pour la prochaine photo, même choix pour un lot importé ; modifiable après coup dans le détail. |
| **Likes** | Fiche, viseur, carte | Cœur et nombre de likes ; **capturer une photo = l'aimer sur place** (cœur épinglé) ; l'auteur voit qui l'a aimée. |
| **Notifications** | Cloche (accueil) | « Paul a capturé votre photo », « Paul et 4 autres aiment votre photo » (likes regroupés), en temps réel. |
| **Fiche d'une photo** | Appui sur une photo, partout | La photo **en grand** (plein écran, pile du lieu glissable), puis en descendant : Chasser / Revoir in situ, Reproduire, Enregistrer ; **l'auteur** (→ son profil public, bouton d'amitié) ; **« Prise le mardi 6 octobre 2026 à 14 h 32 »** (et la date d'ajout pour une photo importée) ; les **photos liées** : « **Au fil du temps** » (l'originale puis ses reproductions par date de prise, avant / après) ou « **D'après la photo de …** » (l'originale d'une reproduction) ; mes réglages ; détails techniques repliés. Juste après une capture, elle monte **en feuille** par-dessus la caméra (on la redescend pour contempler la photo in situ). |
| **Profil public** | Auteur d'une photo, noms | Nom, ville, « Sur PICTI depuis … », **bouton d'amitié** (Ajouter / Demande envoyée / Accepter / Amis ✓) et ses photos que j'ai le droit de voir — jamais son code ami ni son offre. |
| **Reproductions** | Après une capture, Fiche | **Reproduire cette photo** : la caméra avec l'originale en calque et deux petites croix à superposer pour retrouver son orientation (0.016.1). Distance et alertes GPS restent distinctes. Toute photo prise dans la même vue (même lieu, même direction) en devient une **version** (↻) : sa fiche montre l'originale et un curseur **avant / après**. |
| **Galerie d'un lieu** | Points d'une pile | Toutes les photos du lieu, triées par likes, date d'ajout ou date de prise. |
| **Amis** | Moi › Mes amis | **Lien d'invitation** (`#/ami/<code>`, à partager ou en **QR code**), ajout par code ou **par nom** ; demandes à accepter (pastille sur le menu), retrait. |
| Enregistrer une photo | Fiche | Gratuit pour ses propres photos, **PICTI Premium** pour celles des autres. |

Sur ordinateur (sans boussole), la chasse passe en **mode démo** : on se place au point de
vue et on regarde autour de soi en faisant glisser l'image.

**Réseau social (v0.2, Supabase)** : un compte est obligatoire. Chaque photo géocadrée est
publiée — réservée aux **amis** par défaut (depuis 0.014.0), **publique** ou **privée** — et
ceux qui ont le droit de la voir la découvrent sur place (« À proximité ») et peuvent la chasser.
Amis ajoutés par lien d'invitation, QR code, code ou nom, *chasseurs* (ceux qui ont capturé mes
photos) et *proies* (ceux dont j'ai capturé les photos). Le géocadrage en direct est gratuit ; sont réservés à **PICTI Premium** :
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
- **Reproduire — deux croix** (`src/geo/reproduceOrientation.ts`, `ReproduceCrosshairs`) : cible optique enregistrée projetée dans la base caméra, sans GPS. Croix fixe blanche et cible jaune ; flèche au bord hors champ, consigne de rotation derrière, repli à l’œil sans mesure valide récente. Verdict sur la mesure avant lissage (6° / 6° / 12° dans le repère caméra), distinct du rattachement `sameView` (20° / 15°, sans roulis). Viseur mesuré hors commandes, recadrage vidéo et miroir selfie partagés avec le calque.
- **Alignement** (`src/geo/alignment.ts`) : distance au point de vue, écarts de cap,
  d'inclinaison et de roulis, score global et consignes de guidage.
- **Photo ancrée dans le décor** (`src/geo/alignment.ts`, `viewerEye`) : la projection part
  toujours de la position réelle du spectateur, même tout près du point de vue ; quand on se
  déplace, la photo reste à sa place (elle se décale, grandit, rapetisse ; vue de dos, elle
  reste visible comme sur une vitre dépolie). L'altitude GPS, trop imprécise, est ignorée.
- **Photo « carte »** (`src/geo/projection.ts`, depuis 0.014.0) : sa taille à l'écran est
  plafonnée (`CARD_MAX` : 60 % de la largeur, 45 % de la hauteur), réduite autour de son centre
  projeté sans changer de place ni d'orientation — en se promenant, elle ne remplit jamais
  l'écran. À moins de 2 m de son plan (des deux côtés), elle se floute et s'efface
  (`panelProximityFade`) : invisible sous 0,5 m, plus de disparition sèche quand on la traverse.
- **Capture** (`src/geo/capture.ts`, `useCapture`) : à moins de 5 m du point de vue, la photo
  visée s'agrandit en 2 s jusqu'à couvrir l'écran pendant que la couleur l'envahit ; elle n'est
  capturée qu'à 100 %. Deux pas, un écart de plus de ~10° du cap ou de l'inclinaison, ou la
  photo hors de l'écran annulent : elle revient à sa place, rien n'est enregistré.
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
  **Moyenne à l'arrêt** (depuis 0.15.2) : immobile depuis 2 s, la position est la moyenne
  pondérée (1 / précision²) des relevés depuis l'arrêt, pris pendant au plus 10 s, puis tenue
  comme ci-dessus — la photo est enregistrée à cette position, celle qui est affichée. Pas après
  une marche comptée pas à pas : les pas, plus justes que le GPS sur quelques mètres, sont gardés.
  Sur iPhone, une précision qui reste au-delà de 100 m pendant 15 s (réglage « position
  approximative ») fait afficher, une fois, où activer « Position exacte ».
- **Précision GPS et recalage** : un téléphone n'est précis qu'à quelques mètres. En chasse,
  quand la photo est alignée (sur place, bonne orientation, téléphone immobile) juste avant
  sa capture, l'écart restant avec le point de vue est attribué au GPS
  (`useSpotCalibration`) : la photo se confond avec le décor, puis garde sa place si l'on
  bouge.

## Architecture

```
src/
  geo/        moteur pur et testé : géodésie, orientation, optique, projection, alignement, suivi GPS,
              lieux et vues, mode « Reproduire » (reproduce.ts), EXIF
  sensors/    hooks React : caméra, géolocalisation, orientation
  data/       modèle, client Supabase, store (photos, amis, captures), pipeline de création/import
supabase/migrations/  schéma, règles d'accès (RLS), recherche à proximité, stockage
supabase/propositions/ SQL proposé, pas encore appliqué (à valider avant)
  screens/    écrans (Accueil, Import, Profil, Mes chasses, Fiche d'une photo, Profil public, Chasse, Recaler…)
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
- Champ de vision de la caméra : 26 mm supposés jusqu'à ce qu'il soit **mesuré** (quelques
  balayages du téléphone suffisent, `src/geo/focalCalibration.ts`) ; les photos EXIF sans
  inclinaison sont supposées horizontales.
- Application verrouillée en portrait.

## Feuille de route

1. **Réseau social** (Supabase) : comptes, amis, *chasseurs* et *proies*, partage des photos
   géocadrées, notifications de proximité (« une photo de Paul vous attend ici »).
2. **Précision** : VPS / application native (ARCore, ARKit) pour un calage centimétrique.
3. **Offres** : géocadrage en direct gratuit, géocadrage en différé et analyse statistique
   (cartographie des lieux les plus photographiés) payants, pour particuliers et
   professionnels (municipalités, musées, tourisme…).
