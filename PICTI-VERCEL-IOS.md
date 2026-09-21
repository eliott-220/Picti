# PICTI — déploiement Vercel & comportement iPhone

(Parent : [CLAUDE.md](./CLAUDE.md) · [index du dossier](./PICTI.md))

## Ce qui est déployé sur Vercel
- Projet Vercel : **picti**.
- Ce qui est en ligne, c'est **`proto/`** (le prototype du noyau technique — géocadrage, viseur AR, capteurs), **pas le MVP complet**. Le MVP complet n'existe aujourd'hui que comme artifact Claude (voir [PICTI-MVP.md](./PICTI-MVP.md)) ; il n'a jamais été poussé sur GitHub ni déployé sur Vercel.
- Raison du déploiement : les capteurs (GPS, boussole) sont refusés par iOS en HTTP simple / IP locale — il fallait une vraie URL HTTPS pour tester sur le téléphone. Vercel fournit ça automatiquement (voir l'item correspondant dans « Pistes / à faire » de CLAUDE.md).

## « Ajouter à l'écran d'accueil » sur iPhone — ce que ça fait vraiment
- Ce n'est pas un téléchargement d'app (pas d'App Store) : Safari crée un raccourci (PWA) qui pointe vers l'URL Vercel.
- Avant cette session, `proto/index.html` n'avait aucune balise spécifique iOS : le raccourci aurait ouvert Safari normal (barre d'adresse visible), avec une icône = simple capture d'écran de la page.
- Ajouté dans `proto/index.html` (tête du document) : `apple-mobile-web-app-capable`, `apple-mobile-web-app-status-bar-style`, `apple-mobile-web-app-title`, `mobile-web-app-capable`. Avec ça, une fois le raccourci réinstallé sur l'écran d'accueil, PICTI s'ouvre en plein écran, sans barre Safari, avec le nom « PICTI » sous l'icône.
- Reste à faire si tu veux une vraie icône personnalisée (au lieu de la capture d'écran automatique) : fournir un PNG 180×180 et l'ajouter via `<link rel="apple-touch-icon" href="...">`.
- ⚠️ Il faut re-déployer (commit + push sur GitHub, ou redeploy Vercel) pour que ce changement soit visible sur le lien Vercel — pour l'instant il n'existe que dans le fichier local.

## Point de vigilance (stockage local + iOS)
- Le projet stocke tout en `localStorage` (voir CLAUDE.md). Sur iOS, Safari applique une politique de nettoyage du stockage des sites/PWA non ouverts depuis ~7 jours (anti-tracking, « ITP ») : si le raccourci PICTI reste sans être ouvert une semaine, les données locales peuvent être effacées. À garder en tête pour l'item « persistance au-delà du localStorage » déjà noté dans les pistes à faire.
