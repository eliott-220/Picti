# Photo « carte », effacement à 2 m, capture par agrandissement — 6 octobre 2026 (0.14.0)

Projet : [PICTI](../../CLAUDE.md) · Branche `claude/carte-et-capture`
Voir aussi : [Vitre dépolie (0.012.0)](2026-09-30-photos-de-dos-vitre.md) ·
[Couleurs inversées (0.013.0)](2026-09-30-couleurs-inversees.md) ·
[Capture à moins de 5 m (0.013.1)](2026-09-30-capture-5m-ancrage.md)

## Demande d'Eliott

Maquette du viseur (photo du Vieux-Port au centre, bouton « Capturer · 3 m »). Trois changements :

1. La photo est une **carte** qui ne remplit jamais l'écran en se promenant : ancrée à sa place,
   en perspective, mais de taille plafonnée (~60 % de la largeur, ~45 % de la hauteur).
2. **Effacement progressif à moins de 2 m de la photo elle-même** (pas du point de vue) : flou
   et transparence, invisible sous 0,5 m ; plus de disparition sèche quand on la traverse.
3. **Nouvelle capture** : l'utilisateur ne bouge plus, c'est la photo qui vient à lui — elle
   s'agrandit jusqu'à couvrir l'écran en prenant ses couleurs, capturée seulement à 100 % ;
   marcher, tourner le téléphone ou perdre la photo de vue annule.

## Ce qui a été fait

- **Carte** (`src/geo/projection.ts`) : `projectCard` = `cornersInFront` (tout près et de biais,
  des coins du plan passaient derrière l'objectif et la photo disparaissait d'un coup : le plan est
  réduit autour de son centre jusqu'à ce que tous soient devant) puis `cardScale` / `scaleQuad`
  (`CARD_MAX` : 60 % × 45 %, réduction autour du centre projeté). Position et orientation
  projetées inchangées : le centre reste exactement où la perspective le place.
  `ArProjection.cardScale` expose la réduction. Style : cadre blanc 3 px, coins arrondis 12 px,
  ombre légère, constants à l'écran quelle que soit la distance (`cardVars`).
- **Effacement** : `panelDistance` (œil à la hauteur du photographe → point le plus proche du
  rectangle du plan-photo) et `panelProximityFade` (`NEAR_FADE` : nette à 2 m, smoothstep,
  flou jusqu'à 16 px à l'écran, invisible sous 0,5 m). Multiplié à `edgeFade`, recto et vitre.
  Choix : distance 3D avec l'œil à hauteur du photographe plutôt que distance purement
  horizontale — identique pour une photo prise à l'horizontale, mais une photo du sol (objectif
  à −80°) aurait été « traversée » depuis son propre point de vue.
- **Capture** : logique pure `checkCapture` (`src/geo/capture.ts`) + hook `useCapture` (vérifie
  les capteurs à chaque image) + `CaptureCard` (transitions CSS `transform` : l'annulation repart
  de là où en est l'agrandissement) + `CaptureHint`. Viseur : « Capturer » → agrandissement →
  enregistrement à 100 % → 0,6 s en plein écran → retour à sa place, en couleur avec surbrillance.
  Chasse : « Capturer » ou alignement tenu 0,5 s (remplace `HOLD_MS` 1,5 s) → même déroulé →
  « Capturée ! » par-dessus la photo plein écran → « Contempler » la renvoie à sa place.
- **Marche** : la marche n'est reconnue qu'au 3e pas régulier (≈ 1,5 s), trop tard pour une
  capture de 2 s (vu en simulation : la capture aboutissait en marchant). Annulation dès 2 pas
  comptés depuis le départ (`CAPTURE.steps`, `walkedSteps().steps`) ; un geste isolé — l'appui sur
  le bouton — ne fait qu'un rebond.
- Tolérances (`CAPTURE`) : cap 12°, inclinaison 10° (cap ignoré objectif à plus de 70° de
  l'horizon) ; durées 2 s / 0,3 s ; message d'annulation 2,5 s.
- Supprimés : révélation sur place de 0.013.0 dans le viseur (`REVEAL_MS`), `ArPhoto reveal`,
  `.captured.after-reveal` (la couleur a déjà envahi la photo pendant l'agrandissement).

## Vérifications

- Tests : 181 (149 avant) — plafond de taille, réduction autour du centre, coins derrière
  l'objectif, distance au plan (face, dos, côté, photo du sol), effacement à 2 m / 1,25 m /
  0,5 m, côté vitre, passage latéral à 10 m, jamais effacée dans le rayon de capture ; capture
  complète, annulée par 2 pas, par rotation (cap, inclinaison), photo hors écran, un seul rebond
  toléré. Les tests « recouvre exactement l'écran » vérifient désormais le centre et la largeur
  hors plafond (`full = largeur / cardScale`). `npm test`, `npm run lint`, `npm run build` : OK.
- Chrome sans interface (390 × 844, banc d'essai local : vrais écrans Accueil et Chasse, faux
  store, caméra, GPS, boussole et accéléromètre simulés) :
  - marche vers la photo : 123×163 px à 11 m, puis **234×312 plafonnée** de 3 m jusqu'au plan,
    toujours centrée à sa place ; flou dès 2 m du plan (opacité 0,58 et flou 28 px de rendu à
    ~1,4 m), invisible à 0,3 m ; de l'autre côté, vitre floue qui réapparaît en douceur, nette
    (flou 12 px de la vitre seul) à 3 m ;
  - capture complète : 234×312 → 425×567 (0,7 s) → 595×794 (1,3 s) → **633×844, plein écran**
    (2 s), couleur de `circle(0%)` à `circle(75%)`, une seule capture enregistrée, retour à sa
    place en couleur avec surbrillance ;
  - annulée par la marche (pas simulés dès 0,5 s) : annulée à ~1,3 s, retour en 0,3 s, rien
    d'enregistré, bouton réactivé ; annulée par rotation de 16° : en 0,1 s, puis relance réussie ;
  - chasse : alignement → agrandissement → « Capturée ! » → « Contempler » → retour à sa place.
- **À vérifier sur iPhone** : fluidité de l'agrandissement et du flou (filtre `blur` sur l'image
  transformée près du plan), tolérances d'immobilité avec la vraie boussole, rendu du cadre.

## Mise en ligne

Pull request vers `main`, **non fusionnée** : fusionner = mise en production automatique sur
picti.vercel.app, seulement avec l'accord d'Eliott.
