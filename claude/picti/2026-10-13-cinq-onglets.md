# 2026-10-13 — Cinq onglets dans la barre, glissés entre eux, pile des écrans (0.23.1)

Parent : [CLAUDE.md](../../CLAUDE.md) · suite de [2026-10-12-barre-du-bas.md](./2026-10-12-barre-du-bas.md)

## Demande (Eliott, après la 0.23.0 sur son iPhone)
« À corriger 23.1 » : pictogramme du haut du corps au lieu du « E » pour le profil ; un onglet **Amis**
entre la carte et le bouton rouge (notifications juste au-dessus de la liste d'amis, dans le même
onglet) ; un onglet **Mes photos** entre le bouton rouge et le profil ; le **logo de la carte** dans la
barre en gardant le glissé ; plus de flèche retour sur le profil (glisser mène à l'écran de gauche / de
droite, de même pour les autres écrans du bas) ; le bouton **4 carrés juste au-dessus de la barre,
seulement sur l'accueil** ; sur les autres écrans avec flèche retour, **afficher directement l'ancienne
page plutôt qu'un écran blanc** avant de charger.

## Ce qui est fait
- **Barre : Carte · Amis · bouton rouge · Mes photos · Profil**, et les cinq écrans côte à côte dans cet
  ordre : glisser mène à l'écran voisin (depuis le viseur, vers la droite Amis puis la carte, vers la
  gauche Mes photos puis le profil). Le viseur ne bouge pas ; les autres glissent par-dessus depuis leur
  côté. Sur la carte, le doigt la déplace ; la bande du bord droit mène à Amis. Pictogramme rouge (en
  plein dans l'app iOS) pour l'écran affiché.
- **Profil** : pictogramme (haut du corps) dans la barre et l'en-tête, plus de flèche retour, Mes
  captures et ⚙️. **Amis** : notifications au-dessus de la liste d'amis (plus de cloche au viseur, la
  pastille est sur Amis). **Mes photos** : les piles par lieu et les photos à géocadrer.
- **Menu (4 carrés)** au-dessus de la barre, à gauche, sur le viseur seulement : À proximité ·
  Rechercher · Mes chasses · Paramètres (Carte et Amis sont dans la barre).
- **Pile des écrans** : l'écran qu'on quitte en avançant reste monté, caché ; au retour il réapparaît tel
  quel, tout de suite (défilement compris), au lieu d'être rechargé. La caméra des écrans cachés se met
  en pause.
- App iOS : gestes de WebKit coupés sur les cinq écrans de la barre ; symboles SF des boutons donnés
  directement par le JS.

## Vérifié
- Typecheck, lint, **416 tests** (11 nouveaux : `panes.test.ts`, `screenStack.test.ts`, barre native),
  build, `cap sync`, `xcodebuild`.
- **Banc réécrit** (les dossiers temporaires des sessions précédentes ont été effacés dans la nuit) :
  fausse base Supabase et plugins natifs simulés, `tools/onglets.mjs` : **site 47 contrôles, iPhone simulé
  53, tout vert** — barre et pastille, Menu au-dessus de la barre et absent ailleurs, rail, glissés dans
  l'ordre (viseur → Amis → Carte → Amis → viseur → Mes photos → Profil → … → viseur), glissé au milieu de
  la carte, bord droit, boutons de la barre, bouton rouge réduit, onglet Amis (notifications avant les
  amis, fiche ouverte depuis une notification puis retour immédiat), profil sans flèche ni initiale,
  menu qui ne reste pas ouvert sur l'écran suivant, retour des Paramètres sur le **même** profil (même
  élément, même défilement), caméra en pause sous les Paramètres et les onglets, colonne des modes,
  double appui, fiche, retirer une capture, partage ; iPhone simulé : symboles de la pilule, Menu en
  verre seulement sur le viseur, pictogramme plein sur l'écran affiché.
- Captures : [planche](./2026-10-13-cinq-onglets.jpg).

## Choix à valider
- 4ᵉ case du menu : **Paramètres** (Amis et Carte du monde sont passés dans la barre).
- La cloche du viseur est retirée (les notifications sont dans Amis, avec la pastille).
- Les notifications gardent leur texte au vouvoiement (« aime votre photo »).

## 0.23.2 (même jour)
Eliott : « la barre est un petit peu trop haute, mets-la au même niveau que sur Insta et BeReal ; le rond
rouge ne doit pas dépasser la barre, c'est moche, fais comme les autres pictogrammes ; quand on n'est pas
sur l'accueil, son pictogramme devient un appareil photo, c'est en revenant sur cette page qu'il redevient
Public, Privé ou Amis ».
- Pilule descendue : bas à 22 pt du bas de l'écran sur iPhone (au lieu de 46), juste au-dessus du trait du
  geste d'accueil, comme la barre d'Instagram ; 10 px sur un écran sans geste.
- Bouton rouge : 48 px dans la pilule, comme les autres boutons ; symbole du mode sur le viseur, appareil
  photo ailleurs (fondu au rythme du glissé ; `camera.fill` dans l'app iOS).
- Vérifié : 416 tests, banc site (51 contrôles) et iPhone simulé (58) tout vert avec les nouveaux contrôles
  (position de la barre, bouton dans la pilule et de la taille des autres, symbole du mode / appareil
  photo, natif compris) ; [captures](./2026-10-13-barre-0.23.2.jpg). Installée sur l'iPhone d'Eliott.

## Branche
`claude/barre-du-bas` (0.23.0, 0.23.1, 0.23.2). Pas fusionnée dans `main`.
