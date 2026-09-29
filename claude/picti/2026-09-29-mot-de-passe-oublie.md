# 2026-09-29 — Mot de passe oublié (0.010.0)

Projet : [PICTI](../../CLAUDE.md) · Dépôt `eliott-220/picti` · Branche `claude/nice-cori-zbpf7v`
(objectif 3 des [objectifs du jour](2026-09-29-objectifs-du-jour.md))

## Demande

Ajouter « mot de passe oublié », indispensable avant de faire tester l'app à de vraies personnes.

## Réalisé

- Écran de connexion (`src/screens/Auth.tsx`) : lien **« Mot de passe oublié ? »** → on saisit
  son e-mail → « Recevoir le lien » (`supabase.auth.resetPasswordForEmail`, retour vers
  l'adresse de l'app). Même message que le compte existe ou non (on ne révèle pas qui est
  inscrit). « Retour à la connexion ».
- Arrivée par le lien de l'e-mail : nouvel écran **« Nouveau mot de passe »**
  (`src/screens/NewPassword.tsx`) : deux champs, vérification qu'ils sont identiques,
  `supabase.auth.updateUser`, puis entrée dans l'app. « Annuler » déconnecte.
- Repérage fiable du lien (`src/data/supabase.ts`) : `type=recovery` lu dans l'adresse
  **avant** que Supabase ne l'efface, plus l'événement `PASSWORD_RECOVERY`
  (`usePasswordRecovery`, `src/data/auth.ts`).
- Lien expiré ou déjà utilisé : l'app revient sur la demande d'un nouveau lien avec
  « Ce lien a expiré ou a déjà servi : demandez-en un nouveau. »
- Version **0.010.0**.

## Vérifications

- `npm test` (92 verts), `npm run lint`, `npm run build` : OK.
- Chromium (serveur Supabase simulé) : demande du lien (requête envoyée, message affiché,
  champ mot de passe masqué) ; arrivée par un lien `type=recovery` → écran « Nouveau mot de
  passe », mots de passe différents refusés, envoi du nouveau mot de passe puis entrée dans
  l'app, pas redemandé après rechargement ; lien expiré → message et bouton « Recevoir le lien ».

## À vérifier (pas faisable depuis la session)

- **Test réel avec un vrai e-mail** : demander le lien, l'ouvrir sur l'iPhone.
- Tableau de bord Supabase › Authentication :
  - *URL Configuration* : `https://picti.vercel.app` dans les adresses de redirection
    autorisées (sinon le lien renvoie vers l'adresse par défaut du projet).
  - *Email Templates › Reset Password* : texte en français.
  - *SMTP* : l'envoi intégré de Supabase est limité (quelques e-mails par heure) ; pour de
    vrais testeurs, brancher un service d'envoi (Resend, Brevo…).
- Si le lien est ouvert dans une autre app que celle où PICTI est installée (ex. e-mail ouvert
  sur l'ordinateur), le nouveau mot de passe s'enregistre quand même ; il suffit ensuite de se
  connecter sur le téléphone.
