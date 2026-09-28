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

