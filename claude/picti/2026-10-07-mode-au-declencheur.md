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

## Vérifications

- 289 tests (10 nouveaux : `shutterModes.test.ts`, `shotVisibility.test.ts`), lint, build.
- Banc local (fausse base, capteurs simulés, Chrome sans interface) : pastille absente, Public à
  la première ouverture, appui long → réglette, glisser → Amis puis Privé (bloqué au bout), relâcher
  → mode Amis sans photo, rechargement → toujours Amis, appui court → photo enregistrée en Amis,
  doigt (événements tactiles) glissé tout de suite → Public, flèches, Moi ↔ déclencheur, astuce
  sur un appareil neuf, Reproduire en paysage.
- Reste : essai sur un vrai iPhone (appui long dans Safari / app de l'écran d'accueil).
