# 2026-09-28 — Numéro de version x.xxx.x

Projet : [PICTI](../../CLAUDE.md) · Dépôt `eliott-220/picti` · Branche `claude/beautiful-edison-87l36d`
(suite de [Photos d'un même endroit empilées](2026-09-28-photos-empilees.md))

## Demande

« Mets les versions sous forme de numéro, c'est plus simple, avec des x.xxx.x. »

## Règle retenue

- Format affiché **x.xxx.x** : `0.008.1`.
  - 1er chiffre : grande version (passera à 1 pour la sortie officielle) ;
  - 3 chiffres du milieu : nouvelle fonctionnalité ;
  - dernier chiffre : correction ou petit ajustement.
- Source unique : champ `version` de `package.json`, en semver (`0.8.1`), converti à
  l'affichage (`src/data/versionNumber.ts`, testé). npm refuse les zéros en tête : d'où la
  conversion plutôt que d'écrire `0.008.1` dans `package.json`.
- La détection de mise à jour compare toujours le commit (`version.json`) : un oubli
  d'incrément ne casse pas la notification.
- Historique renuméroté : 0.001.0 (prototype) … 0.007.0 (selfies), 0.008.0 (photos empilées),
  **0.008.1** (cette version).

## Réalisé

- `package.json` / `package-lock.json` : version `0.8.1`.
- `vite.config.ts` : lit la version de `package.json`, l'injecte (`__APP_NUMBER__`) et la
  publie dans `version.json` (`number`).
- Menu : « Version 0.008.1 · date » (au lieu du code de commit).
- Notification : « Nouvelle version de PICTI disponible : 0.009.0 ».
- `CLAUDE.md` : règle d'incrément à chaque livraison, historique renuméroté.

## Vérifications

- `npm test` (64 verts), `npm run lint`, `npm run build` : OK ; `dist/version.json` contient
  `"number": "0.8.1"`.
