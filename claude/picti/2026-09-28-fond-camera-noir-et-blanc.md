# 2026-09-28 — Fond caméra en noir et blanc

Projet : [PICTI](../../CLAUDE.md) · Dépôt `eliott-220/picti` · Branche `claude/blissful-maxwell-want4i`
(repartie de `claude/upbeat-bell-330fij`, qui porte l'app et alimente Vercel)

## Demande

« Peux-tu passer le fond de cam en noir et blanc comme je te l'ai demandé dans d'autres
fenêtres du projet ? »

## Constat

- Une session précédente (commit `4ddf580` sur `claude/upbeat-bell-330fij`) avait passé en
  noir et blanc **seulement le viseur de l'accueil** ; la chasse et le recalage restaient en
  couleur.

## Réalisé

- Classe `mono` (`filter: grayscale(1)`, `src/styles.css`) ajoutée au flux caméra de la
  **chasse** (`src/screens/Hunt.tsx`) et du **recalage** (`src/screens/Recaler.tsx`), en plus
  de l'accueil : tout le fond caméra est en noir et blanc, les photos superposées restent en
  couleur.
- Filtre d'affichage seulement : la photo prise depuis l'accueil lit le flux brut et reste en
  couleur ; la chasse et le recalage ne capturent pas le flux vidéo.

## Vérifications

- `npm test` (56 verts), `npm run lint`, `npm run build` : OK.
- Pas testé sur téléphone ; site en ligne non joignable depuis la session (réseau).

## À faire

- Mettre en ligne sur https://picti.vercel.app (déploiement Vercel depuis cette branche, ou
  fusion dans `claude/upbeat-bell-330fij`).
