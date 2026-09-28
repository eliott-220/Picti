# 2026-09-28 — Mettre à jour l'app installée sur l'écran d'accueil

Projet : [PICTI](../../CLAUDE.md) · Dépôt `eliott-220/picti` · Branche `claude/practical-brahmagupta-qww1yp`
(repartie de `claude/upbeat-bell-330fij`, qui porte l'app et alimente Vercel)

## Demande

« Si je crée un raccourci sur l'écran d'accueil, comment mettre l'appli à jour à chaque
modification ? » puis : « crée une sorte de notification, et dans les paramètres ajoute un
petit bouton recharger / mettre à jour ».

## Réponse

- Le raccourci ouvre https://picti.vercel.app ; pas de service worker, donc chaque chargement
  prend la version en ligne. Mettre à jour = redéployer sur Vercel.
- Le projet Vercel `picti` n'est pas relié au dépôt GitHub (déploiements via l'API) : pour un
  déploiement automatique à chaque push, le relier dans Vercel → Settings → Git et choisir la
  branche de production.
- Une app de l'écran d'accueil reste en mémoire et ne se recharge pas seule : d'où la
  détection ci-dessous.

## Réalisé

- `vite.config.ts` : chaque build reçoit un identifiant (date ISO), embarqué dans l'app
  (`__BUILD_ID__`) et publié dans `dist/version.json`.
- `src/update.ts` : compare la version embarquée à `/version.json` au lancement, à chaque retour
  au premier plan et toutes les 5 min (production seulement).
- `src/components/UpdateBanner.tsx` : bandeau « Nouvelle version de PICTI disponible —
  Mettre à jour » (fermable), visible sur tous les écrans, y compris la connexion.
- Menu (`MenuSheet`) : encart « Application » avec la date de la version et un bouton
  « Recharger », qui devient « Mettre à jour » en rouge quand une version plus récente existe.

## Vérifications

- `npm test` (52 verts), `npm run lint`, `npm run build` : OK.
- Chromium sur le build (`vite preview`) : pas de bandeau au départ ; après changement de
  `version.json` et retour au premier plan simulé, le bandeau apparaît ; « Mettre à jour »
  recharge et le bandeau disparaît ; aucune erreur JS.
- Encart du menu non testé visuellement (nécessite un compte connecté).

## À faire

- Fusionner/déployer cette branche sur Vercel pour que la fonction soit en ligne.
- Relier Vercel à GitHub pour les déploiements automatiques.
