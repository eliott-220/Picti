# Photos vues de dos, comme sur une vitre dépolie — 30 septembre 2026 (0.012.0)

Projet : [PICTI](../../CLAUDE.md) · Branche `claude/photos-de-dos-vitre` (partie de `main`)
Voir aussi : [Selfie trop grand, photo qui suit en avançant (0.011.3)](2026-09-30-selfie-et-marche.md)

## Demande d'Eliott

Jusqu'ici, une photo dépassée (vue de dos) n'était plus affichée. Elle doit rester visible,
comme imprimée sur une vitre dépolie, et s'effacer en douceur quand on la voit par la tranche.

## Ce qui a été fait

- `src/geo/projection.ts` :
  - `viewCosine(basis, depth, eye)` : |cos| de l'angle entre la visée œil → centre du plan-photo
    (`scale(basis.f, depth)`) et `basis.f` ; 1 de face ou pile derrière, 0 par la tranche ;
  - `EDGE_FADE = { hidden: 0.08, full: 0.35 }` et `edgeFade(cos)` : smoothstep de 0 à 1.
- `src/components/arProjection.ts` (`projectGeoPhoto`) : ne masque plus la photo quand `facing` est
  faux ; `fade = edgeFade(viewCosine(…))` ajouté à `ArProjection` ; visible si `fade > 0` et devant
  la caméra (sinon hors écran, `transform` null). L'homographie du plan vu de derrière donne
  d'elle-même l'image en miroir : rien n'est retourné à la main.
- `src/components/ar.tsx` : `ArPhoto glass` → classe `.glass`, opacité × `GLASS_OPACITY` (0,45,
  exporté), calque frère `div.overlay-glass` (même taille, même transformation, `aria-hidden`)
  pour le reflet.
- `src/styles.css` : `.overlay-photo.glass` (flou 12 px, saturation 0,55, luminosité 1,08, sans
  liseré) ; `.overlay-glass` (reflet à 115°, bord clair intérieur, transition d'opacité).
- Branchements : `ArSpotsLayer.tsx` (3 appels : opacité × `ar.fade`, `glass={!ar.facing}`) et
  `screens/Hunt.tsx` (opacité × `ar?.fade ?? 1`, `glass={ar ? !ar.facing : false}`). La capture
  ne change pas. Pas de texte sur la vitre (il serait en miroir).

## Vérifications

- Tests : `viewCosine` (point de vue, 12 m devant, tranche), `edgeFade` ; photo dépassée en
  regardant dans le même sens (hors écran), en se retournant à 12 m (de dos, `fade` 1, à l'écran,
  en miroir), par la tranche (`fade` 0) et de biais (`fade` entre 0 et 1). 138 tests, lint, build OK.
- Capture du viseur dans Chromium (regard au sud, photos prises vers le nord devant soi) : photos
  floues, en miroir, reflet et bord clair de la vitre.

## Mise en ligne

Pull request vers `main`, aperçu Vercel à tester. **Attention : fusionner dans `main` met en
production automatiquement** : ne fusionner qu'avec l'accord d'Eliott.
