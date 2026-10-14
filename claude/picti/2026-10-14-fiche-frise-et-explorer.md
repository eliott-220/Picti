# 0.24.3 — fiche depuis la frise et Explorer au doigt

(Parent : [CLAUDE.md](../../CLAUDE.md))

Demande d'Eliott du 14/10/2026, prompt local `PROMPT-0.024.3.md`.

## Changements

- L'image de la frise dépliée ouvre la même fiche que la photo du viseur lorsqu'elle est déjà capturée (ou appartient à l'utilisateur). La photo ouverte est celle actuellement sélectionnée ; le glissement horizontal et la réduction ne déclenchent pas de fiche. L'appui sur la vignette réduite continue à rouvrir la frise.
- Explorer s'ouvre vers le haut depuis le viseur et se ferme vers le bas depuis son en-tête / ses zones non défilables. Même verrouillage d'axe et même seuil de geste rapide que les onglets. Le contenu suit le doigt ; geste court / annulation : retour à l'état de départ. Les contrôles et la grille défilable gardent leurs propres gestes.
- Explorer ouvert masque la barre, les quatre carrés, le rail et le zoom, avec retrait de leurs surfaces natives. La couche des photos est masquée et `inert` ; la croix demeure. À la fermeture, les contrôles sont remontés.
- Pied `picti {APP_NUMBER}` ancré en bas, marge système respectée ; version dynamique, animations réduites par fondu.
- Le banc a révélé que la sélection de la frise se perdait au retour de la fiche parce que la couche RA était démontée. Elle reste maintenant montée et cachée sous la fiche / Explorer, ce qui conserve la sélection et l'état réduit.
- Version 0.24.3 dans les deux fichiers npm et les projets iOS / Android.

## Base et conservation

La 0.24.2 a été retrouvée dans le dossier temporaire de la session précédente : code présent, compilations simulateur / iPhone présentes, mais changements encore non commités au moment de la copie. Copie isolée dans `/private/tmp/picti-0243`, branche `claude/version-0.24`, afin de préserver ce travail. Commit de base local `9b9fed3` (photo de l'état 0.24.2), construit sur `54fac0f`.

## Vérification

- TypeScript / build, lint du code de l'app, `cap sync` iOS et Android : OK.
- Vitest : **527 tests réussis, 1 ignoré**, dont 6 nouveaux contrôles des gestes d'Explorer (axe, sens, seuils, vitesse, inversion, bornes).
- `xcodebuild` simulateur iOS 26.3 : **BUILD SUCCEEDED**, compilation finale sans les fixtures.
- Banc intégré **dans cette app compilée sur le simulateur**, vraie WebView et vrai Liquid Glass, fausse base Supabase (compte Bruno avec deux captures), position / boussole de test : **7/7 contrôles**. Fiche depuis la frise après changement de photo et retour conservant la sélection ; geste court ; ouverture Explorer et placement du pied ; fermeture au doigt et retour des contrôles ; boutons quatre carrés / croix ; réduction / réouverture de la frise ; tuile À proximité et retour.
- Les gestes du banc sont des événements PointerEvent injectés dans la WebView ; ils vérifient les gestionnaires et transitions réels. Vérification visuelle de la fenêtre Explorer, des boutons natifs masqués et restaurés. L'automatisation des glissés physiques via l'outil de contrôle du simulateur n'a pas fourni de mouvements exploitables : **le test tactile sur l'iPhone réel reste à faire** (également zoom, mode du déclencheur, selfie et accessibilité).
- Aucun serveur localhost, aucun push, aucune publication Vercel, aucune modification de la base réelle, aucune installation sur l'iPhone physique dans cette session.

Sauvegardes, captures et bilan dans le dossier de notes Picti, via `PICTI-0.024.3-REALISATION.md`.

## Installation sur l'iPhone — 14/10 à 11 h 26 (Paris)

À la demande d'Eliott, compilation Debug arm64 avec `VITE_PICTI_TRACE=1`, équipe Xcode `DH3DNS54X3`, puis installation en remplacement de la 0.24.2 sur son iPhone 15 Pro Max (sans désinstallation). `xcodebuild` : BUILD SUCCEEDED ; `devicectl` confirme la version 0.24.3 et le lancement. Code normal, sans fixtures du banc. Les 39 journaux existants restent sur l'appareil et une copie est conservée dans `/private/tmp/picti-0243-traces-before-install`. Pas de push ni de déploiement. Le test tactile / terrain de l'utilisateur reste à faire.
