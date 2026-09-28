# 2026-09-28 — Photo qui suit encore après 5 m (0.009.2)

Projet : [PICTI](../../CLAUDE.md) · Dépôt `eliott-220/picti` · Branche `claude/wonderful-dirac-opn4nb`
(suite de [Photos ancrées dans le décor](2026-09-28-photos-ancrees.md))

## Retour d'Eliott

« J'ai bougé de 5 m et la photo a suivi avec moi, elle ne s'est pas rétrécie et n'est pas
restée à sa place. »

Version réellement testée inconnue (la mise en ligne de 0.009.1 n'avait pas pu être
confirmée) : à vérifier via le numéro en bas du menu.

## Faiblesse trouvée dans 0.009.1

- À l'arrêt (accéléromètre sans pas), la position était **figée** : gain GPS très faible et
  tout écart de moins de 8 m ignoré. Si la marche n'est pas détectée (téléphone tenu très
  stable) ou si le GPS de l'iPhone met plus de ~2 s à suivre, 5 m de marche disparaissaient :
  la photo restait collée au téléphone, exactement le symptôme décrit.

## Réalisé (0.009.2)

- `src/geo/tracking.ts` : à l'arrêt, écart moyen récent du GPS (`se`, `sn`) : les
  allers-retours s'annulent (amortis), un écart **persistant** (> 2 m ou ¼ de la précision)
  est rattrapé rapidement (`persistentShift`). Plus de gel définitif. Vitesse GPS > 0,5 m/s =
  en mouvement.
- `src/geo/motion.ts` : seuil de marche abaissé (0,25 m/s² vertical), phase « vient de
  s'arrêter » 2,5 s.
- Chasse : recalage seulement si l'accéléromètre dit « immobile » (jamais sans capteur).
- Diagnostic terrain : distance à la photo visée dans la frise du viseur (« · à 5 m ») et
  « · marche » sur la pastille GPS quand les pas sont détectés.
- Version **0.009.2**.

## Vérifications

- `npm test` (92 verts, dont « rattrape un déplacement que l'accéléromètre n'a pas vu »),
  lint, build.
- Chromium : nouveau scénario « recul de 5 m non détecté, GPS en retard de 2,5 s » → la photo
  rapetisse à 622 px de large (attendu 614 ; 0.009.1 : ne bougeait pas). GPS qui saute de
  ±2,5 m à l'arrêt : 67 px de tremblement. Autres scénarios inchangés.

## Limites

- En intérieur, le GPS ne voit souvent pas 5 m (précision 15–65 m) : aucune correction
  logicielle ne peut alors suivre ; seul un suivi par la caméra (ARKit / application native)
  le permettrait.
- Mise en production : à la demande d'Eliott (la session n'a pas l'autorisation de vérifier).
