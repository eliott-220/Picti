# 0.24.4 — boussole réactivée au toucher, même après un glissé

(Parent : [CLAUDE.md](../../CLAUDE.md))

Demande d'Eliott du 14/10/2026 : « lors du lancement, la boussole indique "touchez l'écran", mais l'action ne l'active plus, il faut forcément cliquer sur ce bouton pour que ça marche ».

## Cause (reproduite au simulateur iOS 26.3, app compilée par Xcode)

iOS redemande l'accès à la boussole à chaque ouverture. Depuis la 0.009.0, `restoreCompass` (`src/sensors/useOrientation.ts`) le redemande au lancement (rejeté sans appui), puis écoute le premier `touchend` / `click` du document pour le redemander sur un geste. Ces écouteurs étaient **retirés dès le premier geste, quelle que soit la réponse**.

Or un glissé (changer de page, ouvrir Explorer en 0.24.3, pincer pour zoomer) n'est pas un appui pour WebKit : à la fin du glissé, `touchend` arrive sans activation et la demande est rejetée (`NotAllowedError: … requires a user gesture to prompt`). Trace relevée :

- appui simple : `touchend` avec activation → demande **accordée** (la coque Capacitor accorde sans fenêtre) ;
- glissé vers le haut : `touchend` sans activation → demande **rejetée**, écouteurs retirés → plus aucun appui ne réessaie ; seule la pastille (un `click`) marchait encore.

Avec les gestes ajoutés depuis la 0.23 (pages au doigt, Explorer, zoom), le premier geste après le lancement est souvent un glissé.

## Correction

- Les écouteurs restent en place jusqu'à une vraie réponse d'iOS : accordé (on s'arrête) ou refusé (on s'arrête et on oublie l'accès). Un rejet faute d'appui laisse la boussole « à activer » et le prochain appui réessaie.
- Une demande rejetée faute d'appui n'est plus prise pour un refus : la pastille ne passe plus à « Boussole refusée » dans ce cas (`askCompass` rend `granted` / `denied` / `gesture` ; `requestCompass` garde sa forme booléenne).
- Délai « Sans boussole » (4 s sans mesure) compté à partir de l'accès accordé : accordé plus de 4 s après l'ouverture, la pastille restait à « Boussole… » (appareil sans capteur, simulateur).
- Version 0.24.4 dans les deux fichiers npm et les projets iOS / Android.

## Vérification

- Vitest : **531 tests réussis, 1 ignoré**, dont 4 nouveaux (`src/sensors/useOrientation.test.ts` : glissé rejeté puis appui accordé, clic, refus, rejet ≠ refus) ; le premier échoue sur l'ancien code.
- TypeScript, lint, build, `cap sync`, `xcodebuild` simulateur : OK.
- App compilée par Xcode au simulateur « PICTI GPS » (iOS 26.3), vraie WebView, vraie demande d'accès (aucune boussole simulée), fausse base Supabase : relance → « Boussole : touchez l'écran » ; glissé vers le haut → rejeté, la pastille reste ; appui → accordé → « Sans boussole » (le simulateur n'a pas de capteur ; sur l'iPhone, « Suivi visuel » ou « Boussole »). Appui direct sans glissé : accordé aussi.
- Pas encore vu sur l'iPhone réel (débranché pendant la session). Aucun push, aucune publication Vercel, aucune modification de la base.
