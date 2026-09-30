# Selfie trop grand, photo qui suit en avançant, carte figée — 30 septembre 2026 (0.011.3)

Projet : [PICTI](../../CLAUDE.md) · Branche `claude/youthful-cannon-962c45`
Voir aussi : [Améliorer l'ergonomie](2026-09-30-ergonomie.md) ·
[Photos stables et lointaines (0.010.1)](2026-09-29-photo-stable-et-lointaine.md)

## Retour terrain d'Eliott (iPhone, 0.011.2)

> La photo en selfie est beaucoup trop grande à l'écran, elle ne fait pas la même taille que
> les autres. Quand on bouge le téléphone de gauche à droite, les images restent fixes ; par
> contre quand on avance et qu'on recule, elles gardent leur taille et bougent avec nous, alors
> qu'en s'éloignant elles devraient rétrécir et rester à leur place.

Ajouté ensuite :

> Sur la carte, quand je me déplace dessus, les photos et mon pin ne restent pas à leur
> emplacement jusqu'à ce que je relâche les doigts, et au bout de 2/3 secondes ça se remet.

## Causes

1. **Selfie** : toute photo est un plan placé à la « distance du sujet » (6 m par défaut) devant
   l'objectif. Pour un selfie, le sujet (l'auteur) est à bout de bras : son visage, projeté à
   6 m, devenait un portrait géant de plusieurs mètres.
2. **Avancer / reculer** : la position vient du GPS (±5 m, en retard de 1 à 3 s). À l'arrêt, elle
   est tenue (0.010.1) et seul un écart persistant de 4 m est rattrapé. Quelques mètres de marche
   ne se voient donc pas : la position affichée ne bouge pas, la photo garde sa taille et reste
   collée à l'écran.

3. **Carte** : les vignettes et le point « moi » sont des éléments React, replacés à chaque
   déplacement par un nouveau rendu. Sur iPhone, Safari retarde ces rendus pendant le geste :
   ils ne suivent qu'une fois la carte arrêtée (et les photos de la zone rechargées).

## Corrections (0.011.3)

- **Selfies à 0,6 m** (`SELFIE_DEPTH`) : le visage flotte à sa taille réelle, là où l'auteur se
  tenait. Selfies déjà enregistrés à 6 m : lus à 0,6 m (`rowToPhoto`), sans toucher à la base.
  Détail d'un selfie : option « 0,6 m (à bout de bras) » dans « Distance du sujet ».
- **Position pas à pas** (estime, « dead reckoning ») :
  - `geo/motion.ts` : chaque pas d'une marche reconnue (3 pas réguliers) compte (`walked`) ; le
    sens de la marche (`direction`) vient de l'élan des premiers pas — vitesse horizontale
    intégrée (mémoire 1,5 s) dans le repère de l'objectif : en avant, en arrière, de côté ; sans
    élan net, droit devant. `stepDirection` le tourne sur le terrain selon l'orientation.
  - `useLivePosition(track, basis)` (accueil, chasse) : nouveaux pas → `walkPosition` (0,65 m par
    pas) → `walkTrack`.
  - `accelerometerSign` : la pesanteur mesurée est comparée à la verticale donnée par
    l'orientation ; si le navigateur inverse les signes de l'accéléromètre (possible sur iPhone),
    le sens de la marche est retourné (sinon reculer ferait grandir la photo).
  - `geo/tracking.ts` : pendant la marche et juste après (`stepping`), le GPS ne tire plus la
    position (il est en retard) ; une fois arrêté, seul un écart persistant (≥ 4 m) la corrige,
    par exemple si les pas ont été comptés dans le mauvais sens.

- **Carte** (`WorldMap.tsx`) : à chaque événement `move`, les vignettes, les cônes de direction
  et le point « moi » sont replacés directement (`place`, `data-lon`/`data-lat`/`data-heading`),
  sans attendre React.

## Vérifications

- `npm test` : 134 tests (nouveaux : pas et sens de la marche, sens sur le terrain, signe de
  l'accéléromètre, suivi pas à pas, distance des selfies). Lint, `tsc -b`, `npm run build` : OK.
- Simulation dans Chromium (viseur, accéléromètre simulé, GPS immobile) : photo de 1622 px de
  large ; 6 pas en reculant → 830 px ; 8 s plus tard, immobile → 826 px (pas ramenée par le GPS) ;
  6 pas en avançant → 1610 px. Même résultat avec un accéléromètre aux signes inversés.
- Carte, glissé au doigt simulé avec un rendu React retardé de 2,5 s (comme Safari) : avant, les
  vignettes restaient figées puis sautaient 3 s après ; maintenant elles suivent le doigt.
- **À confirmer sur iPhone** : vrais pas (téléphone tenu devant soi), sens détecté en reculant,
  longueur de pas (0,65 m).

## Mise en ligne (30/09)

Production : `dpl_DqK5cFg7S4rQjTvfyzb4j11gSdZA` (redéploiement de l'aperçu
`dpl_GX7dpfAK85N2mWLKXRxHcMxT9m2e`, commit `bfc2431`). Retour arrière : 0.011.2
(`dpl_4PtSLtuydm9DTrwmnGfytBNsJ3NE`).

Fusionnée dans `main` le 30/09 (eliott-220/Picti#3).

## À tester dehors

1. Face à une photo à 3-4 m, reculer de 4-5 pas : elle doit rapetisser et rester à sa place
   (« · marche » sur la pastille GPS pendant la marche).
2. Avancer de nouveau : elle regrandit.
3. Faire un pas de côté : elle glisse sur le côté dans l'autre sens, sans changer de taille.
4. Carte : glisser, pincer, tourner à deux doigts : les vignettes et le point bleu suivent.
5. Prendre un selfie, puis se placer là où était le téléphone et viser l'endroit où l'on se
   tenait : visage à taille réelle.
