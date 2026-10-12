# 2026-10-12 — Tutoriel du premier lancement : photo d'essai, puis la vraie photo la plus proche (0.22.0)

Parent : [CLAUDE.md](../../CLAUDE.md) · prompt `PROMPT-0.022.0.md` du dossier d'Eliott (v2, revue du 12/10)
· idée de `PICTI-AMELIORATIONS-2026-10-12.md` (« carte vide = app morte pour un nouveau »)

Branche `claude/photo-essai`, partie de `claude/suivi-visuel` (`b295e5f`, 0.20.0 + 0.21.0, pas encore
dans `main`). Numéro 0.22.0 repris de la croix de visée, abandonnée le 12/10 (jamais en ligne).

## Ce que voit un nouvel utilisateur
1. **Avant tout compte**, « Prends ta première photo » : viseur plein écran, bouton rouge (sans le
   carrousel), « Passer » toujours là. Flash, « clac » haptique.
2. « Elle est posée là. Tourne-toi. » : sa photo devient une plaque en noir et blanc, accrochée devant
   l'endroit visé, avec le rendu du viseur ; elle glisse quand il tourne.
3. Une fois la plaque entièrement sortie (écart > demi-champ + 10°) : « Retrouve-la » — flèche au bord,
   la plaque devient nette et opaque, les vibrations se rapprochent (et un « tic » discret) ;
   « Tu y es ! » → « Capturer ».
4. La plaque s'agrandit en prenant ses couleurs (même animation qu'une vraie capture), couvre l'écran,
   se fond dans le décor réel : « C'est ça, PICTI · Des photos posées dans le monde réel, à retrouver
   sur place. »
5. La position est demandée seulement maintenant : « La photo la plus proche est à **240 m au
   nord-est** » → « Créer mon compte pour la chasser » / « J'ai déjà un compte ».

## Choix faits en codant (à valider par Eliott)
- **« Capturer »** : tolérances du prompt (cap ±20°, inclinaison ±15°) **et** centre de la plaque à
  l'écran. En portrait, le demi-champ horizontal fait ~17° : sans cette condition, « Tu y es ! »
  s'affichait avec la plaque presque hors de l'écran (vu au banc).
- **« S'entend »** : un « tic » Web Audio très discret au rythme des vibrations, plus aigu en s'alignant
  (seul retour sur iPhone dans Safari, qui ne vibre pas). Muet si le téléphone l'est.
- **Vignette sans compte** : une fonction SQL ne peut pas fournir d'image sans révéler le chemin de
  stockage, qui commence par l'identifiant de l'auteur. Sans compte, l'écran final montre donc une
  carte grise (épingle) à la place de la vignette ; connecté (tutoriel revu), la vraie vignette N&B
  floutée. Pour l'avoir aussi sans compte : petite fonction Edge Supabase (clé de service) qui renvoie
  l'image elle-même — à décider.
- **Paramètres** : l'app n'a pas d'écran de réglages ; « Revoir le tutoriel » est dans le menu (avec
  « Suivi visuel ») et, sans compte, sous le formulaire de connexion.
- **Utilisateurs déjà connectés** (mise à jour) : pas de tutoriel imposé, le drapeau est posé — sinon
  il apparaîtrait après une déconnexion.
- Sans capteurs (ordinateur) ou accès refusé : on regarde autour en faisant glisser l'image.

## Base de données
Migration `supabase/migrations/20261012160000_photo_la_plus_proche.sql` (nouvelle fonction seulement,
**pas appliquée** : à faire avec l'accord d'Eliott). Vérifiée sur la vraie base dans une transaction
annulée (fonction créée, testée, tout annulé, absente ensuite) : 12 photos publiques, 2 amis, 1 privée ;
sans compte, 15 positions testées (dont celles des photos amis et privée) — toujours la photo publique
la plus proche, directions sur 8 points, jamais d'identifiant ni de vignette ; connecté, une photo
publique qui n'est pas la sienne, vignette exacte. Tant qu'elle n'est pas appliquée, l'écran final dit
« Crée ton compte pour voir les photos autour de toi » (vérifié au banc).

## Vérifications
- 382 tests (dont `src/geo/tutorial.test.ts` : plaque hors champ, niveau d'alignement, vibrations,
  capture en orientation relative, cap absolu indifférent ; `src/data/nearestPhoto.test.ts` : « 240 m
  au nord-est », « 1,2 km au sud »), typecheck, lint, build, `cap sync` (Haptics et Preferences ajoutés
  côté iOS et Android).
- Banc (vraie app, fausse base, Chrome sans interface), navigateur avec gyroscope simulé et boussole
  folle, puis « iPhone simulé » avec ARKit et boussole faussée de 120° : parcours complet sans compte,
  « Passer », caméra refusée, position refusée, fonction absente, aucune photo à moins de 5 km, revu
  connecté depuis le menu (« Y aller » → chasse, « Passer » → retour au viseur), une seule fois
  (rechargé ; données de la WebView effacées → drapeau Preferences lu). Aucune écriture vers `photos`,
  `captures` ni le stockage pendant le tutoriel ; photo d'essai effacée à la fin. Retours haptiques
  natifs : clac, approche (léger puis moyen), succès.
- App iOS compilée (Xcode 26.3, simulateur) et lancée : premier lancement détecté (Preferences), pas
  d'ARKit au simulateur. Captures d'écran du simulateur blanches (Safari aussi) : rendu non vérifié là.

## Encore à voir
Sur l'iPhone d'Eliott : le parcours avec ARKit (plaque qui colle au décor, vibrations, son), chez soi
(boussole perturbée) ; Android (`navigator.vibrate` dans le navigateur, Haptics dans l'app).
