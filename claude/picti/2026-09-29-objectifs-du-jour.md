# Objectifs du jour — 29 septembre 2026

Projet : [PICTI](../../CLAUDE.md) · Branche `claude/nice-cori-zbpf7v`
Voir aussi : [Point d'étape du 29/09](2026-09-29-point-etape.md)

## Où en est PICTI

- **En ligne (picti.vercel.app) : 0.009.1** — vérifié sur Vercel.
- **0.009.2 pas encore en ligne** : c'est le correctif du retour « j'ai bougé de 5 m et la
  photo m'a suivi ». Elle n'existe qu'en version de test sur Vercel, donc jamais essayée sur
  l'iPhone.
- **Dépôt désordonné** : `main` ne contient que le `.gitignore`, le code est réparti sur
  5 branches `claude/*`. La plus à jour a été reprise sur `claude/nice-cori-zbpf7v`.

## Objectifs (par ordre de priorité)

- [ ] **1. Mettre la 0.009.2 en ligne et la tester dehors avec l'iPhone**
  - [x] En ligne sur picti.vercel.app (29/09, `dpl_GTeorpPpLWapoMQyyV7tcW8sMFaB`, confirmée).
  - [x] Test terrain de 0.009.2 : **raté** — « la photo bouge beaucoup en suivant la caméra, et
    même à 20 m elle est trop grande ».
  - [x] Corrigé en 0.010.1 ([note](2026-09-29-photo-stable-et-lointaine.md)) : cap par le
    gyroscope, comptage des pas, position tenue à l'arrêt, photo réduite de loin.
  - [ ] Mise en ligne de 0.010.1 et nouveau test terrain.
  - Vérifier le numéro en bas du menu : doit afficher `0.009.2`.
  - Face à une photo, reculer de 5 à 10 m : elle doit **rétrécir et rester à sa place**.
  - La distance à la photo s'affiche dans le viseur (« · à 5 m »), « · marche » sur la
    pastille GPS quand les pas sont détectés.
  - Tester dehors (en intérieur, le GPS ne voit pas 5 m).
- [ ] **2. Rassembler tout le travail dans `main`** (pull request), pour que chaque nouvelle
  session reparte du bon code.
  - [x] Branches comparées : tout est déjà dans `claude/nice-cori-zbpf7v`, sauf la note
    « mises à jour écran d'accueil » (récupérée ; la fonction avait été refaite ailleurs).
  - [x] Tests (92), lint, build : OK.
  - [x] Pull request vers `main` fusionnée (eliott-220/Picti#1).
- [ ] **3. Ajouter « mot de passe oublié »** — codé (0.010.0), reste à tester avec un vrai e-mail ; — indispensable avant de faire tester l'appli à
  de vraies personnes.
- [ ] **4. Brancher le paiement Premium (Stripe)** — aujourd'hui, Premium ne s'obtient
  qu'avec un code administrateur.

## Plus tard

- Notifications quand on passe près d'une photo.
- Réglage de l'objectif (calibration de la focale).
- Application iPhone native (ARKit) si le GPS reste trop imprécis, surtout en intérieur.

## Plan conseillé

Matin : **1** puis **2**. Après-midi : **3** si le test terrain est concluant.

## Notes du test terrain

- 0.009.2 : la photo bouge beaucoup en suivant la caméra ; à 20 m, elle est encore trop grande.
- 0.010.1 : _(à remplir : balayer, rester immobile 30 s, reculer de 20 m)_
