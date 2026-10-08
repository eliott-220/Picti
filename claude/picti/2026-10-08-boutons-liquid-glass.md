# 2026-10-08 — Vrais boutons Liquid Glass dans l'app iOS (0.19.0)

Parent : [CLAUDE.md](../../CLAUDE.md)

Après la coque (0.18.0) lancée sur son iPhone, Eliott : « c'est seulement maintenant qu'on peut tester
les boutons liquid ? » puis « les 2 en même temps » (prompt `PROMPT-0.019.0.md` et code). Branche
`claude/boutons-liquid-glass`, partie de `claude/coque-capacitor`.

- **Plugin natif local `GlassButtons`** (Swift, dans l'app) : boutons `UIButton.Configuration.glass()`
  posés sur un calque transparent au-dessus de la WebView ; le JS envoie la liste des boutons (cadre,
  symbole SF, pastille, actif, estompé, visible), le natif renvoie les appuis. iOS 26+ seulement.
- **Côté web** : `RoundButton glass` + `useGlassButton` : bouton web transparent mais en place,
  position recopiée à chaque image, masqué côté natif dès qu'il est recouvert ; l'appui natif fait le
  `click()` du bouton web. Site, Android et iOS < 26 : rien ne change.
- **Viseur** : rail (notifications, carte, filtrer, rechercher, selfie), « + », Menu ; croix et
  selfie en mode Reproduire. Déclencheur resté web.
- **Vu au simulateur** (banc, compte fictif) : boutons à leur place avec pastilles, appui sur Menu →
  menu ouvert et boutons natifs cachés dessous, puis revenus ; cloche → Notifications (boutons
  retirés) ; selfie → bouton rouge. Premier essai en verre **clair** : icônes noires invisibles sur la
  caméra sombre du selfie → verre standard, qui passe du clair au sombre selon le fond.
- **Puis tous les écrans** (demande d'Eliott : « rajoute ceux de tous les autres menus : boutons retour,
  ceux dans la carte, le profil ») : `RoundButton` en verre par défaut (retour de chaque page, crayon du
  profil, « Ma position », « Liste à proximité », croix de la chasse et du recalage), nouveau
  `IconButton` pour les boutons sans fond (croix des feuilles Menu, Import, carte et fiche, QR code,
  refuser / annuler), boussole de la carte en verre avec sa flèche rouge qui tourne (`iconRotation`,
  `tint`). Vu au simulateur : menu, profil (le verre prend la teinte de la photo et de l'en-tête ; le
  crayon et le QR suivent le défilement, le retour se cache hors de l'écran), carte (boussole rouge,
  boutons cachés sous la feuille d'un groupe, croix en verre), Notifications. Premier essai : flèche
  noire (le verre impose sa couleur) → couleur fixée dans l'image.
- **Puis les pastilles et « Monde / Amis »** (demande d'Eliott : « fais aussi les boutons Toutes,
  amis… dans mes photos et monde et amis dans la carte ») : faute de savoir quel groupe il visait
  (« Tout le monde / Mes amis / Moi seul » au-dessus de « Mes photos géocadrées », ou « Toutes / En
  direct… » de la recherche), **toutes** les pastilles de choix passent en verre (`Chip` : profil,
  fiche, recherche, galerie, onglets de connexion), et « Monde / Amis » devient un vrai sélecteur
  segmenté iOS dans une capsule en verre. Vu au simulateur : « Amis » sur la carte (3 photos au lieu
  de 8), « Mes amis » dans le profil, filtres de la recherche (la pastille à moitié hors de l'écran
  reste affichée).
- **Retours d'Eliott sur iPhone** : (1) en défilant, les boutons bougeaient par rapport au texte ;
  (2) la rangée « Toutes / En direct / Selfies… » ne défilait plus (le glissement étirait le bouton
  en verre) ; (3) dans « Mes photos géocadrées », remplacer le texte rouge « Publique / Moi seul /
  Amis » par le symbole du déclencheur, petit, sans le rond rouge. Corrigé : les boutons natifs ne
  font plus que l'affichage (les touches vont au bouton web en dessous) ; ceux d'une zone qui défile
  sont posés dans la vue de défilement d'iOS de cette zone (ils défilent avec le texte, au pixel
  près) ; marge intérieure des rangées de pastilles pour l'ombre du verre ; symbole blanc (globe,
  amis, cadenas) en haut à gauche de **toutes** les vignettes de « Mes photos ». Vu au simulateur :
  rangée de filtres qui défile et appui sur « À géocadrer », profil capturé en plein élan (crayon,
  QR et pastilles collés au texte), « Tout le monde » et Menu qui répondent.
- **Retour par le bord gauche et piles glissables** (demande d'Eliott) : geste natif d'iOS sur la
  WebView (`allowsBackForwardNavigationGestures`), l'écran précédent apparaît dessous ; le calque
  des boutons fixes est passé dans la vue de défilement principale pour glisser avec la page ; le
  routeur note la profondeur dans chaque entrée de l'historique et la relit au `popstate` (un retour
  sans `goBack` ne dérègle plus « Retour »). « Mes photos » (et le profil public) : les photos d'un
  même lieu forment une pile qu'on fait glisser comme celles du viseur (`PhotoTilePile`). Vu au
  simulateur : glissement depuis le bord (Notifications → viseur, profil → viseur), pile qui passe
  à la 2ᵉ photo (cadenas d'une photo privée). Chrome : retour du navigateur puis « Retour » OK.
  Petit défaut connu : en revenant vers un écran quitté depuis le menu, l'aperçu montre le menu
  ouvert, puis l'écran retrouvé est sans lui.
- Pas vu : vraie caméra sur iPhone, mode Reproduire, VoiceOver.
- Version 0.19.0. typecheck, lint, 311 tests, build, `cap sync`, `xcodebuild` OK.
