# 2026-10-07 — Coque native Capacitor iOS + Android (0.18.0)

Parent : [CLAUDE.md](../../CLAUDE.md)

Prompt d'Eliott `PROMPT-0.018.0.md` : ajouter une coque native **Capacitor 8** (iOS + Android),
web embarqué, sans rien changer à https://picti.vercel.app. Branche `claude/coque-capacitor`.

- **Installation** : `@capacitor/core`, `ios`, `android`, `app` 8.x ; `@capacitor/cli` en
  dépendance de dev. `capacitor.config.ts` (`app.picti`, `PICTI`, `dist`, fond blanc,
  `server.url` en commentaire). `ios/` en Swift Package Manager, `android/` (SDK 36). Scripts
  `native:sync`, `native:ios`, `native:android`.
- **Autorisations** en français : caméra, position, mouvement, photos (lecture et ajout) ;
  `CAMERA`, positions fine et approximative, caméra non obligatoire. Portrait seul. Barre d'état
  en texte blanc comme la version web (`UIStatusBarStyleLightContent`, `SystemBars` `DARK`).
- **`src/native.ts`** (seul import de `@capacitor/core`) + 8 tests : `isNative`, `platform`,
  `platformLabel`, `authRedirectUrl`, `appLinkHash`, `listenForAppLinks`.
- **Adaptations en natif seulement** : liens des e-mails Supabase vers `APP_URL` (message « mot de
  passe oublié » adapté : le lien s'ouvre dans le navigateur) ; pas de vérification de mise à
  jour ; « · app iOS / Android » dans le menu, sans « (locale) ».
- **Liens d'invitation préparés** : écouteur `appUrlOpen` → `location.hash` ; modèles
  `public/.well-known/apple-app-site-association` (seuls les liens `#/ami/*`) et `assetlinks.json`
  à remplir ; `vercel.json` pour le type `application/json`. Pas activés (compte Apple payant,
  empreinte Android, et sur Android le `#` n'est pas filtrable).
- **Git / Vercel** : copies du web et compilations ignorées (gitignore des projets natifs), clés
  de signature ignorées à la racine ; `.vercelignore` exclut `ios/` et `android/`.
- **Limite** : « Enregistrer » ne marche pas sur Android (pas de partage ni de téléchargement dans
  la WebView) — plugin à ajouter.
- Le Mac d'Eliott : Xcode 26.3 installé le 07/10 (macOS Sequoia 15.7), pas d'Android Studio.
- Version 0.18.0. typecheck, lint, 299 tests, build et `cap sync` OK.
