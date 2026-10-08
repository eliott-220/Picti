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
- Pas vu : vraie caméra sur iPhone, mode Reproduire, VoiceOver, défilement rapide sur un vrai
  téléphone (léger retard possible des boutons qui défilent).
- Version 0.19.0. typecheck, lint, 308 tests, build, `cap sync`, `xcodebuild` OK.
