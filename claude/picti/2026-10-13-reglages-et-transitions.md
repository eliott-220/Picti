# 2026-10-13 — Réglages réparés, appareil photo seul hors du viseur, pages qui se poussent (0.23.3)

Parent : [CLAUDE.md](../../CLAUDE.md) · suite de [2026-10-13-cinq-onglets.md](./2026-10-13-cinq-onglets.md)

## Demande (Eliott, 13/10 à 10 h 34, après la 0.23.2 sur son iPhone)
« bouton réglage dans profil bug, enlever la bulle rouge et ne laisser que l'appareil photo quand on est
pas sur l'accueil, rajouter une petite animation quand on passe du pictogramme appareil photo aux autres
et inversement, lorsqu'on passe d'une page à une autre SAUF ACCUEIL, faire glisser les pages entre elles
comme si elles poussent la suivante au lieu de la faire passer par dessus mais garder ça pour celles qui
vont sur l'écran accueil ». Sur l'iPhone : appui sur Réglages → profil figé, « Tout le monde / Mes amis /
Moi seul » visibles mais sans effet, seul le retour marche.

## Cause du bug Réglages
Régression de la pile des écrans (0.23.1) : l'écran quitté reste monté, caché par
`.screen-slot.covered { visibility: hidden }` — mais l'onglet affiché déclare `visibility: visible`
(`.shell-pane.shown`), ce qui l'emporte, et son z-index 26 le plaçait **par-dessus** l'écran ouvert depuis
lui. Mon profil couvrait donc les Paramètres ; dans l'app iOS, seuls les boutons en verre natif (retour et
les trois pastilles) se dessinaient au-dessus du profil figé. Même défaut pour toute page ouverte depuis
un onglet (fiche d'une photo depuis Mes photos ou Amis). Le banc ne l'avait pas vu : Chrome laisse passer
les clics à travers un écran `inert`, et les contrôles lisaient le texte de l'écran du dessus.

## Ce qui est fait
- **Pile des écrans** : chaque écran est un calque à part (`isolation: isolate`) ; caché, il cache tout son
  contenu (`.screen-slot.covered *`). Le menu Explorer, qui doit passer sous la barre, est rendu dans
  l'écran (`Sheet inPlace`).
- **Hors du viseur, appareil photo seul** (carte, Amis, Mes photos, Profil, menu ouvert) : plus de rond
  rouge, pictogramme de la taille et de la couleur des autres. **Animation** (~240 ms, ou sous le doigt
  pendant un glissé, en arrière s'il est annulé) : le rond rétrécit et s'efface, le symbole du mode
  s'efface en tournant, l'appareil photo arrive en tournant ; « Réduire les animations » : simple fondu.
  App iOS 26+ : le natif suit `--away` image par image ; l'appareil photo est dessiné **dans** la pilule
  Liquid Glass, comme les autres pictogrammes.
- **Pages qui se poussent** (300 ms, même courbe partout) : entre deux onglets qui ne sont pas le viseur
  (au doigt comme par la barre ; la barre ne bouge pas, seul l'onglet actif change), et entre deux pages
  (Mon profil › Paramètres, Mes photos › fiche… ; retour par la flèche dans l'autre sens). **Inchangé** :
  tout ce qui va vers le viseur ou en part, et le retour du système (geste d'iOS, bouton du navigateur ou
  d'Android) — iOS a déjà fait glisser les écrans, pas de double animation. Pas de rechargement (carte
  comprise).
- Trouvé en route, corrigé : pendant un glissé, l'onglet qui arrive était `inert`, donc « transparent »
  pour la détection de ce qui est au premier plan : le bouton « à chasser » du viseur, en verre natif, se
  dessinait par-dessus lui (vu au simulateur). Les écrans qui bougent ne sont plus `inert`.

## Vérifié
- Typecheck, lint, **425 tests** (nouveaux : poussée des onglets, passages de la pile, aspect du bouton
  rouge et de l'appareil photo natifs).
- Banc (`tools/transitions.mjs`, nouveau) : **site 57 contrôles, iPhone simulé 72**, tout vert —
  Réglages (depuis la barre et depuis le glissé) : Paramètres au premier plan, chaque choix appuyable,
  actif, enregistré et encore là à la réouverture, 7 appuis sur la version → Avancé, retour sur le même
  profil (pas rechargé, défilement gardé), Modifier et la barre répondent ; fiche depuis Mes photos
  devant ; plus de rond rouge hors du viseur (natif compris), appareil photo comme les autres ; animation
  progressive, au doigt et annulée, fondu seul en « Réduire les animations » ; positions des deux pages à
  mi-passage (collées), barre immobile, carte pas rechargée ; passages vers / depuis le viseur comme
  avant ; retour du système sans animation ; aucun verre natif du viseur pendant les poussées. Banc
  `onglets.mjs` de la 0.23.1 / 0.23.2 : site 51, iPhone simulé 58, tout vert (deux contrôles mis à jour :
  la pilule a maintenant l'appareil photo, le rond natif s'efface hors du viseur).
- **Simulateur iOS 26.3** (vrai WebKit, vrai Liquid Glass, version du banc) : Profil › Réglages ouvre les
  Paramètres en entier, « Moi seul » puis « Mes amis » répondent, retour → Mon profil utilisable, barre qui
  répond ; le mode choisi est gardé après relance.
- Captures : [planche](./2026-10-13-reglages-et-transitions.jpg).

## Installée
Sur l'iPhone d'Eliott le 13/10 à 15 h 08 : version de test 0.23.3 (avec les journaux de trajets), à la
place de la 0.23.2 ; les 24 journaux restent sur l'iPhone (copie de secours dans le dossier temporaire
de la session). Ces journaux ne notent que position, suivi visuel et boussole : rien sur les écrans, d'où
la reproduction au banc et au simulateur.

## Branche
`claude/barre-du-bas` (0.23.0 → 0.23.3). Pas fusionnée dans `main`.
