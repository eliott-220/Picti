# 2026-09-28 — Photos ancrées dans le décor (0.009.1)

Projet : [PICTI](../../CLAUDE.md) · Dépôt `eliott-220/picti` · Branche `claude/wonderful-dirac-opn4nb`
(suite de [Autorisations caméra et boussole mémorisées](2026-09-28-autorisations-memorisees.md))

## Demande

« Il y a encore des problèmes de géolocalisation : quand je me déplace avec mon téléphone,
la photo bouge avec moi, elle ne reste pas sur place ; par contre elle reste bien dans la
bonne direction. »

## Cause

- `parallaxEye` (`src/geo/alignment.ts`) plaçait l'œil **sur le point de vue** dès qu'on était
  à moins de max(8 m, précision GPS) — souvent 10 à 30 m en ville — puis comprimait la
  parallaxe sur les 25 m suivants. Seule l'orientation comptait : la photo restait dans la
  bonne direction mais accompagnait le téléphone. C'était un choix du prototype v0.1 pour
  masquer l'imprécision du GPS.
- Aussi : l'altitude GPS (très imprécise) entrait dans la position de l'œil ; la fusion GPS
  (`fuseFix`) traînait de plusieurs mètres en marchant et suivait la dérive à l'arrêt.

## Réalisé

- **Œil = position réelle du spectateur** (`viewerEye`), altitude ignorée ; une photo dépassée
  (vue de dos) n'est plus affichée (`facesViewer`).
- **Suivi de la position** `src/geo/tracking.ts` (filtre de Kalman « vitesse constante ») et
  **détection de la marche** `src/geo/motion.ts` (composante verticale de l'accéléromètre :
  le rebond des pas, pas le balayage quand on tourne sur soi-même ; `src/sensors/motion.ts`) :
  - en marche : suit le GPS et avance entre deux relevés (`useLivePosition`, à chaque image) ;
  - à l'arrêt des pas : plus d'élan, le GPS rattrape son retard ~2 s, puis la position se fige
    (la dérive du GPS ne fait plus bouger les photos) ;
  - sauts confirmés et vitesse de véhicule suivis ; remplace `fuseFix`.
- **Un seul suivi GPS partagé** par tous les écrans (gardé 10 s) : la position acquise sur
  l'accueil sert aussitôt à la chasse.
- Photo prise : enregistrée à la position affichée, elle recouvre le décor aussitôt.
- **Chasse** : recalage au point de vue (`useSpotCalibration`) quand la photo est alignée,
  avant la capture, téléphone immobile — la photo se confond avec le décor malgré l'écart
  entre les GPS des deux prises ; figé ensuite (on s'écarte : elle garde sa place).
- iPhone : l'accès « mouvement » (accéléromètre) est demandé avec la boussole.
- README (principe, limites) ; version **0.009.1**.

## Vérifications

- `npm test` (92 verts, dont `src/components/arProjection.test.ts`, qui échoue sur 0.009.0 :
  il reproduit le défaut), `npm run lint`, `npm run build` : OK.
- Chromium (accueil et chasse réels, faux compte, GPS/boussole/accéléromètre simulés, GPS en
  retard de 0,8 s), même scénario sur les deux versions — bords de la photo à l'écran :

| Scénario | 0.009.0 (en ligne) | 0.009.1 |
| --- | --- | --- |
| Photo prise, immobile | recouvre le décor | recouvre le décor |
| 3 m à droite (face à la photo) | **ne bouge pas** (suit le téléphone) | se décale : bord droit 758 → 317–321 px (attendu 336) |
| Immobile, GPS ±2,5 m pendant 12 s | ne bouge pas | tremble de 24 à 45 px selon les essais (≈ 0,2–0,3 m) |
| Retour au point de vue | — | à 7 cm près |
| Chasse, GPS décalé de 4 m, aligné | — | recalée, « Capturée ! » |
| Puis 3 m à gauche, et immobile | **ne bouge pas** | se décale (bord gauche 66–83 px, attendu 54) et y reste |

- Pas testé sur un vrai iPhone : à vérifier sur le terrain (retard du GPS en se mettant à
  marcher, stabilité à l'arrêt, accès à l'accéléromètre sur iOS).

## Mise en ligne

- 28/09/2026 : aperçu construit par Vercel (`dpl_EZVndNRhb9MqKPkKTd3J3X7DvPQM`, commit `97ac582`),
  puis redéploiement en production lancé (`dpl_CH3VQP2FGb3572UpwuMzskCNv7yp`). La vérification
  de son état a été refusée par les autorisations de la session (action de production) :
  **mise en ligne non confirmée** — à vérifier dans le menu de l'app (numéro 0.009.1).
- Retour arrière possible vers 0.009.0 : déploiement `dpl_EPnnkgHnE3p8ENQJr7WHPTKcco4h`
  (Vercel › picti › Deployments › Instant Rollback).
