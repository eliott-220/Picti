# Likes, capture = like, notifications, reproductions, galerie, lieux à 5 m — 6 octobre 2026 (0.15.0)

Projet : [PICTI](../../CLAUDE.md) · Branche `claude/likes-et-reproduction`
Voir aussi : [Amis (0.14.0)](2026-10-06-amis.md) · [Photo « carte », capture par agrandissement (0.14.0)](2026-10-06-carte-et-capture.md)

## Demande d'Eliott

Prompt « 0.015.0 » (décisions du 06/10 : liker, refaire une photo, galerie). Vocabulaire : un
**lieu** = des photos prises au même endroit ; une **vue** = même lieu et même direction ; une photo
dans une vue existante en est une **version** (une reproduction). Six choses :

1. **Likes** (cœur + compteur ; l'auteur voit qui a aimé).
2. **Capturer = liker** (like « sur place », jamais deux likes).
3. **Notifications** (likes regroupés, captures ; dans l'app, en temps réel ; push si possible).
4. **Reproduire une photo capturée** (calque de l'originale ; versions, ↻, avant / après).
5. **Pile triée par likes** + **galerie** d'un lieu (trois tris).
6. **Rayon d'un lieu : 5 m** (selon la précision GPS, jusqu'à 10 m) et même direction.

## Ce qui a été fait

- **Base** (`supabase/migrations/20261006160000_likes_et_reproductions.sql`, appliquée le 06/10 avec
  l'accord d'Eliott, compatible avec la 0.14.0 en ligne) : `photos.likes_count`, `version_of`,
  `versions_count` (compteurs non modifiables depuis l'app) ; tables `photo_likes`, `notifications`
  (Realtime), `push_subscriptions` ; déclencheurs : like → compteur + notification, capture → like sur
  place + notification « capture », contrôle et compteur des versions ; `photos_in_bounds` renvoie
  aussi `likes_count`, `version_of`, `accuracy`. La capture déjà faite sur la photo d'un autre a reçu
  son like sur place.
- **Géométrie** : `sameSpot` / `spotRadius` (5 m, précision GPS, 10 m, caps à ±45°) et `pileOrder`
  dans `src/geo/spots.ts` ; `sameView`, `chooseParent`, `capVisibility` dans `src/geo/views.ts`.
  `groupBySpot` ancre toujours un lieu sur sa photo la plus récente (un like ne déplace pas le lieu),
  puis range la pile. Plus aucune comparaison directe à `SAME_SPOT_RADIUS` (supprimé).
- **Likes** : `LikeButton` (optimiste) dans le détail (sous le titre), la frise du viseur et de la
  chasse, la carte de la pile sur la carte du monde ; nombre sur les vignettes (Mes photos, galerie,
  fiche de groupe). L'auteur : « Aimée par … » (épingle = sur place). Pas de cœur cliquable sur ses
  propres photos.
- **Capture** : la chasse dit « Elle compte comme un like, aimée sur place » et propose « Reproduire
  cette photo » ; le viseur affiche « Photo capturée · aimée sur place » + « Reproduire ».
- **Notifications** : cloche en tête du rail de l'accueil (pastille des non lues) → `#/notifications`
  (likes d'une même photo regroupés, appui = ouvre la photo et marque lu, « Tout marquer comme lu »).
  Temps réel, sinon toutes les 60 s ; au retour dans l'app.
- **Reproductions** : `#/reproduire/<id>` = viseur avec l'originale en calque (champ de vision réel,
  opacité réglable) et les jauges de la chasse ; la photo prise devient une version (sinon : « trop
  loin du cadrage de l'originale : pas rattachée ») → son détail. Une photo classique prise dans une
  vue existante est rattachée d'office (toast « ↻ même vue que la photo d'Alice »). Détail : bloc de
  la parente (vignette, date, likes), « Avant / après » (curseur et doigt), « Reproduite n fois » ;
  choix de visibilité plafonné à celle de la parente.
- **Pile et galerie** : partout (viseur, en-tête du détail, chasse, Mes photos, carte), les plus
  aimées devant, une photo de moins de 24 h en tête. Appui sur les points → galerie du lieu (tri
  « Les plus aimées » sans bonus, « Les plus récentes » = ajout, « Date de prise » ; mémorisé).

## Choix faits en codant (à valider)

- Textes des notifications au **vouvoiement** (« Paul a capturé votre photo », « Paul aime votre
  photo ») comme le reste de l'app, alors que le prompt écrivait « ta photo ».
- Rattachement d'office : on écarte les parentes privées et celles moins visibles que la nouvelle
  photo (sinon il aurait fallu restreindre la photo sans le dire). Avec « Reproduire », la visibilité
  est ramenée à celle de l'originale et le toast le dit.
- La base refuse une version hors de la vue ou trop visible : l'app réessaie alors **sans** parente,
  pour ne jamais perdre la photo.
- Ordre de la pile : `PILE_SCORE.onSiteLike` = 0 pour l'instant (`likes_count` compte tous les likes ;
  pondérer les likes sur place demandera un compteur séparé).

## Vérifications

- `npm test` : 226 tests (194 avant) — `sameSpot` (4 m même direction, 7 m à ±3 m séparés, 7 m à
  ±8 m même lieu, 3 m dos à dos séparés, 12 m toujours séparés), `sameView` (cap, inclinaison, nord,
  selfie), `chooseParent`, `capVisibility`, tri de la pile (likes, égalité, bonus 24 h), lignes
  (`likes_count`, `version_of`, compteurs jamais écrits), regroupement et textes des notifications,
  routes, élision « d'Alice ». `npm run lint`, `npm run build` : OK.
- **Base réelle** (SQL, bloc entièrement annulé, deux comptes) : like d'une photo publique (compteur 1),
  refus de liker sa photo, une photo « amis » d'un non-ami, un like « sur place » direct ; unlike
  (compteur 0, notification effacée) ; capture : le like devient sur place, compteur inchangé,
  notifications de l'auteur « like » puis « capture », le like ne se retire plus ; le chasseur ne voit
  pas les notifications de l'auteur ; version dans la vue acceptée (compteurs forcés à 999 → 0,
  `versions_count` 1), refusée dans une autre direction, à 16 m, d'une photo « amis » invisible, d'une
  photo privée ; version publique d'une photo « amis » refusée (à l'insertion et en la modifiant) ;
  compteurs non modifiables ; l'auteur marque lues ses notifications, ne peut ni changer leur type
  ni en créer ; suppression d'une version → compteur 0. Base vérifiée intacte ; conseiller de
  sécurité : rien de nouveau.
- **Chrome sans interface** (390 × 844), vraie application sur la fausse base du banc (règles et
  déclencheurs reproduits, temps réel entre onglets), caméra / GPS / boussole simulés : viseur — la
  photo à 3 likes en tête ; like 3 → 4 (notification), unlike → 3 (effacée) ; chasse → capturée
  (« aimée sur place », 4 likes, notification « capture ») → « Reproduire » : calque et jauges →
  prise → détail de la reproduction (parente, avant / après plein écran) ; photo classique rattachée
  d'office ; viseur : ↻ sur la carte, anneaux dans les points ; galerie et ses trois tris ; la photo à
  7 m (GPS ±3 m) n'est pas dans le lieu ; carte : fiche du groupe triée ; Alice : cloche « 4 non
  lues », « Bruno a capturé votre photo », « Ewan et 2 autres aiment votre photo », mise à jour en
  direct quand Ewan retire puis remet son like ; appui → photo, lue ; « Aimée par Clément, Denise,
  Bruno (épingle), Ewan » ; « Reproduite 2 fois » (les versions de Bruno, réservées à ses amis, ne lui
  sont pas visibles — RLS).
- **Pas fait** : deux vrais comptes sur un vrai téléphone (Claude ne saisit pas d'identifiants).

## Notifications push : ce qu'il reste

La liste dans l'app est complète ; pour les notifications push (Web Push), la table
`push_subscriptions` est prête. Il reste :

1. Générer une paire de clés VAPID (`npx web-push generate-vapid-keys`) : la clé publique dans
   `src/config.ts`, la clé privée en **secret Supabase** (`VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`),
   jamais dans le dépôt — à faire par Eliott dans Supabase › Edge Functions › Secrets.
2. Un **service worker** (la PWA n'en a pas encore) : événements `push` (afficher) et
   `notificationclick` (ouvrir `#/photo/<id>`).
3. Une entrée de menu « Activer les notifications » : permission, `pushManager.subscribe`,
   enregistrement dans `push_subscriptions` ; sur iPhone, seulement si PICTI est sur l'écran
   d'accueil (iOS 16.4+), avec cette explication.
4. Une **Edge Function** d'envoi (abonnements du destinataire, regroupement des likes, suppression des
   abonnements expirés) et un **webhook** de base de données sur l'insertion dans `notifications`.

## Mise en ligne

Pull request vers `main`, **non fusionnée** : fusionner = mise en production automatique sur
picti.vercel.app, seulement avec l'accord d'Eliott. La migration est déjà en place dans la base.
