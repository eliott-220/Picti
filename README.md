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
| **Géocadrage en différé (EXIF)** | « + » → Importer | Une photo de smartphone contenant position **et** direction (`GPSImgDirection`) est géocadrée automatiquement. |
| **Géocadrage en différé (sur place)** | Recaler | Pour les photos sans direction ou sans GPS : sur le lieu, on superpose le cliché (transparence + cadrage/focale) au décor réel, puis « Géocadrer ici ». |
| **Chasse in situ** | Chasser | Guidage vers le point de vue (distance, direction), photo projetée en perspective dans la vue caméra, jauges cap/inclinaison ; alignement tenu 1,5 s ⇒ photo **capturée**. |
| Profil, Mes chasses | Menu | Photos géocadrées, captures, photos à recaler. |
| À proximité, Recherche | Rail de droite | Photos triées par distance avec flèche de direction ; filtres par type. |

Sur ordinateur (sans boussole), la chasse passe en **mode démo** : on se place au point de
vue et on regarde autour de soi en faisant glisser l'image.

**Réseau social (v0.2, Supabase)** : un compte est obligatoire. Chaque photo géocadrée est
publiée — **publique** par défaut, ou réservée aux **amis**, ou **privée** — et quiconque passe
au même endroit la voit apparaître dans « À proximité » et peut la chasser. Amis ajoutés par
code, *chasseurs* (ceux qui ont capturé mes photos) et *proies* (ceux dont j'ai capturé les
photos). Le géocadrage en direct est gratuit ; le géocadrage en différé (import) est prévu
payant (`DIFFERE_PREMIUM_REQUIRED` dans `src/config.ts`).

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

| Script | Rôle |
| --- | --- |
| `npm run dev` / `dev:https` | Serveur de développement |
| `npm run build` | Vérification TypeScript + build de production |
| `npm test` | Tests unitaires (Vitest) du moteur de géocadrage |
| `npm run lint` | Lint (oxlint) |

## Comment marche le géocadrage

- **Orientation** (`src/geo/orientation.ts`) : les angles W3C `alpha/beta/gamma` sont
  convertis en base caméra (avant, droite, haut) dans le repère Est-Nord-Haut, puis en cap /
  inclinaison / roulis. Sur iOS, le cap est recalé en continu sur `webkitCompassHeading`.
- **Plan-photo** (`src/geo/projection.ts`) : la photo est un rectangle placé devant le point
  de vue, à la « distance du sujet » (réglable, 6 m par défaut), orienté comme l'objectif et
  dimensionné d'après sa focale équivalente 24×36. Ses coins sont projetés dans la caméra du
  spectateur, et une homographie (CSS `matrix3d`) déforme l'image en conséquence. Vu du point
  de vue exact, le plan-photo recouvre parfaitement le décor.
- **Alignement** (`src/geo/alignment.ts`) : distance au point de vue, écarts de cap,
  d'inclinaison et de roulis, score global et consignes de guidage.
- **Précision GPS** : un téléphone n'est précis qu'à quelques mètres. Une fois « sur place »
  (dans le rayon de précision), la projection cale l'œil sur le point de vue exact — seule
  l'orientation compte — puis réintroduit la parallaxe en s'éloignant.

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
