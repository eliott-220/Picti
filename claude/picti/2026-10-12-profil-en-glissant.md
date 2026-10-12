# 2026-10-12 — Glisser vers la gauche sur le viseur ouvre le profil (0.21.1)

Parent : [CLAUDE.md](../../CLAUDE.md) · pendant du retour par le bord gauche de
[2026-10-08-boutons-liquid-glass.md](./2026-10-08-boutons-liquid-glass.md)

## Demande
Eliott : « de la même manière que lorsqu'on glisse le doigt de gauche vers la droite ça fait un retour
en arrière, je veux que lorsqu'on est sur l'écran d'accueil (caméra) et qu'on glisse le doigt de droite
vers la gauche, ça ouvre directement notre profil ».

## Ce qui est fait
- Le geste natif d'iOS (0.19.0) ne sait que reculer / avancer dans l'historique : le glissement vers le
  profil est donc fait dans la page, et marche aussi sur Android et sur le site.
- Sur le viseur, glisser de droite à gauche fait arriver le **vrai profil** par la droite, sous le doigt
  (ombre sur son bord, comme l'écran qui arrive dans iOS). Lâché au-delà de 35 % de la largeur, ou d'un
  geste vif (≥ 40 px, > 0,5 px/ms mesurés sur la fin du geste), il s'ouvre ; sinon il repart à droite.
- Le geste part du décor, d'une photo seule ou des boutons du rail (le bord droit, là où on pose le doigt) ;
  un simple appui sur ces boutons fait toujours leur action. Il ne part pas du déclencheur (appui long +
  glisser = carrousel des modes), de la frise de la photo visée, des feuilles ; une pile de photos garde
  son propre glissement. Coupé en « Reproduire », avec le menu ou une feuille, une prise en suspens,
  l'attente d'un GPS précis, un enregistrement en cours.
- Le profil est préparé caché 1,5 s après l'ouverture du viseur : sans ça, le premier glissement
  attendait 100 à 300 ms son affichage (mesuré au banc, version compilée) ; après, 8 à 33 ms.
- **App iOS** : sur l'accueil, les gestes retour / avant de WebKit sont coupés (et remis sur tous les
  autres écrans) : après un retour, glisser depuis le bord droit rouvrait le dernier écran quitté (la
  carte, par exemple) au lieu du profil. Le suivi de l'adresse (KVO `url`) a été vérifié à part sur
  WebKit avec un schéma `capacitor://` : signalé à chaque ancre, `replaceState`, retour et avance.

## Vérifié
- Typecheck, lint, **367 tests** (7 nouveaux : `swipeOpen.test.ts`).
- Banc (fausse base, capteurs simulés), version de développement **et** version compilée : le profil suit
  le doigt ; lâché à un tiers lentement → retour au viseur ; aux 3/5 → profil ; geste lancé de 75 px →
  profil, même distance lentement → retour ; vers la droite, vertical → rien ; départ sur « Carte des
  photos » → profil, appui dessus → carte ; frise, déclencheur (carrousel), pile (photo suivante), menu
  ouvert, « Reproduire » → pas de profil ; appui sur la photo → capture comme avant ; aucune erreur.
- App iOS compilée et signée (Xcode 26.3, version de test avec journaux). **Pas encore vue sur
  l'iPhone** (débranché pendant la session).

## Branche
`claude/profil-en-glissant`, partie de `claude/suivi-visuel` (0.21.0, la version de test sur l'iPhone et
la prochaine production), d'où le numéro 0.21.1 (0.22.0 est réservée au premier lancement).
