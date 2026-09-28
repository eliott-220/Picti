# 2026-09-28 — Reprise du projet PICTI et prototype v0.1

Projet : [PICTI](../../CLAUDE.md) · Dépôt `eliott-220/picti` · Branche `claude/upbeat-bell-330fij`

## Demande

« Continue le projet PICTI. »

## Point de départ

- Dépôt GitHub vide (un `.gitignore` orienté Node/Vite/Vercel), aucune issue ni PR.
- Contexte retrouvé dans le Google Drive du projet : présentation complète (42 p.),
  présentation simplifiée, storyboard « Guide de fonctionnement », carte mentale de
  l'application, maquettes d'écrans V2, ancien APK de démo.
- Rien de lié à PICTI dans Notion, Lovable, Vercel ni Supabase.

## Décisions

- **Application web mobile (PWA)** Vite + React + TypeScript : testable immédiatement sur
  n'importe quel smartphone, déployable sur Vercel, sans passer par les stores.
- **Local d'abord** (IndexedDB) : le cœur du géocadrage fonctionne sans serveur ; le social
  (comptes, chasseurs/proies, partage) viendra avec un backend (Supabase pressenti).
- **Modèle « plan-photo »** : la photo est un rectangle orienté placé devant le point de vue,
  projeté par homographie (CSS `matrix3d`) — reproduit fidèlement le storyboard (photo de
  biais et lointaine, puis trompe-l'œil au point de vue exact).
- **GPS imprécis (5–10 m)** : une fois sur place, l'œil est calé sur le point de vue ; la
  parallaxe revient progressivement en s'éloignant.
- Charte des maquettes V2 : rouge `#eb0c0c`, saumon `#ff8484`, cartes arrondies, police Outfit.

## Réalisé

- Moteur `src/geo/` : géodésie (ENU, cap, fusion GPS), orientation (W3C → cap/inclinaison/
  roulis, recalage boussole iOS), optique (focale 24×36 ↔ champ de vision), projection +
  homographie, alignement et consignes, lecture EXIF.
- Écrans : Bienvenue (première connexion), Accueil-viseur (géocadrage en direct), Import
  (différé EXIF), Recaler (différé sur place), Chasse in situ (AR + capture), Profil,
  Mes chasses, Détail photo, À proximité, Recherche ; mode démo sans capteurs.
- PWA : manifeste, icônes générées à partir du logo.
- README (usage, principe, limites, feuille de route) et CLAUDE.md du projet.

## Vérifications

- `npm test` : 48 tests unitaires verts (géométrie, EXIF, routeur).
- `npm run lint` : 0 avertissement ; `npm run build` : OK.
- Scénario de bout en bout dans Chromium (caméra simulée, GPS et boussole injectés) :
  première connexion → photo géocadrée en direct → profil → détail → chasse désalignée
  (« Tournez-vous vers la droite ») → alignée → « Capturée ! » → import de 3 photos
  (1 auto, 2 à recaler) → recalage sur place → À proximité → Recherche → chasse à 150 m
  (« Point de vue à 150 m vers le N »), sans erreur JavaScript. Mode démo vérifié aussi.
- **Pas encore testé sur un vrai téléphone** : c'est le prochain test indispensable
  (sens des angles iOS/Android, focale réelle de la caméra).

## Prochaines étapes

1. Test terrain iPhone + Android (`npm run dev:https` ou déploiement Vercel).
2. Backend Supabase : comptes, amis, chasseurs/proies, partage, notifications de proximité.
3. Calibration de la focale caméra par appareil ; correction de déclinaison magnétique.
4. Piste précision : VPS (ARCore Geospatial API) / application native.

## Suite : ouvrir l'app sur iPhone

- Question : « comment l'ouvrir sur mon iPhone ».
- Mise en ligne sur Vercel : projet `picti`, adresse https://picti.vercel.app, build OK
  (commit `846befd`). Protection Vercel Authentication sur **toutes** les adresses
  (y compris la production) : il faut se connecter à son compte Vercel dans Safari.
- Réglages iPhone utiles : autoriser caméra et position dans Safari, activer « Position
  exacte » pour les sites Safari, puis bouton « Activer la boussole » dans l'app.
- À faire si besoin : rendre l'adresse publique pour la partager (Yannick, Denis), ou relier
  le dépôt GitHub au projet pour redéployer à chaque push.

## Suite : réseau social avec Supabase (v0.2)

- Demande : publier les photos pour que les autres utilisateurs les retrouvent sur place.
- Décisions d'Eliott : photos **publiques par défaut**, option « amis uniquement » ou
  « privée » par photo ; géocadrage en direct gratuit, import (différé) **payant plus tard** ;
  **compte obligatoire**.
- Réalisé :
  - Projet Supabase `picti` (Paris, offre gratuite) : profils, amitiés, photos, captures,
    recherche `nearby_photos` (500 m), bucket privé `photos` ; tout protégé par RLS ;
    alertes de sécurité Supabase : aucune.
  - App : écran de création de compte / connexion, publication à la prise de vue, photos
    des autres dans « À proximité » (pastille sur le bouton), choix de visibilité, amis par
    code à 6 caractères, chasseurs et proies réels, déconnexion, verrou Premium prêt
    (désactivé) pour le différé.
- Vérifié : 14 scénarios de règles d'accès testés en base (visibilité, amis, proximité,
  captures, images) puis annulés ; 52 tests unitaires ; build OK. Test de l'app contre
  Supabase impossible depuis l'environnement cloud (réseau bloqué) : à tester sur iPhone.
- À régler par Eliott dans Supabase : Authentication → URL Configuration → Site URL =
  https://picti.vercel.app (sinon le lien de confirmation renvoie vers localhost).

## Suite : carte du monde, photos empilées, Premium (v0.3)

- Demandes d'Eliott : enregistrer la photo des autres est **payant** ; **carte du monde**
  navigable (type Google Maps) avec les photos du monde entier, **groupées** de loin (de la
  plus récente à la plus ancienne) puis à leur **position exacte** en zoomant ; en **mode
  caméra**, pour des photos prises au même endroit, **la plus récente devant**, avec
  défilement vers les plus anciennes.
- Réalisé :
  - Supabase : RPC `photos_in_bounds` (zone visible, antiméridien géré, RLS appliquée).
  - Carte : MapLibre + OpenFreeMap, Supercluster (vignette = la plus récente + compteur),
    fiche du groupe triée, « Zoomer ici », « Chasser », ma position, lien vers la liste.
  - Caméra : viseur augmenté sur l'accueil (photos à moins de 150 m, regroupées par lieu de
    10 m) avec frise ‹ › / glissement ; même frise dans l'écran de chasse.
  - Enregistrer sur le téléphone : gratuit pour ses photos, Premium pour celles des autres
    (verrou actif) ; différé toujours gratuit pendant l'essai.
- Vérifié : 56 tests unitaires, requête SQL testée (monde, zone, antiméridien, photo privée
  exclue) ; parcours complet dans Chromium avec un faux Supabase (frise 1/3→3/3, chasse,
  carte groupée 7 → 4 → 3 photos, tri, verrou Premium). Fond de carte réel non visible depuis
  l'environnement cloud (réseau bloqué) : à vérifier sur iPhone.

## Suite : Premium par code administrateur (v0.4)

- Demande : seconde option de paiement — saisir un code (mot de passe administrateur) qui
  passe le compte directement en Premium.
- Réalisé : RPC `redeem_premium_code` (vérification côté serveur, code haché bcrypt dans le
  schéma privé, 5 essais par heure et par compte), encart « PICTI Premium » dans le profil et
  sur les verrous (paiement « bientôt », « J'ai un code »). Un code administrateur a été créé
  et communiqué à Eliott dans la discussion (jamais écrit dans le dépôt).
- Vérifié en base : mauvais code refusé, bon code accepté (minuscules/espaces tolérés),
  impossible de modifier son plan soi-même, 6e essai bloqué ; parcours testé dans Chromium.

## Suite : fin de l'essai gratuit, mises à jour (v0.5)

- Demandes : les outils Premium ne sont plus disponibles en version d'essai, seulement après
  activation (paiement ou code) ; remettre un bouton pour recharger l'app, avec une
  notification de mise à jour.
- Réalisé : `DIFFERE_PREMIUM_REQUIRED = true` (import et recalage sur place verrouillés,
  encart Premium avec « J'ai un code ») ; déclencheur Supabase `photos_differe_premium` qui
  refuse le passage en mode différé pour un compte gratuit (anciennes photos toujours
  modifiables) ; `version.json` publié à chaque build, bannière « Nouvelle version de PICTI
  disponible » + « Mettre à jour », bouton « Recharger » et numéro de version dans le menu.
- Vérifié : en base (gratuit refusé, Premium accepté, ancienne photo renommable) ; dans
  Chromium (import verrouillé, bouton Recharger, bannière après publication d'une version).

