# 2026-10-12 — Photos grand angle et zoom dans le viseur (0.22.1)

Parent : [CLAUDE.md](../../CLAUDE.md) · suite de [2026-10-12-profil-en-glissant.md](./2026-10-12-profil-en-glissant.md)

## Demande
Eliott : « rajoute la possibilité de faire des photos grand angle et de zoomer » ; numéro demandé : 0.22.1
(la 0.22.0 est le tutoriel du premier lancement, codé en parallèle sur `claude/photo-essai`).

## Ce qui est fait
- Boutons d'objectif au-dessus du déclencheur, comme sur l'iPhone : « 0,5 · 1× · 2 · 5 » (le dernier =
  facteur du vrai téléobjectif quand l'app iOS le connaît), celui qui porte le zoom l'affiche (« 1,4× ») ;
  vrais boutons Liquid Glass dans l'app iOS 26+. Pincer à deux doigts pour zoomer ; relâché près d'un repère,
  le zoom s'y range. Accueil et « Reproduire » ; pas en selfie ; chasse et recalage restent à 1×.
- **Géocadrage juste à tous les zooms** : le zoom multiplie la focale de l'image affichée et de la photo.
  Les photos du décor ne glissent pas quand on zoome ; une photo prise au 0,5 est enregistrée avec ~13 mm et
  réapparaît dans le décor avec son vrai champ de vision.
- **Trois façons de zoomer** (`src/geo/zoom.ts`, `zoomPlan`) :
  - caméra web qui sait zoomer (Safari 17+ sur iPhone : 0,5 = vrai ultra grand-angle, 5 = vrai
    téléobjectif ; vérifié dans le code de WebKit, `AVVideoCaptureSource.mm` : zoom ramené à 1 = objectif
    principal sur les caméras « virtuelles » triple / double grand-angle, de 0,5 à 10) : flux déjà zoomé ;
  - caméra web sans zoom (Android, ordinateurs) : agrandie à l'écran et photo recadrée, de 1 à 5 ;
  - **app iOS (ARKit)** : ARKit ne filme qu'avec l'objectif principal (pas d'ultra grand-angle en suivi du
    monde, d'après les forums développeurs d'Apple). De 1 à 5 : image d'ARKit agrandie par le plugin, photo
    haute résolution recadrée (2× : 1512 × 2016). **0,5 : la caméra web prend le relais** (vrai ultra
    grand-angle), le suivi visuel s'arrête le temps du grand angle, comme pour un selfie : les photos du décor
    tiennent alors au GPS et à la boussole ; au retour à 1×, le calage d'ARKit repart de zéro.
- Focale de l'ultra grand-angle mesurée en tournant, à part (`picti.focale.ultra-grand-angle`) ; sinon la
  moitié de la principale.
- « Reproduire » part du cadrage de l'originale (photo au grand angle → 0,5).

## Vérifié
- Typecheck, lint, **378 tests** (11 nouveaux : `zoom.test.ts`, `usePinchZoom.test.ts`), build, `cap sync`,
  app iOS compilée (Xcode 26.3, `generic/platform=iOS`).
- Banc « iPhone simulé » (faux ARKit qui zoome, caméra web simulée avec le zoom de Safari 0,5–10) :
  ouverture en ARKit avec 0,5 · 1× · 2 · 5 ; 2 → image agrandie, suivi actif, photo 360 × 480 au lieu de
  720 × 960 et focale doublée ; 0,5 → ARKit arrêté, caméra web au zoom 0,5, photo à 13 mm ; 1× → ARKit
  repris, caméra web coupée ; pincer ×3 puis ×2 (rangé), pincer fort sous 1 → 0,5, écarter depuis le 0,5 →
  ARKit ; selfie sans boutons ; aucune erreur.
- Calage sur le décor, capteurs figés pendant la mesure : à 2×, chaque photo s'écarte deux fois plus du
  centre et grandit deux fois (ARKit, caméra web zoom matériel, zoom numérique). Site sans zoom matériel :
  pas de 0,5, vidéo agrandie, photo recadrée 1280 × 960. Reproduire d'une photo au 0,5 → viseur au 0,5.
- Gestes : pincer en partant d'une pile → zoom, la pile ne défile pas, rien ne s'ouvre ; les scénarios du
  glissement vers le profil (0.21.1) passent tous.
- **Pas encore vu sur l'iPhone** : vrai ultra grand-angle dans la WebView de l'app, image d'ARKit agrandie,
  netteté des photos recadrées.

## Branche
`claude/grand-angle-et-zoom`, partie de `claude/profil-en-glissant` (0.21.1, elle-même sur la 0.21.0). La
0.22.0 (`claude/photo-essai`) part de la 0.21.0 : fusion à faire au moment de rassembler les versions.
