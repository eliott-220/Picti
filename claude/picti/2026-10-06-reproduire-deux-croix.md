# Reproduire : deux croix à aligner — 6 octobre 2026 (0.016.1)

Projet : [PICTI](../../CLAUDE.md) · Suite de [Reproduire et GPS](2026-10-06-reproduire-et-gps.md) et [0.016.0](2026-10-06-fiche-photo.md).

## Demande et base

Prompt 0.016.1 : remplacer les jauges numériques de Reproduire par deux croix qui permettent de retrouver l'orientation enregistrée. Publication directe demandée. Base : `197fb70` de `origin/main`, version 0.16.0 intégrant déjà la 0.15.2. Le main divergent du dossier local de notes n'est pas utilisé.

## Réalisation

- Croix blanche fixe au centre du viseur, croix cible jaune avec contour sombre ; superposition jaune et « Orientation alignée », sinon « Alignez les deux croix ». Un petit repère sur le bras supérieur distingue les quarts/demi-tours ; consigne de rotation quand le roulis reste à corriger.
- `reproduceOrientation` projette l'axe enregistré dans la base optique courante (`projectPoint`, `viewportCamera`, `coverViewport`). Aucun GPS dans ce calcul. Cap 359°/1° et verticale traités par vecteurs ; cible hors champ = flèche au bord ; derrière ou profondeur nulle = consigne, aucune croix mobile.
- `useOrientation` expose aussi sa dernière base corrigée du nord **avant lissage** et son heure. Le verdict fin utilise cette mesure et les tolérances existantes 6° / 6° / 12°, exprimées dans le repère du viseur. La position visuelle utilise le lissage existant de 40 ms. La superposition est aimantée dans les tolérances.
- Mesure invalide, non absolue, ou sans événement depuis 1,5 s : « Alignez la photo à l’œil », sans cible. Boussole réactivable depuis Reproduire. Aide masquée en arrière-plan, sous les feuilles/image figée, quand la caméra est indisponible et à la sortie du mode.
- Zone vidéo mesurée séparément de l'en-tête et des commandes : croix au centre optique, portrait et paysage. La vidéo et le calque utilisent le même recadrage. Selfie : base optique avant pour calculer, miroir appliqué une seule fois à l'affichage de la cible et du calque enregistré non miroir.
- Distance, avertissements GPS et éloignement conservés, même avec « Orientation alignée ». **Aucune modification** de `sameView`, `reproduceStatus`, `version_of`, des règles de capture, likes, visibilité, photos classiques ou de la base. Les tolérances fines de l'aide ne conditionnent ni le déclenchement ni le rattachement (20°/15°, sans critère de roulis).

## Vérifications

- 279 tests Vitest réussis, dont 12 nouveaux tests géométriques : quatre directions, convergence, cible inclinée, 359°/1°, roulis 90°/180°, zénith/nadir, rotations écran, vidéo recadrée, hors champ, derrière, selfie, données invalides et indépendance distance/rattachement.
- TypeScript, lint et build de production réussis. Avertissement préexistant sur les gros bundles Vite (carte).
- Chrome avec vraie application et base Supabase **fictive**, caméra/GPS/orientation simulés : portrait 390 × 844, paysage 844 × 390 ; centre de la croix vérifié contre le rectangle vidéo (390 × 529 en portrait, 732 × 282 en paysage). Directions et convergence, cible inclinée à 25°, hors champ/derrière, capteurs arrêtés puis invalides puis rétablis, opacité manipulable, selfie (vidéo/calque/croix miroir une fois), fonds blanc/noir inspectés, masquage en arrière-plan et sortie du mode. Aucune erreur JavaScript.
- Parcours de non-régression : orientation alignée à 20 m avec alerte « Trop loin » ; déclenchement → feuille (croix masquées) → photo classique sans `version_of`. Roulis cible 30° : aide non alignée, déclenchement et rattachement à la parente réussis. Orientation alignée et avertissement GPS ±20 m visibles simultanément. Accueil plein écran préservé à la sortie de Reproduire.
- Banc local non publié : `.bench/verify.mjs` (base fictive reprise du banc 0.16.0) ; captures dans `/private/tmp/picti-0161-shots`. Aucun accès à la base réelle pour ces vérifications.

## À tester sur un vrai iPhone

Boussole magnétique/gyroscope réels (latence, tremblements et précision), permission iOS, rotation physique portrait/paysage, retour d'arrière-plan, caméra avant/arrière et visibilité en plein soleil. Le navigateur simulé ne valide pas ces conditions matérielles.
