# 2026-10-07 — Mode Public · Amis · Privé au déclencheur (0.17.0)

Parent : [CLAUDE.md](../../CLAUDE.md)

Demande d'Eliott : enlever le petit bouton juste au-dessus du déclencheur ; la photo est en
public par défaut, et en restant appuyé sur le bouton rouge on fait glisser de gauche à droite,
ce qui change de mode et le symbole à l'intérieur. Précision (question posée sur le réglage du
profil) : « commencer par public à la première ouverture de l'app, mais si jamais l'utilisateur
change de mode à n'importe quel moment, enregistrer la réponse ».

## Ce qui change

- Viseur (`Home.tsx`) : la pastille `VisibilityPill` au-dessus du déclencheur est retirée. Le
  déclencheur devient le composant `Shutter` (`src/components/Shutter.tsx`) :
  - son symbole est celui du mode (globe = Public, deux personnes = Amis, cadenas = Privé ;
    `VISIBILITY_ICON`, `src/components/visibilityIcon.ts`) à la place du cadre de visée ;
  - appui court : photo, comme avant (le `click` reste le geste qui déclenche, utile à iOS pour
    l'autorisation de la boussole) ;
  - appui long (300 ms) ou glissement horizontal de plus de 12 px : une réglette
    « Public · Amis · Privé » apparaît au-dessus du bouton, le mode de départ juste au-dessus ;
    glisser le doigt vers la droite / la gauche passe au mode voisin tous les 64 px
    (`visibilityAtOffset`), sans boucler ; le symbole du bouton et « Visible par … » suivent ;
    petite vibration à chaque mode (Android) ;
  - relâcher garde le mode **sans prendre de photo** ; toast « Prochaines photos visibles par vos
    amis » ;
  - clavier : flèches gauche / droite ; nom accessible « … · visible par vos amis » ;
  - `touch-action: none`, pas de sélection ni de menu contextuel sur le bouton (appui long).
  - La réglette est décalée pour rester dans l'écran (`modesLeft`) : Reproduire en paysage, où le
    déclencheur est au bord droit, vérifié.
- Mode des prochaines photos (`src/data/shotVisibility.ts`) : **Public à la première ouverture**,
  puis le dernier mode choisi est gardé d'une ouverture à l'autre (`localStorage`
  `picti.visibilite`), qu'il ait été changé au déclencheur, dans Moi ou dans l'import.
  Navigation privée (stockage refusé) : le choix tient jusqu'à la fermeture de l'app.
- Moi : « Mes nouvelles photos sont visibles par… » affiche et modifie ce même mode (texte d'aide :
  « restez appuyé sur le déclencheur et glissez »). Import : même mode, pastille conservée.
- Comme rien ne l'affiche plus à l'écran, le toast des 3 premières photos (tant que le mode n'a
  jamais été changé) ajoute « — restez appuyé sur le déclencheur pour changer ».

## Choix faits

- Mode gardé **sur l'appareil**, pas dans la base : `profiles.default_visibility` (« amis » pour
  tous les comptes existants depuis la 0.14.0) ne permet pas de savoir qui l'a choisi ; l'app ne
  la lit ni ne l'écrit plus (colonne gardée, aucune migration). Conséquence : sur un nouvel
  appareil (ou l'app de l'écran d'accueil, dont le stockage est séparé de Safari), on repart sur
  Public.
- Ordre de la réglette de gauche à droite : Public · Amis · Privé (celui de `VISIBILITIES`).
  Public sélectionné en rouge, Amis / Privé en blanc.
- Version 0.17.0 : numéro repris des boutons « verre liquide », abandonnés le 07/10 sans être
  mis en ligne (branche `claude/boutons-verre-liquide` jamais fusionnée) ; la 0.18.0 est réservée
  à la coque Capacitor (prompt préparé le même jour).

## Mise à jour 0.17.1 : le bouton devient un carrousel

Retour d'Eliott après la mise en ligne de la 0.17.0 : « que ce soit le bouton rouge directement qui
s'anime » — on reste appuyé, il grossit un peu, on voit les autres symboles à gauche et à droite,
un peu flous ; en allant à droite ou à gauche, les symboles suivent et viennent se mettre dans le
cercle rouge, avec le petit nom au-dessus du cercle quand le symbole est dedans, qui disparaît
quand le doigt est lâché.

- Plus de réglette séparée ni de « Visible par … » : `Shutter` affiche un carrousel centré sur le
  bouton (`.shutter-strip`), le bouton grossit (`.shutter.picking`, ×1,12).
- Les symboles **suivent le doigt** (même décalage, 72 px par mode) : glisser vers la gauche fait
  entrer Amis puis Privé ; au-delà des bouts, le carrousel résiste (un quart du geste, 20 px au plus).
- Aspect selon la distance au centre (`modeLook`) : net, taille normale dans le cercle ; voisin
  plus petit (×0,7), flou (2 px) et un peu pâle ; au-delà du voisin, il s'efface. Ombre portée pour
  rester lisible sur un ciel clair.
- Nom (Public / Amis / Privé) dans une petite bulle au-dessus du cercle, plein quand le symbole est
  centré, effacé à mi-chemin (`labelOpacity`) ; il disparaît dès qu'on lâche. Le symbole le plus
  proche se range alors dans le cercle (180 ms) et les autres s'effacent.
- Le toast « Prochaines photos visibles par … » au relâchement est retiré (le nom au-dessus du
  cercle le remplace) ; l'astuce des 3 premières photos est gardée.
- Clavier : flèche droite = mode suivant (Public → Amis → Privé), sans boucler.
- 291 tests ; banc : appui long (bouton grossi, 3 symboles, voisin flou, « Public » au-dessus),
  mi-chemin (nom effacé, Amis décalé de 36 px), un cran (Amis), deux crans (Privé, bloqué au bout),
  relâché (nom disparu, carrousel refermé, mode Amis, aucune photo), rechargement, appui court,
  doigt glissé à droite (Public), flèches.

## Vérifications (0.17.0)

- 289 tests (10 nouveaux : `shutterModes.test.ts`, `shotVisibility.test.ts`), lint, build.
- Banc local (fausse base, capteurs simulés, Chrome sans interface) : pastille absente, Public à
  la première ouverture, appui long → réglette, glisser → Amis puis Privé (bloqué au bout), relâcher
  → mode Amis sans photo, rechargement → toujours Amis, appui court → photo enregistrée en Amis,
  doigt (événements tactiles) glissé tout de suite → Public, flèches, Moi ↔ déclencheur, astuce
  sur un appareil neuf, Reproduire en paysage.
- Reste : essai sur un vrai iPhone (appui long dans Safari / app de l'écran d'accueil).
