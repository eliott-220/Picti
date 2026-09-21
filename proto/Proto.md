# PICTI — prototype du noyau de géocadrage

Premier prototype de **la technologie** derrière PICTI : ce qu'il faut mesurer au
moment de la photo pour pouvoir, plus tard, revenir la superposer exactement dans
son cadre d'origine.

(Index du dossier parent : [../PICTI.md](../PICTI.md) · Contexte projet : [../CLAUDE.md](../CLAUDE.md) · MVP existant : [../PICTI-MVP.md](../PICTI-MVP.md))

## L'idée en une phrase

Une photo n'est pas géolocalisée par un point GPS, mais par une **pose** : un point
*et* une direction de visée. Le point seul dit « c'était par ici » ; la pose dit
« tiens-toi là, regarde par là », ce qui est la promesse du géocadrage.

C'est l'objet central du prototype, la **GeoFrame** :

```js
{ lat, lon, alt, accuracy,      // où l'on se tenait, et avec quelle confiance
  yaw, pitch, roll,             // où l'objectif regardait (0 = nord, + = est)
  hFovDeg, aspect,              // quelle portion du monde la photo découpe
  headingSource, capturedAt }   // d'où vient le cap, et quand
```

Sept nombres suffisent à rejouer un cadrage. Le reste du prototype consiste à les
mesurer proprement, puis à les inverser.

## Démarrer

```bash
cd proto && npm test
```

```bash
cd proto && python3 -m http.server 8777
```

Puis <http://localhost:8777>. Sur Mac il n'y a ni GPS ni boussole : l'app propose
alors le **mode simulation**, qui rejoue toute la chaîne sur un monde synthétique.

> Sur téléphone, Safari et Chrome exigent **HTTPS** pour la géolocalisation, les
> capteurs de mouvement et la caméra. `localhost` est exempté, pas une IP locale :
> tester sur l'appareil demande donc un tunnel HTTPS ou une publication.

## Ce que contient le prototype

| Fichier | Rôle |
|---|---|
| `src/geocadrage.js` | Noyau pur : géodésie, orientation, projection, résolution. Aucun DOM, testable en Node. |
| `src/sensors.js` | GPS et boussole : permissions, filtrage, normalisation des trois API incompatibles. |
| `src/renderer.js` | Dessin du viseur : fantôme, mire, radar, bandeau. Ne calcule rien. |
| `src/simulator.js` | Monde synthétique pour tester sans téléphone. |
| `src/app.js` | Câblage. Volontairement mince. |
| `test/` | 52 tests, sans dépendance (`node --test`). |

La règle de séparation : **tout ce qui calcule vit dans `geocadrage.js`**, donc tout
ce qui calcule est testé. Si un calcul apparaît dans `app.js`, c'est un signal.

## Les quatre problèmes réels, et ce qu'on en a fait

### 1. Le cap absolu n'existe pas de la même façon sur deux téléphones

Trois API, incompatibles, qu'il faut ramener à une convention unique :

| Source | Plateforme | Ce qu'elle donne |
|---|---|---|
| `webkitCompassHeading` | Safari iOS | cap **vrai**, converti en `alpha = 360 − cap` |
| `deviceorientationabsolute` | Chrome Android | `alpha` déjà absolu |
| `deviceorientation` relatif | le reste | **inutilisable** — référence arbitraire |

Le troisième cas est le piège : il renvoie des angles parfaitement plausibles qui
ne veulent rien dire. Le prototype le détecte et le **signale** au lieu d'afficher
un cap faux (bandeau d'avertissement dans l'onglet Pose). Une source moins fiable
ne peut jamais écraser une source absolue déjà établie.

### 2. Du téléphone au monde : orientation → axe optique

Les angles d'Euler du navigateur (`alpha`, `beta`, `gamma`) sont une rotation
intrinsèque Z-X'-Y''. On en dérive la matrice appareil → monde ENU (est, nord,
zénith), dont on extrait la base de la caméra : l'objectif arrière regarde dans
l'axe **−Z** de l'appareil.

Deux subtilités que les tests verrouillent :

- **La rotation de l'écran ne change pas l'axe optique.** `screen.orientation.angle`
  fait pivoter les axes de l'*image*, pas l'objectif. Un test vérifie l'invariance
  de `forward` et la rotation correcte de `right` en portrait, paysage et à l'envers.
- **Verrouillage de cardan à `beta = ±90`.** Téléphone parfaitement droit visant
  l'horizon — c'est-à-dire *la* posture du géocadrage — `alpha` et `gamma` se
  confondent. La conséquence physique est réelle : un téléphone à `beta = 90` a
  forcément un roulis nul. Le code ne prétend pas le contraire.

### 3. Le GPS ment, et il ment de deux façons différentes

Un filtre de Kalman scalaire, pondéré par l'`accuracy` annoncée : l'incertitude
grandit avec le temps écoulé, chaque fix est intégré au prorata de sa qualité.
Mesuré sur GPS immobile bruité à 10 m, l'erreur est **divisée par plus de deux**.

Le rejet des sauts aberrants a demandé deux passes. La première version refusait
tout fix à plus de 6 σ — et restait accrochée à une position périmée pendant des
dizaines d'échantillons dès qu'on se déplaçait vraiment (le banc simulé l'a
montré : la distance restait bloquée à 60 m). Corrigé : **un aberrant qui se
répète n'en est pas un**. Après trois rejets consécutifs concordants, le filtre se
recale. C'est le cas de la sortie de tunnel, de la reprise de signal, du trajet
rapide.

### 4. Aucun navigateur n'expose le champ de vision de l'objectif

Sans focale, pas d'échelle : impossible de savoir quelle portion du monde la photo
découpe. Le prototype prend 66° par défaut (grand-angle typique de smartphone) et
expose un réglage. La valeur est **stockée dans chaque GeoFrame**, pour qu'une
photo prise sur un appareil reste rejouable sur un autre.

C'est la principale approximation qui reste, et elle est assumée : elle n'affecte
que la taille apparente du fantôme, pas la position ni la direction.

## Le viseur

Projection sténopé classique : la direction monde de chaque coin du cadre
d'origine est projetée dans la vue courante. La photo est ensuite plaquée sur le
quadrilatère obtenu.

Conséquence : **le fantôme est verrouillé sur le monde**. Vu de biais il apparaît
en trapèze, exactement comme une vraie fenêtre — ce n'est pas un défaut, c'est la
démonstration que la pose est correctement inversée.

Le guidage passe par quatre phases, chacune avec sa consigne :

| Phase | Condition | Exemple de consigne |
|---|---|---|
| `locating` | pas de position | « Recherche du signal GPS… » |
| `approach` | hors du rayon d'arrivée | « 120 m — tourne à droite de 40° » |
| `framing` | sur place, mal orienté | « Tu y es. Tourne à gauche de 74° » |
| `locked` | sur place et aligné | « Cadre retrouvé. Regarde. » |

Le rayon d'arrivée s'élargit quand le GPS est mauvais : à ±40 m de précision, il
serait malhonnête d'affirmer qu'on est à 20 m du but.

## Le mode photo (onglet Graver)

La caméra y est en **noir et blanc** ; seules les plaques déjà gravées à cet
endroit apparaissent **en couleur**, verrouillées sur le monde comme dans le
viseur. Le passé en couleur, le présent en gris.

- Le gris est un filtre CSS (`.stage.bw`) sur la vidéo et la scène simulée : la
  capture lit le flux brut, donc la photo gravée est enregistrée en couleur.
- Les plaques sont peintes sur le calque `#overlay`, que le filtre ne touche pas.
- Seules les plaques dont on est « sur place » (dans le rayon d'arrivée) sont
  affichées : la projection ne dépend que de la direction, elle placerait une
  plaque lointaine au mauvais endroit. L'opacité monte à mesure qu'on s'approche
  du point de prise.
- L'onglet Viser reste en couleur.

## Ce qui a été vérifié, et comment

`npm test` — 52 tests : aller-retours géodésiques, conventions W3C (`cap = 360 − alpha`),
orthonormalité de la base caméra, invariance à la rotation d'écran, projection au
centre et aux bords, monotonie du score, réduction de bruit du filtre, recalage
après déplacement réel.

Deux validations bout-en-bout menées dans le navigateur, sur le monde simulé :

1. **Replacé à sa pose d'origine, le cadre se projette pixel pour pixel** sur
   `(0,0)–(480,640)`, et l'écart moyen avec la scène vécue tombe à 8,2/255 — soit
   essentiellement le bruit de compression JPEG.
2. **Le fantôme est bien verrouillé sur le monde** : faire tourner la caméra ne
   change pas l'écart (il suit la scène), tandis que corrompre le *cap enregistré*
   le dégrade de façon monotone — 8,0 intact, 9,3 à 2°, 11,6 à 10°, 17,3 à 30°.

Portée de cette seconde mesure : elle est aveugle au roulis et au champ de vision,
parce que la scène synthétique est dominée par de grands aplats ciel/sol où une
différence de pixels moyenne ne discrimine pas. Ces deux propriétés-là sont
couvertes par les tests unitaires, pas par le banc visuel.

Limite de méthode, à garder en tête : la scène simulée et l'overlay partagent la
même projection. Une erreur de projection s'y annulerait visuellement. Le banc
prouve l'intégration et l'ergonomie ; la correction, elle, vient des tests unitaires.

## Limites connues

- **Plaquage affine par morceaux.** Canvas 2D ne sait pas faire de texture
  perspective : le quad est découpé en deux triangles affines. Invisible près de
  l'alignement, une légère cassure apparaît en vue très oblique. WebGL le
  résoudrait.
- **Pas d'altitude fiable.** L'altitude GPS est trop bruitée pour être exploitée ;
  le prototype la stocke mais ne s'en sert que si les deux points en ont une.
- **Boussole non corrigée de la déclinaison magnétique.** Un réglage manuel est
  exposé. Une vraie version interpolerait le modèle WMM à partir de la position.
- **Pas de recalage visuel.** À terme, comparer l'image live à la photo permettrait
  d'affiner l'alignement au-delà de la précision des capteurs — c'est ce que font
  les vraies piles AR (VPS). Ici tout repose sur GPS + boussole.
- **Stockage `localStorage`**, comme le MVP : pas de partage, pas de compte.

## Pistes

- Corriger la déclinaison magnétique à partir de la position.
- Affiner la pose par comparaison d'images une fois le cadre approché.
- Passer le rendu en WebGL pour une perspective exacte.
- Enregistrer `DeviceMotionEvent` en plus, pour lisser pendant les pertes de signal.
