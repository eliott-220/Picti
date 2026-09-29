# 2026-09-29 — La photo bouge et reste trop grande de loin (0.010.1)

Projet : [PICTI](../../CLAUDE.md) · Dépôt `eliott-220/picti` · Branche `claude/nice-cori-zbpf7v`
(suite de [Photo qui suit encore après 5 m](2026-09-28-photo-suit-encore.md) ; objectif 1 des
[objectifs du jour](2026-09-29-objectifs-du-jour.md))

## Retour d'Eliott (test terrain de 0.009.2)

« La photo bouge beaucoup encore en suivant la caméra, et même à 20 m elle est trop grande. »

## Causes trouvées (mesurées avec le code de 0.009.2)

1. **Cap de la boussole (iPhone)** : le nord était recalé sur `webkitCompassHeading` à chaque
   mesure (10 % par événement, soit ~0,15 s). La boussole est bruitée et **en retard quand on
   tourne** : le cap affiché suivait ce retard, la photo traînait derrière le téléphone puis
   revenait — elle « suivait la caméra ».
2. **Détection de la marche trop sensible** : une simple agitation de 0,25 m/s² suffisait. En
   visant, le téléphone bouge : l'app se croyait en marche et suivait le bruit du GPS.
3. **Dérive du GPS suivie à l'arrêt** : un écart de 2 m sur deux relevés était rattrapé. Or une
   photo placée à 6 m se décale de **27°** pour 3 m d'erreur GPS au point de vue (11° à 10 m).
4. **Taille de loin** : avec la seule perspective, le plan-photo (6 × 8 m pour un sujet à 6 m)
   occupait encore **37 %** de la largeur de l'écran à 20 m et 21 % à 40 m.

## Réalisé (0.010.1)

- `src/geo/heading.ts` (nouveau) : cap = gyroscope ; écart avec le nord recalé lentement
  (τ 2 s), seulement téléphone stable (< 8°/s) et objectif à moins de 55° de l'horizon (à plat,
  la boussole ne donne plus le cap de l'objectif) ; recalage rapide au démarrage, après une
  pause, ou si un grand écart (> 20°) persiste 2 s. Branché dans `useOrientation` ; lissage
  désormais en temps (40 ms) et non par événement.
- `src/geo/motion.ts` : **comptage des pas** (rebond vertical > 0,5 m/s², redescente entre deux
  pas, 0,25 à 1,2 s d'intervalle) ; on marche à partir de 3 pas réguliers. Lever, baisser ou
  bouger le téléphone en visant n'est plus une marche. « Vient de s'arrêter » : 4 s.
- `src/geo/tracking.ts` : à l'arrêt, la position est **tenue** ; seul un écart moyen du GPS qui
  persiste (≥ 4 m ou la moitié de la précision, ~5 s) est rattrapé en 2–3 s. Sans
  accéléromètre, la vitesse GPS dit si l'on bouge.
- `src/geo/projection.ts` : `displayScale` réduit le plan-photo de loin (`farScale` : 1 au point
  de vue, ~⅓ à 20 m) avec une hauteur apparente minimale de 5° ; au point de vue, rien ne change.
- Version **0.010.1**. README et CLAUDE.md à jour.

## Vérifications

- `npm test` : 108 tests (dont 9 nouveaux sur le cap, 3 sur les pas, 2 sur la position, 2 sur
  la taille), `npm run lint`, `npm run build` : OK.
- Banc d'essai Chromium (l'app entière, deux versions côte à côte, iPhone simulé : écran
  390×844, caméra 4:3, boussole en retard de 0,3 s, GPS à 1 relevé/s) :

| Situation | 0.009.2 | 0.010.1 |
| --- | --- | --- |
| Au point de vue, balayage ±20° : erreur pendant / après le mouvement | 17° / **14°** | 3,5° / **0,2°** |
| Immobile à 10 m, le GPS dérive de 3 m : la photo glisse de | 43 px | **2 px** |
| À 8 m, on vise en bougeant le téléphone (GPS ±2,5 m) : la photo saute de | **164 px** | 13 px |
| Recul de 20 m face à la photo : taille finale | 146×195 px | **46×62 px** |
| Chasse : arrivée, « Tournez-vous », « Ne bougez plus », capture | OK | OK |

- Tailles calculées sur écran d'iPhone (photo à 6 m, dans l'axe) : 5 m 72 % de la largeur
  (89 % avant), 10 m 35 % (61 %), 20 m 12 % (37 %), 40 m et au-delà ~11 % (21 %).

## Limites

- Simulations : les vrais capteurs de l'iPhone (retard de la boussole, amplitude des pas,
  dérive du GPS) restent à confirmer sur le terrain.
- La position absolue reste celle du GPS (3 à 5 m d'erreur) : la photo est stable mais peut
  être décalée d'autant ; seule la chasse la recale au point de vue au moment de la capture.
- Champ de vision de la caméra toujours supposé 26 mm (24 mm sur les iPhone Pro récents :
  ~8 % d'écart) : la calibration reste à faire.

## À tester sur l'iPhone

1. Au point de vue, tourner le téléphone à gauche puis à droite : la photo doit rester collée
   au décor, sans traîner ni revenir.
2. Rester immobile 30 s à 5–10 m : la photo ne doit plus bouger.
3. Reculer de 20 m : la photo doit devenir petite (environ 1/8 de la largeur de l'écran).
4. En marchant, « · marche » doit apparaître sur la pastille GPS après 2–3 pas.
