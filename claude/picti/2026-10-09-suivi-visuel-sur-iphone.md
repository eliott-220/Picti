# 2026-10-09 — Suivi visuel : premiers trajets réels sur l'iPhone (0.21.0)

Parent : [CLAUDE.md](../../CLAUDE.md) · suite de [2026-10-08-position-et-suivi-visuel.md](./2026-10-08-position-et-suivi-visuel.md)

La version de test (enregistreur de trajets) installée sur l'iPhone d'Eliott le 08/10 au soir a servi le
09/10 vers 13 h 20 (trois journaux, ~6 minutes, 2 photos). Journaux récupérés sans rien lancer sur
l'iPhone (`devicectl device copy from … Documents/traces`), rejoués sur le Mac. Ils restent sur le Mac
(données de position d'Eliott), pas dans le dépôt.

## Ce qui marche
- ARKit démarre et passe en suivi « normal » en ~1,2 s ; photos en **haute résolution** (3024 × 4032,
  portrait, focale 24 mm, celle du module principal du 15 Pro Max).
- Position lue par iOS (0.20.0) : relevés avec vitesse et cap.
- Cap de la photo = celui de la boussole au même instant (176,7°), calage cohérent.

## Deux défauts trouvés, corrigés, testés
1. **Caméra web ouverte en même temps qu'ARKit** : au premier rendu du viseur (et au retour d'un autre
   écran, ou du selfie), le suivi n'était pas encore lancé, la caméra web démarrait et restait ouverte
   15 s ; sur iPhone, la dernière caméra ouverte coupe l'autre → sessions ARKit « interrupted » juste
   après leur démarrage (vu 7 fois dans les journaux). Eliott l'a vu le même jour (caméra arrière
   noire) et une autre session l'a corrigé (commit `8a9f209` : `arLeavesCamera`, `stopWebCamera`,
   surveillance des images) ; cette session était arrivée à la même cause par les journaux, a gardé ce
   correctif et y a ajouté un test du banc qui compte les flux web vivants pendant le suivi (lancement,
   retour de la carte, retour du selfie) — 37 à 40 relevés en conflit avant, 0 après.
2. **Dans un véhicule**, ARKit suit l'intérieur : GPS +50 m à 15-20 km/h, ARKit immobile à 40 cm près,
   faux demi-tour de 150° (la boussole, elle, suivait la route). Le calage se déréglait pour des minutes.
   Détection `arVehicle.ts` (retour au GPS et à la boussole, nouveau calage une fois redescendu) ;
   vérifiée sur le vrai trajet (2 à 4 s après le départ) et au banc.

## Aussi
- Saut du repère d'ARKit : les photos de la session sont ramenées dans le nouveau repère et continuent
  d'être replacées (banc : 5,9 → 3,4 m malgré un saut).

## Encore à voir sur place
Marche à pied dehors (photos fixes en marchant, précision qui s'affine), Reproduire, chasse.
