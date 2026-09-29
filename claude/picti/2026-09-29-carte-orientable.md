# 2026-09-29 — Carte orientable (0.011.0)

Projet : [PICTI](../../CLAUDE.md) · Dépôt `eliott-220/picti` · Branche `claude/nice-cori-zbpf7v`

## Demande

« Sur la carte, rajoute la possibilité qu'on puisse la faire pivoter, dans la prochaine version. »

## Réalisé

- `src/screens/WorldMap.tsx` : la rotation n'est plus bloquée (`dragRotate: false` et
  `disableRotation()` retirés). On tourne la carte à **deux doigts** (clic droit glissé sur
  ordinateur) ; elle reste **à plat** (`touchPitch: false`, `maxPitch: 0`).
- **Bouton boussole** (`.map-north`, au-dessus de « Ma position ») : il apparaît dès que la carte
  est tournée ; sa flèche rouge montre le nord ; le toucher remet le nord en haut (0,3 s).
- Les **cônes de direction** des vignettes restent justes quand la carte tourne
  (`heading - bearing`).
- Version **0.011.0** (prochaine version : pas encore en ligne ; en production : 0.010.1).

## Vérifications

- `npm test`, `npm run lint`, `npm run build` : OK.
- Chromium (carte avec une photo prise vers l'est) : carte tournée de −160° → cône à 250°
  (90 + 160) et bouton affiché, flèche à 160° ; appui sur le bouton → nord en haut en moins de
  0,5 s, cône revenu à 90°, bouton masqué. (Fond de carte remplacé par un style vide dans le
  test : l'environnement cloud n'accède pas à OpenFreeMap.)

## À tester sur l'iPhone

Tourner la carte à deux doigts, vérifier le bouton boussole, et que le zoom à deux doigts
reste confortable (la rotation se déclenche au-delà d'un petit angle).
