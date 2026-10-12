# 2026-10-12 — Barre du bas, carte en glissé, double appui, Paramètres, partager, retirer une capture (0.23.0)

Parent : [CLAUDE.md](../../CLAUDE.md) · suite de [2026-10-12-profil-en-glissant.md](./2026-10-12-profil-en-glissant.md)
et [2026-10-12-photo-essai.md](./2026-10-12-photo-essai.md) · prompt `PROMPT-0.023.0.md` du dossier d'Eliott
(conception : `PICTI-ERGONOMIE-MENU.md`)

## Demande
Le viseur ne garde que l'action ; toute la navigation passe par **une barre flottante en bas** (façon
Instagram) et **deux glissés** (carte à gauche, profil à droite, façon Snap sans le chat). Plus : double
appui pour la caméra avant, menu Explorer, Mon profil + Paramètres, et sur la fiche « Retrouver » ·
« Reproduire » · Partager, retirer une capture.

## Ce qui est fait
- **Trois écrans côte à côte** — [ Carte ] ← [ Viseur ] → [ Mon profil ] — rendus par un seul `Home` qui
  reste monté (`#/`, `#/carte`, `#/profil` donnent le même élément). La carte et le profil sont préparés
  cachés peu après l'ouverture du viseur, puis gardés : la carte n'est plus rechargée à chaque ouverture.
  Viseur recouvert : caméra web rendue (gardée 15 s), caméra d'ARKit cachée, session ARKit gardée 15 s
  (revenu avant, calage intact) ; au-delà, redémarrage avec les protections de la 0.21.0.
- **Glissés** (`usePanes`, généralisation du moteur de la 0.21.1) : vers la droite la carte, vers la gauche
  le profil, sous le doigt ; tiers de l'écran ou geste vif ; sur la carte, retour seulement depuis la
  bande de 24 px du bord droit (ailleurs le doigt déplace la carte), ou par le bouton rouge réduit.
  App iOS : gestes de WebKit coupés sur le viseur et la carte, gardés sur le profil.
- **Barre** : Menu · bouton rouge (grand sur le viseur, il déborde ; réduit ailleurs, il ramène au viseur,
  animé avec le glissé) · avatar. Web : verre CSS. **App iOS 26+ : vrai Liquid Glass** — deux nouveaux
  types dans le plugin `GlassButtons` : la pilule (`bar`, Menu et avatar dessinés dedans) et le bouton
  rouge (`shutter`). Haptique légère à chaque appui.
- **Mode Public / Amis / Privé en colonne** au-dessus du bouton rouge (glisser vers le haut), rien en
  dessous, jamais sur Menu ni Profil ; le nom du mode à côté du cercle, au-dessus de la pilule.
- **Double appui sur l'image = caméra avant / arrière** (plus de bouton selfie) ; jamais de photo ; rien
  depuis un bouton, la barre, une pastille, la frise ni une photo du décor (son appui reste prioritaire).
- **Viseur allégé** : rail = notifications + « à chasser ». **« + » d'import sur la carte** ; une photo sans
  aucune position peut être posée au centre de la carte (position approchée, à géocadrer sur place).
- **Menu Explorer** : À proximité · Rechercher · Mes chasses · Amis, « Carte du monde », « PICTI 0.023.0 ».
- **Mon profil** : avatar, pseudo, « n photos · n captures · n amis », onglets Mes photos / Mes captures /
  Mes amis ; ⚙️ → **Paramètres** : mode par défaut, pseudo, e-mail, Premium, déconnexion, tutoriel,
  version, focale, Recharger (site), **Avancé** (suivi visuel) après 7 appuis sur la version. Seulement
  des réglages qui existent déjà.
- **Fiche** : `[ Retrouver ] [ Reproduire ] (⇪)`. Partager = feuille du système avec le **fichier** (app :
  plugins Capacitor Filesystem + Share ; navigateur : `navigator.share({ files })`, sinon téléchargement),
  texte « Trouvée sur PICTI https://picti.vercel.app », annulation silencieuse, mêmes droits que l'ancien
  « Enregistrer sur mon téléphone » (supprimé). Réglé aussi sur Android, où « Enregistrer » ne faisait rien.
- **Retirer une capture** : « ⋯ » de la fiche, ou appui long dans Mes captures / Mes chasses →
  confirmation → ma ligne de `captures` seulement. Le droit existait déjà en base (policy « Supprimer ses
  captures », `hunter = auth.uid()`). La notification « capture » de l'auteur, elle, ne peut pas être
  effacée par le chasseur : migration `20261012220000_retirer_une_capture.sql` (déclencheur
  `captures_unlike`, qui efface aussi le côté « sur place » du like), **pas appliquée**.

## Vérifié
- Typecheck, lint, **405 tests** (16 nouveaux : double appui, seuils des glissés dans les deux sens et
  bande du bord droit, colonne des modes, pilule et bouton rouge natifs, partage), build, `cap sync`
  (5 plugins iOS), `xcodebuild` (simulateur) OK.
- **Banc web et banc « iPhone simulé »** (fausse base, capteurs et ARKit simulés), script de 70 contrôles
  (`barre.mjs`), tout vert dans les deux : carte au doigt et par le bouton rouge réduit, glissé au milieu
  de la carte qui ne la ferme pas, retour par le bord droit, glissé trop court qui repart, profil en
  glissant, caméra / ARKit en pause sous la carte et repris au retour (pas d'écran noir), colonne des modes
  sans photo ni glissé d'écran, double appui → caméra avant (ARKit coupé) puis arrière (ARKit relancé),
  double appui sur la barre → rien, menu, « + » → import (barre cachée), Paramètres (mode par défaut,
  Avancé après 7 appuis), tutoriel sans barre, fiche (Retrouver, Reproduire plus étroit, Partager ; carte
  Premium pour la photo d'un autre sans Premium), partage natif (fichier écrit dans le cache, feuille avec
  le fichier, fichier effacé), web avec et sans `navigator.share`, annulation silencieuse, retrait d'une
  capture depuis la fiche et depuis Mes captures (photo de nouveau N&B et chassable, compteur à jour,
  aucune autre ligne de `captures` touchée, impossible sur ma photo), données envoyées au natif pour la
  pilule et le bouton rouge.
- **Simulateur iOS 26.3** (vraie app, web du banc) : vraie pilule Liquid Glass ; glisser depuis le bord
  gauche du viseur ouvre la carte, sur la carte le même geste déplace la carte (pas de retour de WebKit),
  le bord droit ramène au viseur ; sur le profil, le geste retour d'iOS ramène au viseur.
- **Vraie base**, transactions annulées : le chasseur supprime sa capture (et le déclencheur proposé
  efface la notification, like `on_site` → faux) ; l'auteur de la photo, un autre compte et `anon` ne
  suppriment rien ; base vérifiée intacte après.
- Captures : [avant / après](./2026-10-12-barre-du-bas-avant-apres.jpg) (viseur, menu, carte, profil,
  Paramètres, fiche — même banc, même compte), [app iOS au simulateur](./2026-10-12-barre-du-bas-ios.jpg).

## Choix faits en route (à valider)
- Le **Menu ouvert** sur la carte ou le profil monte par-dessus eux (sous la barre) ; « Carte du monde »
  depuis la carte ne fait que fermer le menu.
- La **miniature** de la dernière photo (coin bas-gauche depuis 0.16.0) disparaît avec le « + » : le
  message après la prise porte « Voir » (→ fiche), pour que le bas du viseur n'ait que la barre.
- Bouton « Liste à proximité » retiré de la carte (À proximité est dans le menu ; deux icônes 4 carrés
  prêtaient à confusion). Crédits de la carte en bas à gauche, au-dessus de la barre (à droite, ils étaient
  sous la bande du bord).
- Retirer une capture laisse le like (devenu ordinaire, retirable) ; « Retrouver » = même action que
  « Revoir in situ ».
- Les nouveaux textes sont au tutoiement ; les anciens composants (Premium, aides de visibilité) gardent
  le vouvoiement — à harmoniser à part si voulu.

## Pas fait / limites
- **Pas vu sur l'iPhone** ni sur l'émulateur Android (Android pas recompilé : place disque). Rendu des
  symboles de la pilule sur une caméra sombre réelle à vérifier (couleur adaptée par le verre).
- La **0.22.1** (grand angle et zoom, `claude/grand-angle-et-zoom`) n'est pas dans cette branche : ses
  boutons « 0,5 · 1× · 2 · 5 » au-dessus du déclencheur seront à replacer par rapport à la colonne des
  modes à la fusion.
- Migration de la notification non appliquée (accord d'Eliott).

## Branche
`claude/barre-du-bas` = `claude/photo-essai` (0.22.0) + fusion de `claude/profil-en-glissant` (0.21.1,
conflits = numéros de version et doc) + 0.23.0. Pas fusionnée dans `main`.
