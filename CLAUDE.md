# CLAUDE.md — projet PICTI

Mémoire de projet pour Claude. Lire aussi `README.md` (fonctionnalités, architecture, limites).

## Le projet

**PICTI** = application de **géocadrage** : ancrer une photo à la position GPS et à
l'orientation exactes (cap, inclinaison, roulis) de sa prise de vue, pour la redécouvrir
*in situ* en réalité augmentée. Concept de Yannick Devin et Denis Servais (2018, La Rochelle).
Porté aujourd'hui par Eliott (dépôt `eliott-220/picti`).

Vocabulaire (à respecter dans l'UI, toujours en français) :

- **Géocadrage en direct** : photo prise dans PICTI, géocadrée à la volée (gratuit).
- **Géocadrage en différé** : photo importée, géocadrée via EXIF (auto) ou recalée à la main
  sur le lieu (payant dans le modèle économique).
- **Chasse** : aller retrouver une photo sur place ; une fois aligné sur son point de vue,
  la photo est **capturée**. **Chasseurs** = ceux qui chassent mes photos ; **proies** =
  ceux dont je chasse les photos ; **captures/prises** = photos retrouvées.
- Arborescence des maquettes : Accueil (capturer / géocadrer en direct ou en différé),
  Moi (Mon profil, Mes photos géocadrées, Mes chasseurs), Mes amis (Mes prises, Mes proies).

## Sources (Google Drive du projet)

- `PICTI - Présentation - Sans compression.pdf` (42 p., id `1Fn8JjNKLyS3UPEzrJg9968-nS-T0wrse`)
- `PICTI _ PRESENTATION SIMPLIFIEE.pdf` (id `1Pfk6kFHRufEUeJJxI7yfv3MZM4dssGf2`)
- `PICTI - Storyboard - Compression forte.pdf` (id `1EwCYqCvMtMeEhpkY24It2r1S2OJ7yrTw`)
- Carte mentale `Picti.jpg` / `PIcti.xmind` (dossier Analyse fonctionnelle / V2)
- Maquettes d'écrans : dossier `Ecrans/V2` (Accueil, Profil, Mes chasses, Capture…)
- Ancien APK de démo : `APK/Picti_demo_no_circle.apk`

Charte (maquettes V2) : rouge `#eb0c0c`, saumon `#ff8484`, blanc ; cartes empilées à grands
coins arrondis ; boutons ronds blancs flottants ; police ronde (Outfit).

## Technique

- Vite + React 19 + TypeScript, PWA statique (routage par ancre `#/…`).
- Backend **Supabase** (projet `picti`, ref `fiybbfiyrnptnpwqkrji`, Paris) : compte obligatoire
  (e-mail + mot de passe ; **mot de passe oublié** depuis 0.010.0 : `resetPasswordForEmail` → lien vers `window.location.origin` → écran `NewPassword`, repéré par `openedFromRecoveryLink` lu avant que Supabase n'efface l'adresse, et par l'événement `PASSWORD_RECOVERY`), tables `profiles`, `friendships`, `photos`, `captures`, RPC
  `nearby_photos`, bucket privé `photos` (dossier par utilisateur, URLs signées). Toutes les
  règles d'accès sont en RLS : voir `supabase/migrations/`. Visibilité par photo :
  `public` / `amis` / `prive` — **`amis` par défaut** depuis 0.14.0 (voir « Amis et visibilité »).
  Config client : `src/config.ts`.
- Modèle économique : géocadrage en direct gratuit ; **Premium** (colonne `profiles.plan`,
  non modifiable par l'utilisateur) : enregistrer les photos des autres
  (`SAVE_OTHERS_PREMIUM_REQUIRED = true`) et le géocadrage en différé
  (`DIFFERE_PREMIUM_REQUIRED = true`, doublé côté serveur par le déclencheur
  `photos_differe_premium`) — `src/config.ts`. Plus de période d'essai gratuite. Accès Premium :
  paiement (à venir) ou **code** (`PremiumCard` → RPC `redeem_premium_code`, codes hachés
  bcrypt dans `private.premium_codes`, 5 essais/heure). Ne jamais écrire un code en clair
  dans le dépôt ; gestion des codes : voir `supabase/migrations/20260928160000_premium_codes.sql`.
- Carte du monde : `src/screens/WorldMap.tsx` (chargée à la demande), MapLibre GL 6 +
  fond OpenFreeMap (gratuit, sans clé), regroupement Supercluster (vignette = photo la plus
  récente), RPC `photos_in_bounds`. Carte **orientable** depuis 0.011.0 (rotation à deux doigts,
  à plat : `touchPitch` coupé, `maxPitch: 0`) ; bouton boussole `.map-north` (visible dès que la
  carte est tournée, remet le nord en haut) ; les cônes de direction des vignettes sont
  compensés (`heading - bearing`). Vignettes et point « moi » : éléments React (portail dans le
  conteneur de la carte) **replacés directement à chaque événement `move`** (`place`, attributs
  `data-lon`/`data-lat`/`data-heading`) : sur iPhone, le rendu React attend la fin du geste et
  les vignettes restaient figées 2 à 3 s (corrigé en 0.011.3). Le processus de fond MapLibre est assemblé par Vite
  (`?worker&url` + `setWorkerUrl`). Filtre **Monde / Amis** (depuis 0.14.0) : voir « Amis et visibilité ».
- **Amis et visibilité** (depuis 0.14.0, migration `20261006120000_amis.sql`) :
  - **Visibilité par défaut** : `profiles.default_visibility` (`amis` par défaut, modifiable par
    son propriétaire — droit de colonne accordé, `plan` toujours exclu) ; défaut de
    `photos.visibility` passé à `amis` (les photos déjà publiées gardent la leur). Réglage dans
    Moi (« Mes nouvelles photos sont visibles par : Tout le monde / Mes amis / Moi seul »).
    **Depuis 0.17.0, l'app ne lit plus cette colonne** (voir « Choix à la prise »).
    `addPhoto` sans visibilité → `getShotVisibility()`. Libellés partagés dans
    `src/data/types.ts` (`VISIBILITIES`, `VISIBILITY_SHORT`, `VISIBILITY_AUDIENCE`, `VISIBLE_BY`,
    `visibilityHelp`). Vignettes de « Mes photos » (et du profil public) : une pile par lieu, **glissable** depuis
    0.19.0 (`PhotoTilePile`, `src/components/ui.tsx` : `useCardSwipe` comme les piles du viseur,
    la photo suivante dessous — `.tile-under`, `inert` —, points qui suivent, `touch-action: pan-y`
    pour garder le défilement vertical ; appui = fiche de la photo affichée). Symbole du mode en haut à gauche, comme au déclencheur (`PhotoTile visibility`, `.tile-visibility` : globe / amis / cadenas blancs avec ombre, sans pastille, sur toutes les vignettes ; avant le 08/10, texte rouge « Publique / Amis / Moi seul » seulement quand la visibilité différait du mode actuel).
  - **Choix à la prise** (0.17.0, à la demande d'Eliott) : plus de pastille au-dessus du
    déclencheur. Le déclencheur (`src/components/Shutter.tsx`) montre le symbole du mode (globe /
    amis / cadenas, `VISIBILITY_ICON`) ; appui court = photo ; **appui long (300 ms) ou glissement
    horizontal (> 12 px)** = le bouton lui-même devient un **carrousel** (0.17.1) : il grossit
    (×1,12), les symboles des autres modes apparaissent à gauche et à droite, flous et pâles ; ils
    **suivent le doigt** (glisser à gauche fait entrer celui de droite ; ordre Public · Amis · Privé,
    un symbole tous les 72 px, résistance au-delà des bouts : `stripOffset`), celui qui entre dans le
    cercle devient net et son nom s'affiche au-dessus du cercle (effacé à mi-chemin : `labelOpacity`) ;
    aspect selon la distance au centre : `modeLook` (`src/components/shutterModes.ts`). Relâcher :
    le nom disparaît, le symbole le plus proche se range dans le cercle (180 ms), mode gardé **sans
    prendre de photo** (le `click` qui suit est avalé), pas de toast. Clavier : flèches gauche / droite.
    `touch-action: none` et pas de menu contextuel sur le bouton (appui long iOS / Android).
    Mode : **Public à la première ouverture**, puis le dernier choix est gardé d'une ouverture à
    l'autre sur l'appareil (`localStorage` `picti.visibilite`, `useShotVisibility` /
    `setShotVisibility` / `getShotVisibility`, `src/data/shotVisibility.ts`). Le même mode est
    affiché et modifiable dans Moi (« Mes nouvelles photos sont visibles par… ») et dans
    `ImportSheet` (pastille `VisibilityPill`, tout le lot) : le changer là le change au déclencheur.
    Les 3 premières photos, tant que le mode n'a jamais été changé, le toast ajoute « — restez
    appuyé sur le déclencheur pour changer » (`takeVisibilityHint`, `picti.astuce.visibilite`).
    `profiles.default_visibility` n'est plus lu ni écrit par l'app (colonne gardée).
  - **Invitations** : lien `https://picti.vercel.app/#/ami/<CODE>` (`inviteLink`, `APP_URL`,
    `src/data/invite.ts` ; route `ami`) → écran `Invite` (« <Nom> (<ville>) veut être votre ami
    sur PICTI », « Ajouter » = `requestFriend`, qui accepte si l'autre m'a déjà demandé ;
    « Plus tard » ; son propre lien → « C'est votre lien »). Ouvert sans être connecté :
    `Auth` le garde (`rememberInvite`, `localStorage` `picti.invitation`) et `Screens` y revient
    après la connexion ou la confirmation de l'e-mail (`takePendingInvite`). Mes amis : « Inviter »
    (`navigator.share`, repli copie), QR code du lien (`qrcode`, chargé à la demande, SVG en
    `<img>`), recherche par nom (RPC `search_profiles` : connectés seulement, ≥ 3 lettres,
    `ilike` avec `%`/`_` échappés, 20 résultats, ni moi ni mes amis ; état « Demande envoyée »
    / « Accepter »). Pastille du nombre de demandes reçues sur le bouton du menu et l'entrée
    « Mon profil » (→ `#/profil/amis`) ; amis relus au retour dans l'app (`visibilitychange`).
  - **Carte Monde / Amis** : `photos_in_bounds(…, p_scope text default 'monde')` (`monde` |
    `amis`, autre valeur refusée) ; en `amis` : `owner = auth.uid() or private.are_friends(…)`,
    RLS toujours appliquée (security invoker). Changer de filtre vide les photos chargées et
    recharge la zone visible sans recentrer ; choix mémorisé (`localStorage`
    `picti.carte.filtre`) ; « Amis » sans ami → « Ajoutez des amis pour voir leurs photos ».
- **Likes et reproductions** (depuis 0.15.0, migration `20261006160000_likes_et_reproductions.sql`) :
  - **Likes** : table `photo_likes` (une ligne par personne et par photo, `on_site`) ; RLS : je ne
    vois / crée / retire que mes likes, sur une photo que j'ai le droit de voir et qui n'est pas la
    mienne ; l'auteur voit qui a aimé (`fetchLikers`, « Aimée par … », épingle = sur place).
    `photos.likes_count` tenu par déclencheur (`private.on_photo_like`) ; les compteurs ne
    s'écrivent pas depuis l'app (`private.protect_photo_counters`, `pg_trigger_depth()`). UI :
    `LikeButton` (optimiste, annulé si la base refuse ; `toggleLike`, `likes`, `likeCounts` pour les
    photos de la carte) sur la fiche, la frise du viseur et de la chasse, la carte de la pile de la carte.
  - **Capturer = aimer** : déclencheur `after insert on captures` (`private.on_capture`) → like
    `on_site` (ou le like à distance qui le devient, jamais deux) + notification « capture ». Un like
    sur place ne se retire pas tant que la capture existe (policy de `delete`).
  - **Notifications** : table `notifications` (`like` / `capture`), créées par les déclencheurs
    seulement (jamais à soi-même ; un like retiré efface sa notification non lue), lues et marquées
    lues par leur destinataire (droit sur `read_at` seulement). Cloche dans le rail de l'accueil
    (pastille des non lues), écran `#/notifications` ; likes d'une même photo regroupés
    (`groupNotifications`, « Paul et 4 autres aiment votre photo »). Supabase Realtime (table dans la
    publication `supabase_realtime`), à défaut relues toutes les 60 s ; toujours au retour dans l'app.
    **Push** : table `push_subscriptions` prête, envoi pas branché (voir la note de session).
  - **Vues et versions** (`src/geo/views.ts`) : VUE = même lieu ET cap à ±20°, inclinaison à ±15°
    (`sameView`, orientation enregistrée — celle de l'objectif avant pour un selfie).
    `photos.version_of` = photo parente : celle de « Reproduire » (si la nouvelle est bien dans sa
    vue ; visibilité ramenée à la sienne au plus, `capVisibility`), sinon `chooseParent` (photo de la
    vue que j'ai capturée le plus récemment, sinon la plus ancienne ; privées et moins visibles
    écartées) — dans `addPhoto` ; refusée par la base → enregistrée sans parente. Contrôle en base
    (`private.check_photo_version` : parente visible par l'auteur, non privée, même vue avec 1 m / 1°
    de marge ; jamais plus visible qu'elle) ; `versions_count` par déclencheur. Une reproduction est
    une photo comme les autres, avec ↻ (`VersionBadge`, `.tile-meta`, `.overlay-version`, anneau dans
    `Dots`) ; son détail montre la parente (`ParentBlock`, « Reproduction d'une photo qui n'est plus
    disponible » sinon) et « Avant / après » (`BeforeAfter`) ; une photo reproduite, « ↻ Reproduite
    n fois » (`loadVersions`, RLS : seulement celles que je peux voir).
  - **« Reproduire cette photo »** (après une capture : dialogue de la chasse, toast du viseur ; détail
    d'une photo capturée) → `#/reproduire/<id>` = l'accueil en mode reproduction (`Home reproduce`) :
    l'originale en calque centré avec son champ de vision réel (comme Recaler), opacité réglable,
    deux croix à superposer (`ReproduceCrosshairs`, depuis 0.16.1) ; la photo prise passe par `addPhoto` → détail de la version.
  - **S'éloigner avant de déclencher** (depuis 0.15.2, `src/geo/reproduce.ts`, testé) :
    `reproduceStatus(viewer, parent, accuracy, previous)` → `in-view` | `drifting` (dans la vue mais
    au-delà de `REPRODUCE_DRIFT_RATIO` = 70 % du rayon) | `out` (trop loin, ou cap / inclinaison hors
    tolérance ; `reason`) | `lost` (> `REPRODUCE_LOST_DISTANCE` = 50 m) | `gps-weak` (précision >
    `GPS_GOOD_ACCURACY`), plus `view` (position dans la vue, même GPS imprécis), distance, cap pour y
    retourner, rayon. `inView` = **exactement `sameView`** (la règle de `version_of` ; grille de cas
    testée) ; l'état affiché est amorti sans horloge cachée (heure et état précédent en paramètres) :
    `out` seulement après `REPRODUCE_OUT_DELAY_MS` (2 s) d'écart, retour seulement
    `REPRODUCE_HYSTERESIS_M` (1 m) à l'intérieur du rayon (et de 50 m). Hook `useReproduceStatus`
    (recalcul toutes les 200 ms, vibration courte au passage à `out`). Textes : `src/data/shotWarnings.ts`
    (testés). UI : bandeau orange « Revenez de 2 m » / rouge « Trop loin de la photo d'origine (14 m) »,
    « Tournez-vous vers la gauche », « Levez le téléphone » + flèche (`.reproduce-alert`), calque à
    35 % hors de la vue, ⚠ sur le déclencheur (`.shutter-warn`) ; `lost` : calque masqué, carte « Vous
    avez quitté le lieu de la photo » (« Y retourner » = la carte s'efface, flèche et distance ;
    « Quitter Reproduire ») — le mode ne se ferme jamais seul ; `gps-weak` : pastille « GPS imprécis
    (±18 m), patientez ». **Au déclenchement, c'est le verdict immédiat (`inView`) qui décide**, pas
    l'état affiché : hors de la vue, image **figée tout de suite** (`.frozen-shot`) puis feuille
    (« Cette photo ne sera pas une reproduction : vous êtes à 14 m du point de vue de la photo de
    Marie (il faut être à moins de 6 m). ») : « Revenir au point de vue » (jette l'image) / « Garder
    en photo classique » (`addPhoto(…, { versionOf: null })`, visibilité de la pastille = réglage
    de l'utilisateur, pas celle de l'originale). Filet de sécurité : base qui refuse `version_of`
    → réessai sans parente, toast « Enregistrée comme photo classique : vous n'étiez plus dans la vue
    de l'originale ». Contrôle en base vérifié le 06/10 (fonction en ligne = migration 0.15.0) : il
    tolère 1 m et 1° de plus que le client, donc accepte tout ce que le client juge dans la vue —
    aucune migration.
  - **Pile triée** (`pileOrder`, `photoPileOrder`) : score `PILE_SCORE` (likes ; poids des likes sur
    place prévu pour plus tard) décroissant, la plus récente à égalité, photo ajoutée depuis moins de
    `NEW_PHOTO_BOOST_HOURS` (24 h) en tête. `groupBySpot(items, point, date, order)` ancre toujours le
    lieu sur sa photo la plus récente puis range la pile. Carte : vignette d'un lieu / d'un groupe =
    tête de pile (`photos_in_bounds` renvoie `likes_count`, `version_of`, `accuracy`).
  - **Galerie d'un lieu** (`#/galerie/<id>`, appui sur les points) : grille de toutes les photos du
    lieu (`loadSpot` les charge depuis la carte, RPC `nearby_photos` à 10 m), tri « Les plus aimées »
    (par défaut) / « Les plus récentes » (ajout) / « Date de prise », mémorisé (`picti.galerie.tri`).
- **Fiche d'une photo** (depuis 0.16.0, `src/screens/PhotoDetail.tsx`, route `#/photo/<id>`,
  `#/photo/<id>/fil` = directement sur « Au fil du temps ») : la photo **en grand** occupe tout
  l'écran à l'ouverture (`.detail-photo.full`, pile du lieu glissable, couleurs / N&B inchangés,
  dégradé), poignée `.detail-handle` (bouton) qui fait défiler jusqu'à la fiche. De haut en bas :
  actions (Capturer / Revoir in situ ou Géocadrer sur place, Reproduire si capturée, Enregistrer) ;
  **auteur** (`AuthorBlock` : ligne entière → `#/personne/<owner>`, ville lue par
  `usePublicProfile`, `FriendButton` ; ma photo : « Vous ») ; **prise de vue** (`shotDateText` :
  « Prise le mardi 6 octobre 2026 à 14 h 32 », heure locale, espaces insécables ; importée et prise
  un autre jour : « · ajoutée à PICTI le … » ; date inconnue : « Ajoutée à PICTI le … » ; distance,
  mode, selfie, capturée) ; **photos liées** (remplacent `ParentBlock` / `VersionsBlock` de la
  0.15.0) : `ParentSection` « D'après la photo de … » (grande vignette `PhotoTile size="wide"` de
  l'originale → sa fiche, Avant / après, « Voir les n autres reproductions » → `/photo/<parente>/fil` ;
  originale invisible : « Reproduction d'une photo qui n'est plus disponible ») puis
  `TimelineSection` « Au fil du temps · refaite n fois » (frise `timelineOrder` : la photo d'abord,
  « Originale » — « Cette photo » si elle-même est une reproduction —, puis ses reproductions
  directes par date de prise ; Avant / après sur chacune ; `hiddenVersionsText` « et n autres que
  vous ne pouvez pas voir » ; aucune : « Personne n'a encore refait cette photo » + Reproduire ou
  « Capturez-la sur place… » ; montrée pour une photo géocadrée non privée, et pour une reproduction
  seulement si elle a été refaite) — données : `useVersions` (une requête `version_of = id` par
  photo et par visite, puis lues dans le store) ; **Ma photo** (`MyPhotoBlock` : titre / Renommer,
  visibilité, distance du sujet, « Aimée par … » — noms → profils —, supprimer) ;
  **Détails techniques** repliés (`<details>` : statut, cap, inclinaison, roulis, position — la
  mienne —, précision, focale, dimensions). Logique pure : `src/data/versions.ts`.
  - **Fiche en feuille** (`PhotoSheet`, même contenu, sans pile ni chasse) : juste après une
    capture, chasse (`Hunt` : phases `hunting` → `captured` = célébration `CELEBRATION_MS` 1,5 s,
    `.capture-celebration`, un appui l'abrège → `sheet` → `contemplating` avec bouton « Fiche ») et
    viseur (`Home.captureHere` : la capture est enregistrée, puis la feuille monte à 1,5 s ; la
    photo reste en plein écran le temps de la célébration avec « Capturée ! », puis revient à sa
    place en couleur ; bouton « Fiche » dans la frise via `ArSpotsLayer actionFor`). En-tête
    « Capturée ✓ · aimée sur place » (ou « Retrouvée ✓ »), Reproduire en avant, « Contempler in
    situ ». On la ferme d'un glissement vers le bas sur l'en-tête (> 90 px), ✕, Échap, appui
    au-dessus ou **bouton retour** : `useBackCloses` (`src/router.ts`) ajoute une entrée
    d'historique sans changer d'adresse (numérotée `pictiOverlay`, comptée dans `depth`) et ferme
    les feuilles plus récentes que l'entrée retrouvée ; aussi utilisé par l'avant / après. La
    caméra ne s'arrête pas (même écran, `useCamera` partagé).
  - **Ouverture** : appui sur une photo partout (carte, galerie, Mes photos, Mes captures, À
    retrouver, À proximité, Recherche, notifications, profil public, frise) → `#/photo/<id>`. Viseur :
    appui sur une photo → sa fiche (`onOpen`) ; à moins de 5 m, la photo d'un autre pas encore
    capturée se **capture** (même déroulé que « Capturer ») ; le bouton « Chasser » de la frise
    ouvre la chasse (`onHunt`). Après une prise de vue (accueil, hors « Reproduire ») : pas
    d'ouverture automatique, **miniature** `.last-shot` 5 s à la place du « + » (appui = fiche) ;
    le toast garde son texte, sans bouton.
  - Collision corrigée : `.captured` (ancienne célébration de la chasse) s'appliquait aussi à
    `.capture-card` dans son état `captured` (z-index 30 par-dessus le message) → la célébration
    a sa classe `.capture-celebration` ; `.capture-card.captured` (z-index 6, sans fond ni marge)
    neutralise `.captured`, gardée pour les fenêtres de dialogue (carte « lieu quitté » de la
    0.15.2) ; `.capture-hint` z-index 7.
- **Profil public** (depuis 0.16.0, `src/screens/Person.tsx`, route `#/personne/<id>`) : avatar,
  nom, ville, « Sur PICTI depuis septembre 2026 » (`memberSince`), `FriendButton`, nombre et grille
  de ses photos géocadrées **que je peux voir** (`loadPersonPhotos` : requête `photos` owner = id,
  RLS ; une vignette par lieu, ↻, likes ; relue quand l'amitié change) ; pas amis : « Ses photos
  réservées aux amis apparaîtront quand vous serez amis. » Mon id → `#/profil` ; inexistant :
  message + Retour. Données : RPC `public_profile(p_id)` (migration
  `20261006200000_profil_public.sql`, **pas encore appliquée** (accord d'Eliott donné le 06/10 ; l'outil
  de sécurité de Claude Code a refusé de l'appliquer : à faire dans Supabase › SQL Editor) : id, name, city,
  created_at, amitié `none | outgoing | incoming | friends`, security definer, connectés seulement) ;
  tant qu'elle n'existe pas, `fetchPublicProfile` lit ces colonnes dans `profiles` et l'amitié dans
  `friendships`. Si l'amitié de la base diffère du store, `reloadFriends` (exposé par le store).
  Noms cliquables vers le profil : notifications (`notificationParts`, bouton de ligne `.notif-open`
  par-dessus lequel passent les noms), Mes captures (`.tile-author`), Mes proies / Mes chasseurs
  (`AvatarRow onOpen`), « Aimée par … », amis / demandes / recherche (`PersonLink`).
- **Bouton d'amitié** (depuis 0.16.0, `src/components/FriendButton.tsx`, fiche + profil public) :
  état `friendState(friends, userId)` (`src/data/friends.ts`, testé) : « Ajouter en ami »
  (`requestFriend`) → « Demande envoyée » (appui : « Annuler la demande ? » → `removeFriend`) ;
  demande reçue → « Accepter » + « Refuser » ; « Amis ✓ » (appui : « Retirer de mes amis » puis
  confirmation). Optimiste (`optimistic`), annulé si la base refuse ; menu fermé par Échap ou un
  appui ailleurs (écouteur en phase de capture). Aucun changement de base.
- **Sécurité des amitiés et des profils** (rapport du 06/10/2026, voir la note de session) : la
  policy « Accepter une demande reçue » laisse le destinataire réécrire `requester` → devenir ami
  de n'importe qui sans son accord (**vérifié sur la base, transaction annulée**). `friend_code`
  seul ne suffit pas (il ne fait qu'envoyer une demande) mais il est lisible, avec `plan`, par tout
  compte connecté. Correctif : `supabase/propositions/2026-10-06-droits-amities-et-profils.sql`.
  **A appliqué le 07/10/2026** (migration `20261007080415_droits_amities.sql`) : droit de mise à
  jour limité à `status`, policy « Accepter une demande reçue » réservée aux demandes en attente
  (`using … status = 'pending'`), `anon` sans écriture ; l'attaque est refusée (« permission denied
  for table friendships »), l'acceptation et le retrait marchent (vérifié sur la base, transaction
  annulée). **Pas encore appliqués** : B1 (`my_profile()`, `find_profile_by_friend_code()` — la
  0.16.0 s'en sert si elles existent, sinon lit la table) ; B2, quand plus personne n'a la 0.15.x
  (`profiles` lisible seulement en `id, name, city, created_at`).
- Photos d'un même **lieu** (`src/geo/spots.ts`, depuis 0.15.0 : `sameSpot` = rayon de 5 m
  `SPOT_RADIUS_MIN`, élargi jusqu'à la moins bonne précision GPS des deux photos, plafonné à 10 m
  `SPOT_RADIUS_MAX`, précision inconnue → 10 m, ET caps à ±45° `SPOT_HEADING_TOLERANCE` près : deux
  photos dos à dos = deux lieux ; sans cap, la distance seule ; à utiliser partout, jamais une
  comparaison directe de distance) : **empilées**, dans l'ordre de la pile (`pileOrder`, voir
  « Likes et reproductions ») ; on fait glisser celle du dessus comme sur Tinder (`useCardSwipe`, `SwipeDeck`,
  en boucle via `cycle`) et des **points façon Instagram** (`Dots`) indiquent leur nombre (anneau =
  reproduction ; appui = galerie du lieu).
  Partout : viseur de l'accueil (`ArSpotsLayer` : pile des photos du lieu visibles dans la
  direction visée), en-tête du détail (`usePhotosHere`), carte (les photos d'un endroit
  forment un seul point, jamais séparé au zoom), grille « Mes photos » (une vignette par
  endroit), frise de la chasse. Le viseur affiche toutes les photos géocadrées connues à
  moins de 150 m : une photo qu'on vient de prendre y apparaît aussitôt.
- `src/geo/` = moteur pur, couvert par Vitest : **toute modification de la géométrie doit
  garder `npm test` vert**. Repère monde ENU (x Est, y Nord, z Haut) ; caméra = base
  (f avant, r droite, u haut) ; angles en degrés.
- **Photos ancrées dans le décor** (depuis 0.009.1) : la projection part toujours de la
  position réelle du spectateur (`viewerEye`, altitude GPS ignorée) ; ne **jamais** recaler
  l'œil sur le point de vue selon la distance (l'ancien `parallaxEye` faisait suivre la photo
  au téléphone dans un rayon de 8 à 30 m). Position : un seul suivi GPS partagé
  (`useGeolocation`, filtre de Kalman `src/geo/tracking.ts`) + accéléromètre
  (`src/geo/motion.ts`, `src/sensors/motion.ts` : **comptage des pas**, au moins 3 rebonds
  verticaux réguliers — viser ou bouger le téléphone n'est pas marcher ; marche / vient de
  s'arrêter / immobile) ; à l'arrêt, la position est **tenue** (`holdGain`) : une photo à 6 m se
  décale de ~30° pour 3 m de dérive GPS ; seul un écart moyen **persistant** (`persistentShift`
  4 m ou ½ précision, ~5 s) est rattrapé (`catchUp`) — ne jamais figer la position sans cette
  porte de sortie (0.009.1 le faisait : 5 m de marche pouvaient être ignorés) ; sans
  accéléromètre, la vitesse GPS dit si l'on bouge ; `useLivePosition` la fait avancer à chaque image (accueil, chasse).
  **Pas à pas** (depuis 0.011.3) : le GPS ne voit pas quelques mètres (±5 m), la photo gardait
  sa taille et suivait le téléphone en avançant ou en reculant. Chaque pas d'une marche reconnue
  (`MotionDetector.walked`) avance la position de `MOTION.stepLength` (0,65 m) dans le sens de la
  marche : `direction`, tirée de l'élan des 3 premiers pas (vitesse horizontale intégrée dans le
  repère de l'objectif : avant, arrière, côté ; à défaut droit devant), tournée sur le terrain
  par `stepDirection` (orientation du téléphone), appliquée par `walkPosition` → `walkTrack` ;
  signe de l'accéléromètre vérifié contre l'orientation (`accelerometerSign` : certains
  navigateurs l'inversent, ce qui inverserait avant/arrière).
  Tant qu'un écran avance ainsi (`keepStepping`, `updateTrack(…, stepping)`), le GPS (en retard)
  ne tire pas la position pendant la marche ni juste après ; seul un écart qui persiste une fois
  arrêté la corrige (pas comptés dans le mauvais sens). Depuis 0.013.1 : **sens inconnu** (élan
  trop faible, balancement sur place) → `direction` null, les pas ne déplacent rien et le GPS
  reprend la main ; **à l'arrêt, pas comptés**, un écart du GPS n'est rattrapé qu'au-delà de
  `steppedShift` (8 m ou sa précision) — en deçà ce n'est que sa dérive. **Une seule position
  pour les trois écrans caméra** : accueil, chasse et recalage enregistrent / projettent tous la
  position suivie (`useLivePosition`, pas à pas). Une
  photo prise est enregistrée à la position affichée. En chasse seulement,
  `useSpotCalibration` attribue au GPS l'écart restant quand la photo est alignée avant la
  capture (téléphone immobile), puis le fige. **Moyenne à l'arrêt** (depuis 0.15.2, dans
  `updateTrack`) : immobile depuis `TRACKING.averageAfter` (2 s), la position suivie est la moyenne
  pondérée (1 / précision²) des relevés depuis l'arrêt (`stillSince`, `average`), pris pendant au
  plus `TRACKING.averageWindow` (10 s), puis tenue comme avant (sauts isolés exclus ; écart
  persistant toujours rattrapé, il rouvre un arrêt ; marche détectée → GPS suivi aussitôt). **Pas
  après une marche comptée pas à pas** (`stepped`, mis par `walkTrack`, effacé quand le GPS refixe
  la position : en mouvement, ou rattrapage) : la moyenne déferait les mètres comptés que le GPS ne
  voit pas (test « un GPS immobile ne défait pas quelques mètres de marche »). `useLivePosition` se
  re-rend aussi quand la **précision** change (avant, immobile, la position affichée gardait une
  précision périmée, enregistrée avec la photo). **Précision à la prise** : `GPS_GOOD_ACCURACY`
  (12 m, `src/geo/tracking.ts`) ; pastille « 📍 ±6 m » normale (sans le mot « GPS » depuis 0.16.2), orange (`.chip.warn`) au-delà ;
  déclencher au-delà fige l'image et ouvre « Position imprécise (±18 m) : la photo risque d'être mal
  placée. » → « Attendre » (bandeau `.gps-wait`, la photo se prend seule — nouvelle image — dès
  que la précision repasse sous 12 m ; « Annuler ») / « Prendre quand même » (l'image figée). Toutes
  les prises (directe, selfie, Reproduire). `photos.accuracy` : direct = précision du relevé ;
  import = EXIF `GPSHPositioningError` (`ExifGeoframe.accuracy`), sinon null. **iPhone en position
  « approximative »** (`PreciseLocationNotice`, accueil et chasse) : précision > 100 m pendant 15 s
  → une fois « Activez Réglages › Confidentialité et sécurité › Service de localisation › Sites web
  Safari › Position exacte. » (« Compris » mémorisé dans `localStorage`
  `picti.position-exacte.compris`, sous try/catch) ; « dehors » ne se détecte pas. `watchPosition` :
  `enableHighAccuracy: true`, `maximumAge: 0` (vérifié). **Dans l'app iOS** (0.20.0), les relevés
  viennent d'iOS (plugin `Position`, voir « App native ») et le message est celui de l'app (tout de
  suite, une fois par lancement : « … Réglages › PICTI › Position › Position exacte », « Ouvrir les
  réglages » / « Plus tard »). **Photo dépassée (vue de dos)** (depuis 0.012.0) :
  reste visible comme **imprimée sur une vitre dépolie** — l'homographie du plan vu de derrière
  donne d'elle-même l'image en miroir (rien n'est retourné à la main) ; `ArPhoto glass` : classe
  `.glass` (flou 12 px, désaturée, éclaircie), opacité × `GLASS_OPACITY` (0,45) et calque de reflet
  `.overlay-glass` (même taille, même transformation). Vue **par la tranche**, elle s'efface en
  douceur : `viewCosine` (|cos| entre la visée vers le centre du plan et l'axe de prise de vue)
  → `edgeFade` (smoothstep, `EDGE_FADE` : 0 sous 0,08, 1 au-delà de 0,35) → `ArProjection.fade`,
  multiplié à l'opacité (viseur, pile, chasse). Pas de texte sur la vitre (il serait en miroir).
- **Photo « carte »** (depuis 0.014.0, `src/geo/projection.ts`) : la photo ne remplit **jamais**
  l'écran en se promenant. `projectCard` : si des coins du plan passent derrière l'objectif (tout
  près, de biais), le plan est d'abord réduit autour de son centre (`cornersInFront`) ; puis la
  boîte projetée est plafonnée à `CARD_MAX` (60 % de la largeur, 45 % de la hauteur), réduite
  uniformément autour du **centre projeté** (`cardScale`, `scaleQuad`) : même place, même
  orientation, même forme (ne jamais recaler l'œil pour la rapetisser). `ArProjection.cardScale`
  = réduction appliquée (les tests de perspective divisent la largeur par elle). Style : cadre
  blanc, coins arrondis, ombre légère, de taille constante à l'écran (`cardVars` : `--px`,
  `--radius`, `--near-blur` depuis `overlayScale`). **Effacement à 2 m** : `panelDistance` =
  distance de l'œil (à la hauteur du photographe) au point le plus proche du rectangle du
  plan-photo — pas au point de vue ; passer à côté ne compte pas ; une photo du sol ou du ciel
  n'est jamais traversée — → `panelProximityFade` (`NEAR_FADE` : nette à 2 m, smoothstep jusqu'à
  0,5 m, flou jusqu'à 16 px à l'écran, invisible en deçà), recto comme vitre, multiplié à
  `edgeFade` dans `ArProjection.fade` ; flou dans `ArProjection.blur` → classe `.near`.
- **Capture par agrandissement** (depuis 0.014.0, remplace l'alignement tenu `HOLD_MS` et la
  révélation sur place de 0.013.0) : l'utilisateur ne bouge plus, c'est la photo qui vient à lui.
  Départ : à moins de 5 m du point de vue et photo à l'écran, appui sur « Capturer » (viseur,
  chasse) ou, en chasse, alignement tenu `AUTO_CAPTURE_MS` (0,5 s). La carte quitte sa place et
  s'agrandit en `CAPTURE.growMs` (2 s) jusqu'à couvrir tout l'écran (`coverTransform`, mode
  « cover »), la couleur l'envahissant (`.overlay-reveal`, même `clip-path` qu'en 0.013.0, étalé
  sur 2 s) ; message « Ne bougez plus… » ; bouton désactivé. **Capturée seulement à 100 %**
  (enregistrement à ce moment-là). Logique pure `checkCapture` (`src/geo/capture.ts`, testée),
  vérifiée à chaque image par `useCapture` : annulation si `CAPTURE.steps` (2) pas comptés depuis
  le départ (`walkedSteps().steps` ; la marche reconnue au 3e pas viendrait trop tard), cap
  > 12° ou inclinaison > 10° d'écart (cap ignoré objectif à plus de 70° de l'horizon), ou photo
  hors de l'écran. Annulée : retour à sa place en `CAPTURE.backMs` (0,3 s), couleur retirée,
  « Capture interrompue : restez immobile », rien d'enregistré. Animation : transitions CSS
  `transform` de `.capture-card` (une annulation repart de là où en est l'agrandissement), aucun
  rendu React par image. Après la capture : viseur, retour à sa place après 0,6 s, en couleur
  avec surbrillance ; chasse, plein écran sous « Capturée ! », retour à sa place sur « Contempler ».
- **Cap sur iPhone** (depuis 0.010.1, `src/geo/heading.ts`) : les mouvements viennent du
  gyroscope (`alpha`) ; le nord de `webkitCompassHeading` n'est recalé que **lentement**
  (τ 2 s), téléphone stable (< 8°/s) et objectif à moins de 55° de l'horizon ; recalage rapide
  au démarrage, après une pause, ou si un grand écart persiste. Ne jamais revenir à un suivi
  direct de la boussole : en retard quand on tourne, elle faisait « suivre la caméra » aux photos
  (17° d'erreur en balayant, 14° encore après l'arrêt, contre 3,5° et 0,2°). **Nord partagé**
  par tous les écrans (`sharedNorth` dans `useOrientation`, depuis 0.013.1) : passer de l'accueil
  à la chasse ne repart plus de la boussole brute (la photo restait décalée quelques secondes) ;
  horodatage des événements pour ne l'intégrer qu'une fois par mesure.
- **Focale mesurée** (depuis 0.011.1, `src/geo/focalCalibration.ts`, `useFocalCalibration`,
  `cameraFocal.ts`) : en tournant le téléphone, glissement de l'image (profil de colonnes, moitié
  centrale, image réduite à 240 px) comparé à la rotation du gyroscope, seulement en rotation
  régulière (même vitesse sur deux demi-fenêtres de 250 ms : insensible au retard de la vidéo) ;
  médiane de 15 mesures de 15°, biais de perspective corrigé ; gardée dans `localStorage`
  `picti.focale`, utilisée par l'écran (accueil, chasse, recalage) et les nouvelles photos ;
  affichée dans le menu (« Caméra 24 mm (mesurée) »). Sans elle (26 mm supposés), sur iPhone
  Pro (24 mm) la photo défilait moins vite que le décor et restait décalée (2,7° à 30°).
- **Taille de loin** (depuis 0.010.1, `displayScale` dans `src/geo/projection.ts`) : le plan-photo
  est réduit par `farScale` (1 au point de vue, ~⅓ à 20 m) avec une hauteur apparente minimale
  de 5° : à 20 m, ~12 % de la largeur de l'écran (37 % avant) ; au point de vue, inchangé.
- Commandes : `npm run dev`, `npm run dev:https` (test sur téléphone), `npm test`,
  `npm run lint`, `npm run build` (inclut `tsc -b`).
- Déploiement : projet Vercel `picti` (compte d'Eliott) → https://picti.vercel.app, public
  (le compte PICTI protège l'accès). Projet relié au dépôt GitHub : chaque push construit un
  aperçu ; la **production** se fait en redéployant cet aperçu avec `target: production`
  (API Vercel, `create_deployment` + `deploymentId`). **Attention : depuis le 30/09, chaque fusion dans
  `main` est mise en production automatiquement** (vu avec eliott-220/Picti#3 et #4) : fusionner une
  pull request = mettre en ligne. **Production actuelle : 0.19.0** (coque Capacitor 0.18.0 et boutons Liquid Glass de l'app iOS, fusionnées dans `main` sans PR à la demande d'Eliott le 08/10/2026 ; sur le site : symbole du mode sur les vignettes de « Mes photos », piles glissables dans « Mes photos » et le profil public, profondeur du « Retour » notée dans l'historique). Retour arrière possible : 0.17.1 (`dpl_E2NMXm5BS56e6TrdJRUQ2KABXZQ5`, commit `cffcf64`, carrousel du déclencheur), 0.17.0 (`dpl_5CfVmxd6os34dkQv95dJYpcfsyJw`, commit `07332a3`, réglette au-dessus du déclencheur), 0.16.3 (`dpl_G7fnhSXBHjSX6NSaGGCVd5wnGGRB`, commit `f6cdf16`, bouton « Capturer »), 0.16.2 (`dpl_13wcm3U9SPUyYY1s3u7Cx5oQkULg`, commit `f01558f`, avec le correctif A des amitiés rangé dans `supabase/migrations/`), 0.16.1 (`dpl_GtqYsDEv8LpnQtV2NDMYAt44Tkc9`, https://picti-ld6vsgbd7-dash-board4.vercel.app, commit `56f8cee`), 0.16.0 (`dpl_HsoBgetSVvNHJWvKF1DkwFbrdN6N`, https://picti-k4jvsgj4q-dash-board4.vercel.app, commit `197fb70`), 0.15.2 (`dpl_CzAQHyjkdtHaYc5XbwPDpfhKXFzg`, https://picti-av1c6j733-dash-board4.vercel.app, commit `923f46f`), 0.15.1 (`dpl_8MGLiue2e55LXVHuLAT93BhHxHSX`, commit `5a19ea7`), 0.15.0 (`dpl_5H8MFymL5FSrDjK4hHJxNJNCs7R6`, https://picti-hhcuypawj-dash-board4.vercel.app, étiquette git `v0.15.0`), 0.14.0 (`dpl_9TDSTZYJRyjE5TxMLy1h63DJWS7r`, https://picti-qid7yv1w0-dash-board4.vercel.app, étiquette git `v0.14.0`), 0.13.1 (`dpl_CWEBYDsasj4uGqN4HCQu4UEUSVuZ`, https://picti-1w0uak6yx-dash-board4.vercel.app, étiquette git `v0.13.1`), 0.013.1 d'origine (`dpl_DU2oCKyDmdFyg2RHWqe5EPzrwBXg`), 0.011.3 (`dpl_6tcTuitbuUf7TXN4AoPAxwhLDMS9`), 0.011.2 (`dpl_4PtSLtuydm9DTrwmnGfytBNsJ3NE`), 0.011.1 (`dpl_2wRsESgFE6868PMCUVwA13LGwZLr`), 0.010.1 (`dpl_3n1rUFb8urWWDRK7VuR57eqYfEBZ`), 0.009.2 (`dpl_GTeorpPpLWapoMQyyV7tcW8sMFaB`), 0.009.1 (`dpl_CH3VQP2FGb3572UpwuMzskCNv7yp`) ou 0.009.0 (`dpl_EPnnkgHnE3p8ENQJr7WHPTKcco4h`). **`main` est la branche de référence** (depuis le 29/09/2026, tout le travail des branches `claude/*` y a été rassemblé) : chaque nouvelle session part de `main`. 
- Mises à jour : le build publie `version.json` (commit Vercel + numéro) ; `UpdateBanner`
  affiche « Nouvelle version de PICTI disponible : 0.009.0 » (vérif. au retour dans l'app et
  toutes les 5 min, comparaison sur le commit) ; bouton « Recharger » + numéro dans le menu.
- **Numéro de version** au format **x.xxx.x** (`src/data/versionNumber.ts`), tiré du champ
  `version` de `package.json` (écrit en semver : `0.8.1` → affiché `0.008.1`). Premier chiffre =
  grande version (1 = sortie officielle), trois du milieu = nouvelle fonctionnalité, dernier =
  correction / petit ajustement. **À chaque changement livré, augmenter `version` dans
  `package.json` (et `package-lock.json`)** : fonctionnalité → `0.9.0`, correction → `0.8.2`.
- **Couleurs inversées** (depuis 0.013.0, remplace le fond noir et blanc de 0.006.0) : caméra en
  couleur partout ; une photo est en couleur si j'en suis l'auteur ou si je l'ai capturée, en noir
  et blanc sinon — règle unique `photoInColor` / `useColorRule` / `usePhotoInColor`
  (`src/data/photoColor.ts`), appliquée au viseur et aux piles (`ArPhoto saturation`), à la chasse,
  aux vignettes (`PhotoTile` : classe `.mono`), à la carte (vignettes et pile, auteur fourni par la
  carte) et à l'en-tête du détail. En chasse, la saturation suit le score d'alignement existant :
  `huntSaturation` = 0 sous 0,15, courbe douce jusqu'à 40 % au score atteint à la limite des
  tolérances de capture (`TOLERANCE_SCORE`, calculé depuis `ALIGN_TOLERANCE` et `ALIGN_SCORE`).
  À la capture, la couleur envahit la photo depuis le centre (`.overlay-reveal`, `clip-path`)
  pendant qu'elle s'agrandit (voir « Capture par agrandissement », 0.014.0). Bouton « Capturer »
  dans la chasse (photo d'un autre visible à l'écran) et dans l'étiquette du viseur
  (`onCapture`, appelé une fois l'agrandissement achevé). **Capture à moins de 5 m** du
  point de vue (`CAPTURE_RADIUS`, `withinCaptureRadius`, depuis 0.013.1), quelle que soit la
  précision du GPS : au-delà, bouton désactivé « Capturer à moins de 5 m : encore X m » (chasse)
  ou « Chasser » (viseur). Photos en couleur (miennes ou
  capturées), de face : **surbrillance animée** `.overlay-shine` (bord clair ≈ 4 px à l'écran quelle
  que soit la distance, `--shine` via `overlayScale`, halo qui respire, éclat qui traverse ;
  opacité/translation seulement ; figée avec `prefers-reduced-motion`). Filtres CSS sur les
  images seulement (`--sat`, `--glass-sat` pour la vitre), jamais sur la vidéo ; cadre blanc de
  carte sur toutes les photos du viseur (`.overlay-photo`).
- Selfies (`photos.selfie`) : géocadrage en direct avec la caméra avant ; on enregistre
  l'orientation de l'objectif avant (`frontCameraBasis` : cap +180°, inclinaison et roulis
  inversés), focale 23 mm, image non inversée (seul l'aperçu est en miroir). Distance du sujet
  **0,6 m** (`SELFIE_DEPTH`, l'auteur à bout de bras) depuis 0.011.3 : à 6 m comme les autres, le
  visage devenait un portrait géant ; les selfies enregistrés avant à 6 m sont lus à 0,6 m
  (`rowToPhoto`). Ensuite, mêmes
  règles que toute photo : on la retrouve en visant, depuis la place du téléphone, l'endroit
  où se tenait l'auteur.
- **Autorisations mémorisées** (`src/sensors/permissions.ts`, `localStorage`
  `picti.autorisation.boussole`) : iOS redemande la boussole à chaque ouverture ; si elle a
  déjà été accordée, `useOrientation` la réactive seul (sans geste si le système l'accepte,
  sinon au premier appui n'importe où ; pastille « Boussole : touchez l'écran »). **Caméra** :
  un seul flux partagé par toute l'app (`useCamera`), gardé 15 s après avoir quitté un écran
  caméra (accueil ↔ chasse ↔ recalage sans redemande), coupé en arrière-plan et relancé au
  retour. L'autorisation navigateur elle-même ne se règle que dans Safari (aA › Réglages du
  site web › Caméra / Localisation › Autoriser) : message affiché en cas de refus.
- Conventions : identifiants en anglais, commentaires et UI en français, pas de point-virgule,
  guillemets simples.

## App native (Capacitor)

Depuis 0.18.0 (prompt d'Eliott du 07/10) : coque **Capacitor 8** iOS + Android, **web embarqué**
(`webDir: 'dist'`), `appId: 'app.picti'`, `appName: 'PICTI'`, fond blanc (`capacitor.config.ts` ;
`server.url` vers picti.vercel.app laissé en commentaire, pour les essais seulement : Apple refuse
souvent une app qui n'est qu'un site, règle 4.2). Détails pour Eliott : `README.md` › « App native ».

- **Prérequis** : Node 22+, Xcode 26+ (iOS, **Swift Package Manager**, pas de CocoaPods :
  `ios/App/CapApp-SPM/Package.swift`, réécrit par `cap sync`), Android Studio 2025.2.1+ (SDK 36).
  Scripts : `native:sync` (`npm run build && cap sync`), `native:ios`, `native:android` (sync +
  `cap open`). Après un clone : `npm install` puis `native:sync` (copie du web
  `ios/App/App/public`, `android/app/src/main/assets/public` et configs générées ignorées par
  `ios/.gitignore` / `android/.gitignore` ; certificats et clés `*.jks`, `*.keystore`, `*.p12`,
  `*.mobileprovision` ignorés à la racine). Vercel ne construit que le web : `.vercelignore` exclut
  `/ios` et `/android` ; `tsc -b` ne voit ni `capacitor.config.ts` ni les projets natifs.
- **`src/native.ts`**, seul module qui importe `@capacitor/core` : `isNative()`
  (`Capacitor.isNativePlatform()`), `platform()` (`ios` / `android` / `web`), `platformLabel()`,
  `setStatusBarText()` / `useDarkStatusBar()`, `authRedirectUrl()`, `appLinkHash()`,
  `listenForAppLinks()` (appelé dans `main.tsx`, charge
  `@capacitor/app` à la demande, seulement dans la coque). Tests : `src/native.test.ts` (mock de
  `@capacitor/core`). **Dans le navigateur, rien ne change.**
- **Adaptations en natif** : liens des e-mails Supabase (`emailRedirectTo`, `redirectTo` dans
  `Auth.tsx`) → `APP_URL` au lieu de `window.location.origin` (`capacitor://localhost` sur iOS,
  `https://localhost` sur Android) ; le lien s'ouvre dans le navigateur, d'où un message « mot de
  passe oublié » propre à la coque (« … revenez ensuite ici pour vous connecter ») ;
  `useUpdateAvailable` ne vérifie rien (pas de bandeau : mise à jour par les stores) ;
  `formatVersion(app = platformLabel())` ajoute « · app iOS » / « · app Android » et jamais
  « (locale) » (une app est toujours compilée sur le Mac). Bouton « Recharger » du menu gardé
  (recharge la copie embarquée). **Barre d'état** : texte blanc par défaut (Info.plist, config
  Android) ; les écrans clairs en haut appellent `useDarkStatusBar()` (texte foncé tant qu'ils
  sont affichés, `SystemBars.setStyle`, barre d'état seulement) : `Auth`, `NewPassword`, `Search`,
  `WorldMap`. Tout nouvel écran à fond clair en haut doit l'appeler aussi (vu au simulateur le
  08/10 : heure et batterie invisibles sur la connexion — le même défaut existe dans la version
  web installée sur l'écran d'accueil, `black-translucent`, non corrigé).
- **Natif** : `Info.plist` — `NSCameraUsageDescription`, `NSLocationWhenInUseUsageDescription`,
  `NSMotionUsageDescription`, `NSPhotoLibraryUsageDescription`, `NSPhotoLibraryAddUsageDescription`
  (textes en français), `CFBundleDevelopmentRegion` `fr`, portrait seul (iPhone et iPad, avec
  `UIRequiresFullScreen`), `UIStatusBarStyleLightContent` (texte blanc, comme
  `black-translucent` du web : fond caméra sombre et en-têtes rouges ; lu par
  `CAPBridgeViewController`), `ITSAppUsesNonExemptEncryption` faux, `MARKETING_VERSION` 0.18.0.
  `AndroidManifest.xml` — `CAMERA`, `ACCESS_FINE_LOCATION`, `ACCESS_COARSE_LOCATION`,
  `uses-feature android.hardware.camera` non obligatoire, `screenOrientation="portrait"` ;
  `versionName` 0.18.0 ; `SystemBars: { style: 'DARK' }` (texte blanc). Capacitor accorde lui-même
  à la WebView la caméra (`requestMediaCapturePermissionFor`) et la boussole
  (`requestDeviceOrientationAndMotionPermissionFor`) sur iOS, la caméra et la position
  (`BridgeWebChromeClient`) sur Android : pas de seconde question après celle du système.
  Marges : `--safe-top` / `--safe-bottom` = `env(safe-area-inset-*)` comme avant (`viewport-fit=cover`
  déjà là ; iOS `contentInset` « never » ; Android : `SystemBars` `insetsHandling` « css » par défaut).
  Numéros de version natifs à garder égaux à `package.json` à chaque version.
- **Boutons Liquid Glass natifs** (0.19.0, iOS 26+ seulement ; le site n'imite rien, décision du
  07/10) : plugin **local** `GlassButtons` (`ios/App/App/GlassButtonsPlugin.swift`, pas de paquet
  npm), enregistré par `PictiViewController` (sous-classe de `CAPBridgeViewController`,
  `capacitorDidLoad` → `registerPluginInstance`), utilisé par `SceneDelegate`. Les deux fichiers
  Swift sont déclarés à la main dans `project.pbxproj` (pas de dossier synchronisé) : tout nouveau
  fichier Swift doit l'être aussi. Méthodes `isAvailable` (iOS 26+), `set({ buttons })` (liste
  complète, le natif crée / déplace / retire), `clear`.
  - **Le natif ne fait que l'affichage** (`isUserInteractionEnabled` faux, caché à VoiceOver) : le
    bouton web reste en place, transparent (`.glass-native`, opacité 0) mais **c'est lui qu'on
    touche** (appuis, défilement, VoiceOver). Version précédente (boutons natifs qui captaient les
    touches et renvoyaient un `tap`) abandonnée le 08/10 : un glissement sur une pastille étirait le
    bouton au lieu de faire défiler la rangée (retour d'Eliott sur iPhone).
  - **Zones qui défilent** : WebKit crée une `UIScrollView` (WKChildScrollView) pour chaque élément
    `overflow: auto/scroll` dont le contenu dépasse. Pour un bouton dans une telle zone, le JS envoie
    `scroller` (clé, partie visible à l'écran) et sa position dans le contenu (`cx`, `cy` =
    position à l'écran − zone + `scrollLeft/Top`, fixe pendant le défilement) ; le natif retrouve la
    vue de défilement par son cadre (écart < 4 pt, gardée ensuite par clé, `Weak`) et y **pose le
    bouton** (au premier plan, `bringSubviewToFront`) : il défile avec le texte sans attendre le JS,
    est coupé et recouvert comme la page (pas de masquage par `elementFromPoint`, seulement si sa
    taille est nulle). Version précédente (calque fixe recopié à chaque image) : les boutons
    bougeaient par rapport au texte pendant le défilement (retour d'Eliott). Les autres boutons
    (viseur, carte) sont sur un **calque fixe** ajouté à la WebView, cachés quand le web est
    recouvert (`elementFromPoint` en leur centre, ramené dans l'écran). La vue de défilement coupe
    l'ombre du verre : `.chips:has(> .chip.glass-native)` donne 24 px de marge intérieure à la
    rangée (marges extérieures réduites d'autant).
  - Boutons `UIButton.Configuration.glass()` (`prominentGlass()` teinté rouge quand `active`) : le
    verre **clair** (`clearGlass()`) gardait des icônes noires, invisibles sur une caméra sombre (vu
    au simulateur le 08/10) ; le verre standard passe seul du clair au sombre. Pastille rouge native
    comme `.round-badge`. Côté web : **tous** les `RoundButton` (option `glass`, vraie par défaut ;
    `glass={false}` pour en garder un en web), les `IconButton` (boutons icône sans fond `.icon-btn` :
    croix des feuilles Menu, Import, carte et fiche, QR code, refuser / annuler dans le profil), les
    **`Chip`** (pastilles de choix `.chip` : visibilité « Tout le monde / Mes amis / Moi seul » du
    profil et de la fiche, filtres « Toutes / En direct… » de la recherche, tri de la galerie, onglets
    de connexion ; texte en police système SF, la sélectionnée en `prominentGlass` rouge) et le
    sélecteur **« Monde / Amis »** de la carte (`kind: 'segmented'` : `UISegmentedControl` dans une
    capsule `UIGlassEffect`, segment sélectionné rouge) → `useGlassButton` (`src/glassButtons.ts`) :
    une boucle `requestAnimationFrame` (tant qu'un bouton est inscrit) mesure chaque bouton et
    n'envoie la liste au natif que si elle change (cadres au demi-point). Icônes → symboles SF
    (`glassSymbol` : retour `chevron.left`, cloche, carte `mappin.and.ellipse`, filtre, loupe, selfie,
    plus, menu `square.grid.2x2`, croix, crayon, « Ma position » `location`, nord
    `location.north.fill`, QR) ; une icône sans symbole reste web. Nord de la carte : `RoundButton
    iconRotation={-bearing} tint` (rotation appliquée à l'icône native dans `layoutSubviews` ; couleur
    fixée dans l'image, `withTintColor(.alwaysOriginal)`, car le verre impose la sienne). Bouton
    désactivé : `disabled` (estompé). Le déclencheur et les boutons à texte (« Inviter »,
    « Chasser »…) restent web. Tests : `src/glassButtons.test.ts`. Pour voir l'app au simulateur sans
    compte : web du banc (`.bench/`, `vite build --config .bench/vite.config.ts`) copié dans
    `ios/App/App/public` après `cap sync`, puis `npm run native:sync` pour revenir au vrai web.
- **Position native** (0.20.0, app iOS ; prompt `PROMPT-0.020.0.md` du dossier d'Eliott) : la WebView
  ne lit plus la position (`navigator.geolocation` : réglages de WebKit, et iOS ne connaît pas de
  « Position exacte » des sites dans une app). Plugin local **`Position`**
  (`ios/App/App/PositionPlugin.swift`, enregistré par `PictiViewController`, déclaré à la main dans
  `project.pbxproj`) : `CLLocationManager` en `kCLLocationAccuracyBestForNavigation`, `activityType`
  `.fitness` (piéton : pas de recalage sur les routes), `distanceFilter` aucun, pas de pause
  automatique ; relevés mesurés avant `start` (cache) ou à précision négative écartés ; arrêt en
  arrière-plan, reprise au retour (vérifié au simulateur : aucun relevé pendant 8 s en arrière-plan,
  pas de rafale au retour). Méthodes `start` (demande l'autorisation la première fois), `stop`,
  `status`, `requestFullAccuracy` (`requestTemporaryFullAccuracyAuthorization`, clé `geocadrage` de
  `NSLocationTemporaryUsageDescriptionDictionary`), `openSettings` ; événements `location` (lat, lon,
  précision, altitude seulement si iOS donne sa précision, vitesse / cap GPS et leurs précisions,
  **instant de la mesure**, `simulated`), `error` (`denied`, `restricted`, `unavailable` ;
  `locationUnknown`, passager, ignoré), `status` (`authorization`, `precise`). Côté web :
  **`src/sensors/positionSource.ts`** = source unique des relevés (`watchPositionSource`) — iOS dans
  l'app (`hasNativePosition()`, `src/native.ts`), `navigator.geolocation` ailleurs (`WEB_OPTIONS`) ;
  plugin absent (page plus récente que l'app, `server.url`) → repli automatique sur la page ;
  `nativeFix` / `webFix` (testés) ; `GpsFix` porte aussi `speedAccuracy`, `course`, `courseAccuracy`.
  `useGeolocation` : `denied` (pastille « Position refusée · Réglages » dans l'app, qui ouvre les
  réglages) et `precise` (`full` | `reduced` | `asking` | null, `nextPrecise`) : sans position exacte,
  iOS la propose une fois par lancement (`asking`), puis `reduced` → `PreciseLocationNotice`.
- **Suivi visuel ARKit** (0.21.0, app iOS ; prompt `PROMPT-0.020.0.md` et note `PICTI-GPS.md` du
  dossier d'Eliott) : dans l'app iPhone, la caméra arrière n'est plus la vidéo web mais celle d'**ARKit**,
  affichée par iOS **derrière la page** ; la pose de la caméra (position au centimètre d'une image à
  l'autre, orientation) remplace le GPS suivi pas à pas et le gyroscope + boussole. Ailleurs (site,
  Android, iPhone sans ARKit, réglage coupé, selfie), rien ne change.
  - **Plugin local `ArTracking`** (`ios/App/App/ArTrackingPlugin.swift`, enregistré par
    `PictiViewController`, déclaré dans `project.pbxproj`) : `ARWorldTrackingConfiguration`,
    `worldAlignment = .gravity` (cap arbitraire : c'est le calage qui le trouve), format vidéo de
    `recommendedVideoFormatForHighResolutionFrameCapturing` (iOS 16+). `ARSCNView` inséré **sous la
    WebView** (`webView.superview`, comme les plugins d'aperçu caméra) dans le cadre de l'élément
    `stage` ; WebView rendue transparente le temps de l'affichage (couleurs remises au masquage).
    Méthodes `isAvailable`, `start` (nouvelle session = nouveau repère, `{ session }`), `stop`,
    `show({ x, y, width, height })`, `hide`, `capture` (image **haute résolution** iOS 16+, sinon
    l'image courante, JPEG 0,92 dans un fichier temporaire — un seul à la fois —, avec focale et pose ;
    lu par `fetch(Capacitor.convertFileSrc(path))`), `geoTrackingAvailability({ points })` (VPS d'Apple :
    disponible ou non en ces points — pas encore utilisé), `appendTrace` (version de test). Événements
    `pose` à chaque image (`s` session, `t` instant en ms comme `Date.now()`, `p` position, `r` `u` `b`
    axes droite / haut / arrière de `inverse(viewMatrix(for: .portrait))`), `camera` (image en portrait :
    largeur, hauteur, focale px), `tracking` (`normal` | `limited` + raison | `interrupted` | `failed`),
    `session` (reprise après une interruption : nouveau repère).
  - **Calage** (`src/geo/arAlign.ts`, porté de PICTI bis `bis/src/align.js`, testé) : `GeoAligner`
    cherche θ (cap) et (e0, n0) qui envoient la trajectoire locale (e', n') = (x, −z) d'ARKit sur les
    relevés GPS (moindres carrés, Procuste 2D en forme close), la boussole en a priori sur θ ; relevés
    écartés au-delà de 3 × leur précision (8 m au moins) ; au plus 300 relevés (5 min), mémoire de la
    boussole bornée. **Précision annoncée** `gpsPrecision` : variance moyenne des relevés ÷ relevés
    « indépendants » (1 + durée / 60 s + distance / 100 m, prudent : vérifié honnête dans 90 % des cas
    sur 200 marches simulées), jamais sous 1,5 m. `src/geo/arPose.ts` : poses → repère local et ENU,
    `poseAt` (pose interpolée à l'instant d'un relevé GPS), `compassTheta` (mesure de θ seulement
    objectif à moins de 55° de l'horizon, rotation < 8°/s, `webkitCompassAccuracy` ≤ 25°),
    `approachTransform` (calage affiché qui rejoint le calcul en 1,5 s ; saut direct au-delà de 20° /
    15 m), `focal35Of`.
  - **Module `src/sensors/arTracking.ts`** : session partagée par les écrans caméra (`useArTracking`,
    compteur d'utilisateurs ; écran quitté → arrêt après 1,5 s, le temps qu'un autre écran caméra la
    reprenne ; caméra arrière abandonnée sur place — selfie — → arrêt immédiat). Statut `off` |
    `checking` | `starting` | `running` | `unavailable` | `disabled` | `failed` ; **tout échec**
    (plugin absent ou plus ancien que la page, caméra refusée, exception) → `failed` → caméra web,
    jamais d'écran noir (défaut trouvé par le banc le 08/10 : un appel qui lève restait bloqué en
    `checking`). Relevés GPS **bruts** (`onFix` de `useGeolocation`, avant le filtre) associés à la
    pose du même instant (historique de 10 s), seulement en suivi `normal` ; boussole par
    `deviceorientation` (10 mesures/s au plus) ; calage recalculé au plus toutes les 250 ms.
    `currentView()` : position calée (précision = celle du calage), orientation (null tant que le cap
    n'est pas calé). `useArCamera(stage, visible)` : cadre de la caméra native = rectangle de
    l'élément (ResizeObserver), classe **`picti-ar`** sur `<html>` (fonds transparents, vidéo web
    cachée, `styles.css`), masquage différé de 150 ms (relais d'un écran à l'autre). Réglage
    **« Suivi visuel : activé / coupé »** dans le menu (`setArSetting`, `localStorage`
    `picti.suivi-visuel`), seulement quand l'appareil a ARKit.
  - **`src/sensors/useViewfinder.ts`** : point d'entrée unique des capteurs des écrans caméra (accueil,
    chasse, recalage) — caméra (`capture` ARKit, avec focale et pose), géolocalisation, orientation
    (celle du suivi dès que son cap est calé, sinon les capteurs), position (suivi calé, sinon
    `useLivePosition`), focale (celle d'ARKit, sinon `useCameraFocal` ; la mesure de focale en tournant
    ne tourne qu'en caméra web). La caméra web attend tant que le suivi démarre (`checking` /
    `starting`). Pastilles : précision de la position réellement utilisée, « Suivi visuel » au lieu de
    « Boussole » (`SensorStatus position visual`).
  - **Regéocadrage** : une photo prise avec le suivi (`trackArShot`, pose de son image) est récrite
    (`ArShotRefiner`, monté avec le store → `updatePhoto`) quand le calage s'affine : au plus toutes les
    20 s, seulement si la précision gagne 0,3 m et que la photo bouge de 0,75 m ou tourne de 1,5°
    (`refinement`, testé). Sur 400 marches simulées : photo prise en début de session 5,5 m → 4,2 m
    en moyenne (meilleure 7 fois sur 10).
  - **Chiffres** (tests `arCompare.test.ts`, 200 marches simulées : GPS à erreur corrélée σ 4 m sur
    30 s, boussole faussée de 7°) : erreur moyenne GPS seul 5,1 m, suivi actuel 4,9 m (4,95 avec des
    pas comptés parfaits), suivi visuel **4,1 m** ; déplacement d'une photo d'une seconde à l'autre
    2,2 / 1,1 / 0,26 → **0,14 m**. Le cap reste celui de la boussole (corrigé par le trajet sur de longues
    marches). Ce que la simulation ne montre pas : le tremblement d'une image à l'autre (supprimé par
    ARKit) et l'erreur des pas comptés (sens, longueur).
  - **Version de test** (`VITE_PICTI_TRACE=1` au build) : `src/sensors/arTrace.ts` enregistre GPS
    bruts, poses (5/s), boussole, calages, prises et regéocadrages dans `Documents/traces/*.jsonl` de
    l'app (récupérables par `xcrun devicectl device copy from --domain-type appDataContainer
    --domain-identifier app.picti --source Documents/traces …`). Rien n'est envoyé ; inactif sinon.
  - **Banc « iPhone simulé »** (hors dépôt, voir la note de session) : `@capacitor/core` remplacé par des
    plugins simulés (vérité terrain, GPS bruité, repère ARKit au cap arbitraire, boussole faussée, décor
    de synthèse derrière la page) ; scénarios Playwright : marche, regéocadrage, selfie, accueil → chasse
    → carte, menu, appareil sans ARKit.
  - **Pas encore vérifié sur l'iPhone** (verrouillé pendant la session du 08/10) : rendu de la caméra
    derrière la page, conventions des poses, photo haute résolution, boussole pendant ARKit. Au
    simulateur iOS (sans ARKit) : repli sur la caméra web vérifié.
- **Retour par le bord gauche** (0.19.0, app iOS) : `PictiViewController.viewDidLoad` →
  `webView.allowsBackForwardNavigationGestures = true` : le vrai geste d'iOS (glisser depuis le bord
  gauche ; depuis le bord droit pour revenir en avant), l'écran précédent apparaît dessous (image
  prise par WebKit au moment où on l'a quitté : s'il y avait une feuille ouverte, comme le menu,
  elle apparaît dans l'aperçu puis l'écran retrouvé est sans elle). Le calque fixe des boutons en
  verre est posé dans `webView.scrollView` (et non sur la WebView) pour glisser avec la page et
  passer sous cet aperçu. Le routeur garde la profondeur de chaque entrée de l'historique
  (`pictiDepth` dans `history.state`, notée après `location.hash = …` — un `popstate` émis pendant
  l'affectation est ignoré, `navigating` — et par `replaceState` / les feuilles) et la relit à chaque
  `popstate` : un retour fait sans `goBack` (ce geste, bouton du navigateur) ne la dérègle plus
  (avant, « Retour » pouvait ensuite ne plus rien faire).
- **Liens d'invitation (préparés, pas actifs)** : `appUrlOpen` → `appLinkHash` (même hôte que
  `APP_URL`, ancre `#/…` seulement) → `location.hash`. Modèles
  `public/.well-known/apple-app-site-association` (`TEAM_ID_APPLE.app.picti`, composant
  `"#": "/ami/*"` : seuls les liens d'invitation ouvriraient l'app, pas `#access_token=…`) et
  `assetlinks.json` (empreinte SHA-256 à remplir) ; `vercel.json` sert l'AASA en
  `application/json`. Pour activer : Team ID (compte payant : « Associated Domains » n'existe pas
  en compte gratuit) + capacité `applinks:picti.vercel.app` ; Android : empreinte + `intent-filter`
  `autoVerify` — Android ne filtre pas sur `#`, donc tous les liens du site (y compris « mot de
  passe oublié ») ouvriraient l'app : à régler avant. Déconnecté, un lien reçu dans l'app ne
  passe pas par `rememberInvite` (l'écran de connexion est déjà affiché) ; après connexion, la
  route `ami` est toujours dans l'adresse et ouvre l'invitation.
- **Limites connues** : Android — « Enregistrer » ne fait rien (`navigator.share` absent de la
  WebView, pas de gestion des téléchargements) ; il faudra `@capacitor/filesystem` +
  `@capacitor/share`. À vérifier sur appareil : MapLibre (processus de fond servi par
  `capacitor://`), position dans la WebView iOS, import de photos (`<input type="file">`).
- **Avant l'App Store** : suppression du compte dans l'app (règle 5.1.1), politique de
  confidentialité et fiche confidentialité, icônes / écran de démarrage (`npx @capacitor/assets
  generate`, logo 1024 × 1024 ; encore ceux du modèle Capacitor), Apple Developer Program.

## État et suite

- 0.001.0 (sept. 2026) : prototype complet local (direct, différé EXIF, recalage sur place,
  chasse AR avec capture, profil, chasses, proximité, recherche, mode démo).
- 0.002.0 : Supabase (comptes, publication des photos, photos des autres à proximité,
  visibilité publique/amis/privée, amis par code, chasseurs/proies, captures partagées).
- 0.003.0 : carte du monde, viseur augmenté (photos du lieu empilées), enregistrement Premium.
- 0.004.0 : passage en Premium par code administrateur.
- 0.005.0 : fin de l'essai gratuit (différé réservé à Premium, vérifié en base), notification
  de mise à jour et bouton « Recharger ».
- 0.006.0 : fond caméra en noir et blanc (accueil, chasse, recalage) ; photos géocadrées en couleur.
- 0.007.0 : selfies géocadrés (caméra avant), filtre « Selfies » dans la recherche.
- 0.008.0 : photos d'un même endroit empilées, à faire glisser (Tinder) avec points (Instagram).
- 0.008.1 : numéro de version au format x.xxx.x (menu, notification de mise à jour).
- 0.008.2 : heure de prise de vue à côté de la date (`formatDateTime`, `photoTitleAndDate`).
- 0.009.0 : autorisations caméra et boussole gardées en mémoire.
- 0.009.1 : photos ancrées dans le décor (elles ne suivent plus le téléphone) : position réelle
  du spectateur, suivi GPS + accéléromètre, recalage au moment de la capture.
- 0.009.2 : à l'arrêt, un déplacement que l'accéléromètre n'a pas vu (ou un GPS en retard) est
  rattrapé ; distance à la photo visée affichée dans le viseur, « · marche » sur la pastille GPS.
- 0.010.0 : mot de passe oublié (demande d'un lien par e-mail, écran « Nouveau mot de passe », lien expiré signalé).
- 0.010.1 : photos stables et lointaines : cap iPhone gyroscope + recalage lent de la boussole,
  comptage des pas, position tenue à l'arrêt, photo réduite de loin (à 20 m : 12 % de l'écran).
- 0.011.0 : carte orientable (deux doigts) avec bouton boussole pour remettre le nord en haut.
- 0.011.1 : focale de la caméra mesurée automatiquement (iPhone Pro : la photo ne reste plus
  décalée après avoir tourné) ; affichée dans le menu.
- 0.011.2 : défauts d'affichage de la revue ergonomique du 30/09 : bouton retour qui chevauchait
  les titres et crayon « Renommer » invisible (`:where(.round-btn)` sans poids, pour que
  `.back-btn` / `.detail-edit` gardent leur position absolue), recherche qui débordait à droite
  (`.search-field { min-width: 0 }`), titres « Mes proies (1) » au lieu de « Mes 1 proie »,
  étiquette du viseur sans l'année en cours (`formatDayTime`) pour ne plus couper l'heure.
- 0.011.3 : selfies à taille réelle (sujet à 0,6 m au lieu de 6 m) ; position qui avance pas à pas
  (accéléromètre + orientation) : en avançant ou en reculant de quelques mètres, la photo grandit
  ou rapetisse à sa place au lieu de suivre le téléphone ; carte : vignettes et position qui suivent
  le doigt pendant le déplacement (elles restaient figées puis se replaçaient 2 à 3 s après).
- 0.012.0 : photos vues de dos, comme sur une vitre dépolie (floues, en miroir, avec un reflet) au lieu
  de disparaître une fois dépassées ; effacement en douceur quand on les voit par la tranche.
- 0.013.0 : couleurs inversées — caméra en couleur, photos des autres en noir et blanc jusqu'à leur
  capture (couleur progressive en s'alignant, jusqu'à 40 %, puis la couleur envahit la photo) ;
  capture directe d'un appui (« Capturer », chasse et viseur) ; surbrillance animée des photos en
  couleur ; même règle partout (profil, chasses, listes, carte, piles). Combinée à la vitre (0.012.0).
- 0.013.1 : capture à moins de 5 m du point de vue ; ancrage renforcé — nord de la boussole
  partagé entre les écrans, pas au sens inconnu ignorés (plus de glissement en se balançant),
  dérive GPS < 8 m ignorée à l'arrêt, même position pour accueil / chasse / recalage, avertissement
  quand une photo est prise avec un GPS imprécis (> ±15 m).
- 0.014.0 : la photo est une « carte » (cadre blanc, taille plafonnée à 60 % × 45 % de l'écran),
  qui ne remplit plus jamais l'écran en se promenant ; à moins de 2 m de la photo elle-même, elle
  se floute et s'efface (plus de disparition sèche en la traversant, recto comme vitre) ; capture
  par agrandissement : on ne bouge plus, la photo grandit en 2 s jusqu'à couvrir l'écran en prenant
  ses couleurs, capturée à 100 % — marcher ou tourner le téléphone annule. Amis et vie privée (même
  version) : nouvelles photos réservées aux amis par défaut (réglable dans le profil), pastille de
  visibilité au-dessus du déclencheur et dans l'import, toast « visible par vos amis » + « Modifier »,
  invitations (lien `#/ami/<code>`, partage, QR code, recherche par nom), pastille des demandes
  reçues, carte filtrable Monde / Amis.
- 0.015.0 : likes (cœur sur la fiche, la pile du viseur et du détail, la fiche de groupe de la carte ;
  « Aimée par … » pour l'auteur) ; capturer = aimer sur place ; notifications (cloche, likes regroupés,
  temps réel) ; reproductions (« Reproduire cette photo » après une capture : calque de l'originale ;
  toute photo prise dans la vue d'une autre en devient une version, ↻, avant / après) ; piles triées
  par likes (bonus 24 h des photos neuves), galerie d'un lieu (trois tris) ; lieu = 5 m (jusqu'à
  10 m selon le GPS) et même direction. Notifications push : structure seulement.
- 0.015.1 : ligne de version du menu sans l'heure de la mise à jour (« Version 0.015.1 · 6 oct. »).
- 0.015.2 : Reproduire — guidage quand on s'éloigne de la vue de l'originale (orange au bord,
  rouge hors de la vue après 2 s, « lieu quitté » à 50 m), image figée et choix « Revenir au point
  de vue » / « Garder en photo classique » au déclenchement hors de la vue, jamais de photo perdue ;
  GPS plus fiable à la prise : pastille orange au-delà de ±12 m, « Position imprécise » → Attendre /
  Prendre quand même, moyenne pondérée des relevés à l'arrêt, précision enregistrée (EXIF pour les
  imports), explication « Position exacte » sur iPhone.
- 0.016.0 : fiche d'une photo (photo en grand, auteur → profil public, « Prise le … à … », « Au fil
  du temps » / « D'après la photo de … », détails techniques repliés) ; profil public et bouton
  d'amitié ; appui sur une photo = sa fiche partout (viseur : capture à moins de 5 m) ; fiche en
  feuille juste après une capture ; miniature après une prise de vue ; noms cliquables. Rapport de
  sécurité sur `friendships` / `profiles` (correctif proposé, en attente d'accord).
- 0.016.1 : Reproduire — deux croix (axe blanc, orientation cible jaune), centrées dans la vidéo hors commandes ; roulis, paysage, miroir selfie, flèche hors champ et consigne derrière ; repli à l’œil sans capteurs valides/récents. Distance et GPS séparés ; règles de rattachement, capture et base inchangées.
- 0.016.2 : pastille de précision du viseur sans le mot « GPS » : épingle + « ±3 m » (« … » en attendant le signal).
- 0.016.3 : fiche d'une photo non capturée : le bouton « Chasser in situ » devient « Capturer » (« Revoir in situ » inchangé).
- 0.017.0 : mode des photos au déclencheur — plus de pastille au-dessus ; appui long sur le bouton rouge puis glisser à gauche / droite (Public · Amis · Privé), le symbole du bouton suit ; Public à la première ouverture, puis le dernier mode choisi est gardé (sur l'appareil). Numéro repris des boutons verre liquide (abandonnés, jamais en ligne) ; 0.018.0 est réservée à la coque Capacitor.
- 0.017.1 : le déclencheur devient un carrousel à l'appui long : il grossit, les autres symboles apparaissent flous à gauche et à droite, suivent le doigt et viennent se placer dans le cercle rouge, nom du mode au-dessus pendant l'appui (plus de réglette séparée ni de toast).
- 0.19.0 : vrais boutons Liquid Glass dans l'app iOS 26+ : viseur (rail, « + », Menu ; Reproduire), puis tous les boutons ronds (retour de chaque page, carte et sa boussole, profil, chasse, recalage), les croix des feuilles, les pastilles de choix (visibilité, filtres, tri) et « Monde / Amis » de la carte ; plugin Swift local ; retour en glissant depuis le bord gauche (app iOS). Sur le site aussi : symbole du mode (globe / amis / cadenas) sur toutes les vignettes de « Mes photos » au lieu du texte rouge, piles glissables dans « Mes photos » et le profil public, « Retour » qui reste juste après un retour du navigateur. En production le 08/10.
- 0.18.0 : coque native Capacitor 8 (iOS + Android), web embarqué ; liens des e-mails vers l'app en ligne, pas de bandeau de mise à jour, « · app iOS » dans le menu ; liens d'invitation préparés (pas actifs). Site web inchangé.
- Test terrain du 30/09 (iPhone, 0.011.2) : selfie beaucoup trop grand ; en avançant et en reculant,
  la photo garde sa taille et suit le téléphone (rotation sur place : OK) → 0.011.3.
- Test terrain du 30/09 (iPhone, 0.011.1) : ancrage « pratiquement parfait » — la photo ne bouge
  pratiquement plus quand on pivote le téléphone à 3-4 m d'elle. Reste à tester la marche (5-10 m).
- Prochaines étapes : appliquer la migration `public_profile` et la partie B1 du correctif de
  sécurité des amitiés (accord d'Eliott donné ; A appliquée le 07/10 ; B2 quand plus personne n'a la 0.15.x) ; test sur iPhone de la
  fiche (défilement, feuille glissée vers le bas, bouton retour) ; test terrain de la 0.014.0 sur iPhone (fluidité de l'agrandissement, flou à
  l'approche, tolérances d'immobilité ; amis : invitation par lien et QR code entre deux iPhone) ;
  0.015.0 sur iPhone (reproduction avec le calque, notifications en temps réel) ; 0.015.2 sur iPhone
  (bandeaux en s'éloignant, feuilles du déclencheur, « Attendre », stabilité à l'arrêt) ; envoi des
  notifications push (voir la note du 06/10, « Likes et reproductions ») ; test terrain en marchant (reculer de 5 à 10 m) et de la carte orientable ;
  choix d'Eliott sur les autres points de la revue ergonomique du 30/09 (voir sa note) ; test terrain à
  plusieurs ; paiement Premium ; tester « mot de passe oublié » avec un vrai e-mail (modèles
  d'e-mails français dans `supabase/templates/`, à coller dans Supabase › Authentication › Emails ;
  envoi d'e-mails : SMTP intégré limité) ; notifications de proximité ; piste VPS/native ; **coque 0.18.0 sur iPhone** (autorisations, viseur, boussole, capture, carte, connexion, mot de passe oublié), puis Android.

## Journal des discussions

- [2026-09-28 — Reprise du projet et prototype v0.1](claude/picti/2026-09-28-prototype-v0.1.md)
- [2026-09-28 — Mettre à jour l'app installée sur l'écran d'accueil](claude/picti/2026-09-28-mises-a-jour-ecran-accueil.md)
- [2026-09-28 — Fond caméra en noir et blanc](claude/picti/2026-09-28-fond-camera-noir-et-blanc.md)
- [2026-09-28 — Selfies géocadrés](claude/picti/2026-09-28-selfies.md)
- [2026-09-28 — Photos d'un même endroit empilées](claude/picti/2026-09-28-photos-empilees.md)
- [2026-09-28 — Numéro de version x.xxx.x](claude/picti/2026-09-28-numero-de-version.md)
- [2026-09-28 — Heure des photos](claude/picti/2026-09-28-heure-des-photos.md)
- [2026-09-28 — Autorisations caméra et boussole mémorisées](claude/picti/2026-09-28-autorisations-memorisees.md)
- [2026-09-28 — Photos ancrées dans le décor (géolocalisation)](claude/picti/2026-09-28-photos-ancrees.md)
- [2026-09-28 — Photo qui suit encore après 5 m (0.009.2)](claude/picti/2026-09-28-photo-suit-encore.md)
- [2026-09-29 — Point d'étape : sur quoi se concentrer](claude/picti/2026-09-29-point-etape.md)
- [2026-09-29 — Objectifs du jour](claude/picti/2026-09-29-objectifs-du-jour.md)
- [2026-09-29 — Mot de passe oublié (0.010.0)](claude/picti/2026-09-29-mot-de-passe-oublie.md)
- [2026-09-29 — La photo bouge et reste trop grande de loin (0.010.1)](claude/picti/2026-09-29-photo-stable-et-lointaine.md)
- [2026-09-29 — Carte orientable (0.011.0)](claude/picti/2026-09-29-carte-orientable.md)
- [2026-09-29 — Photo encore un peu décalée sur iPhone Pro : focale mesurée (0.011.1)](claude/picti/2026-09-29-focale-mesuree.md)
- [2026-09-30 — Améliorer l'ergonomie de l'app](claude/picti/2026-09-30-ergonomie.md)
- [2026-09-30 — Selfie trop grand, photo qui suit en avançant, carte figée (0.011.3)](claude/picti/2026-09-30-selfie-et-marche.md)
- [2026-09-30 — Photos vues de dos, comme sur une vitre dépolie (0.012.0)](claude/picti/2026-09-30-photos-de-dos-vitre.md)
- [2026-09-30 — Couleurs inversées : la couleur, récompense de la chasse (0.013.0)](claude/picti/2026-09-30-couleurs-inversees.md)
- [2026-09-30 — Capture à moins de 5 m, photo qui ne bouge plus (0.013.1)](claude/picti/2026-09-30-capture-5m-ancrage.md)
- [2026-10-06 — Photo « carte », effacement à 2 m, capture par agrandissement (0.014.0)](claude/picti/2026-10-06-carte-et-capture.md)
- [2026-10-06 — Amis : « amis » par défaut, choix à la prise, invitations, carte Monde / Amis (0.014.0)](claude/picti/2026-10-06-amis.md)
- [2026-10-06 — Likes, capture = like, notifications, reproductions, galerie, lieux à 5 m (0.015.0)](claude/picti/2026-10-06-likes-et-reproductions.md)
- [2026-10-06 — Reproduire hors de la vue, GPS plus fiable à la prise (0.015.2)](claude/picti/2026-10-06-reproduire-et-gps.md)
- [2026-10-06 — Fiche d'une photo, profil public, bouton d'amitié, sécurité des amitiés (0.16.0)](claude/picti/2026-10-06-fiche-photo.md)

- [2026-10-06 — Reproduire : deux croix à aligner (0.016.1)](claude/picti/2026-10-06-reproduire-deux-croix.md)
- [2026-10-07 — Faille des amitiés corrigée en base (correctif A)](claude/picti/2026-10-07-faille-amities.md)
- [2026-10-07 — Pastille de précision sans « GPS » (0.016.2)](claude/picti/2026-10-07-pastille-precision.md)
- [2026-10-07 — Mode Public · Amis · Privé au déclencheur, puis carrousel (0.17.0, 0.17.1)](claude/picti/2026-10-07-mode-au-declencheur.md)
- [2026-10-07 — Coque native Capacitor iOS + Android (0.18.0)](claude/picti/2026-10-07-coque-capacitor.md)
- [2026-10-08 — Vrais boutons Liquid Glass dans l'app iOS (0.19.0)](claude/picti/2026-10-08-boutons-liquid-glass.md)
