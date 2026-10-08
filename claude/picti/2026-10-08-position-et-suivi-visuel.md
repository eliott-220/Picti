# 2026-10-08 — Position native et suivi visuel ARKit dans l'app iOS (0.20.0, 0.21.0)

Parent : [CLAUDE.md](../../CLAUDE.md)

Question d'Eliott, maintenant que l'app iOS existe (0.18.0) : « comment peux-tu améliorer la qualité de
géolocalisation ? », puis « trouve les meilleures solutions, teste tout à chaque fois ». Branches
`claude/position-native` (0.20.0, partie de `main` 0.19.0) et `claude/suivi-visuel` (0.21.0, partie de
la 0.20.0). Rien n'est fusionné dans `main`.

## Constat

Dans la coque, la position passait encore par la page (`navigator.geolocation` réglé par WebKit) et la
caméra par `getUserMedia` : la coque n'apportait rien au GPS. Le message « Position exacte » renvoyait
aux réglages de Safari, sans effet sur l'app.

## 0.20.0 — position lue par iOS

Plugin `Position` (CoreLocation : précision navigation, activité piéton, instant de mesure, vitesse et
cap GPS, arrêt en arrière-plan), source unique `src/sensors/positionSource.ts` (repli sur la page si le
plugin manque), « Position exacte » proposée par iOS puis expliquée (« Ouvrir les réglages »), pastille
« Position refusée · Réglages ». **Vu au simulateur** : relevés natifs (`simulated: true`), marche de
33 m simulée (un relevé par seconde), arrière-plan (aucun relevé pendant 8 s, pas de rafale au retour),
position refusée (pastille). Pas vu : la demande « position exacte temporaire » (le simulateur ne
permet pas de passer en position approximative sans toucher l'écran).

## 0.21.0 — suivi visuel ARKit

La vraie cause des photos qui « flottent » : la position du téléphone vient du GPS (±5 m, qui dérive)
et des pas comptés. ARKit suit le téléphone au centimètre par la caméra : il suffit de caler son repère
sur la Terre — exactement le « calage » de PICTI bis (`bis/src/align.js`), porté en TypeScript.

- Plugin `ArTracking` (caméra d'ARKit sous la page, poses, photo haute résolution), `arAlign.ts`,
  `arPose.ts`, `arTracking.ts`, `useViewfinder.ts`, regéocadrage (`ArShotRefiner`), réglage du menu.
  Détails dans `CLAUDE.md` › « Suivi visuel ARKit ».
- **Mesures** (simulations reproductibles, `arAlign.test.ts`, `arCompare.test.ts`) : GPS à erreur
  corrélée (σ 4 m, 30 s) et boussole faussée de 7° ; sur 200 marches, erreur moyenne : GPS seul 5,1 m,
  suivi actuel 4,9 m, suivi visuel 4,1 m ; place d'une photo d'une seconde à l'autre : 2,2 m, 1,1 m
  (0,26 m avec des pas comptés parfaits), 0,14 m. Précision annoncée honnête dans 90 % des cas.
  Regéocadrage : photo prise en début de session 5,5 m → 4,2 m (400 marches). Limite : le cap reste
  celui de la boussole (le trajet ne la corrige qu'en marchant longtemps).
- **Calibrage de la précision annoncée** : un relevé indépendant par 60 s (et par 100 m) — avec 20 s,
  l'erreur réelle dépassait deux fois la précision annoncée une fois sur trois (une moyenne d'erreurs
  corrélées sur τ vaut un relevé par 2τ environ).
- **Banc « iPhone simulé »** (dans le dossier temporaire de la session, hors dépôt) : la vraie app dans
  Chrome, `@capacitor/core` remplacé (`.bench/fakeCapacitor.ts` + `.bench/vite.ios.config.ts`) par des
  plugins simulés à partir d'une vérité terrain : GPS bruité, repère ARKit au cap et à l'origine
  arbitraires, boussole faussée, décor de synthèse (poteaux) dessiné derrière la page transparente.
  Scénarios Playwright : marche de 45 s (erreurs de position et de cap mesurées), photo prise (focale
  d'ARKit enregistrée), regéocadrage, selfie (session arrêtée, caméra web, retour = nouvelle session),
  accueil → chasse (même session) → carte (arrêt, page opaque), menu (coupé / rétabli, gardé au
  rechargement), appareil sans ARKit, Reproduire (caméra dans la zone du milieu), Recaler.
  **Défaut trouvé et corrigé** : un appel au plugin qui lève une exception laissait le suivi bloqué
  en « en route » — caméra web jamais démarrée (écran noir). Tout échec renvoie maintenant à la caméra
  web.
- **Simulateur iOS** (pas d'ARKit) : repli sur la caméra web vérifié.
- **iPhone d'Eliott** : version de test installée (0.20.0 + suivi visuel) ; plugin et session ARKit
  démarrent, mais le téléphone était verrouillé : iOS coupe alors la caméra (« interrupted »). Reste à
  voir sur place : caméra derrière la page, sens des poses, photo haute résolution, boussole pendant
  ARKit. La version de test enregistre les trajets (`VITE_PICTI_TRACE=1`, `Documents/traces`) pour les
  rejouer et régler le calage sur de vraies données.

## Pistes suivantes

- Localisation visuelle d'Apple (`ARGeoTrackingConfiguration`, au mètre, sans clé) : **testée sur
  l'iPhone le 08/10 à 21 h 47** (version de test, `checkAvailability`) — **indisponible à La Rochelle**
  (Vieux-Port, EIGSI), Bordeaux, Nantes ; disponible à Paris, Lyon, Londres, New York. Même lancement :
  relevés d'iOS bien reçus (vitesse et cap compris), session ARKit « interrupted » (iPhone verrouillé).
- ARCore Geospatial (Google, Street View) : clé Google Cloud à créer par Eliott.
- Affiner la position des photos avec les captures (base de données : proposition à valider).
