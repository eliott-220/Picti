# Faille des amitiés corrigée en base (correctif A) — 7 octobre 2026

Projet : [PICTI](../../CLAUDE.md) · Suite de [Fiche d'une photo (0.16.0)](2026-10-06-fiche-photo.md), section « Sécurité »

## Demande d'Eliott

Appliquer la partie A du correctif proposé le 06/10
(`supabase/propositions/2026-10-06-droits-amities-et-profils.sql`), puis l'ajouter au dépôt.

## Ce qui a été fait

- Base Supabase `picti` : migration `droits_amities` appliquée (version `20261007080415`), SQL
  identique à la partie A : `revoke insert, update, delete … from anon` ; `revoke update … from
  authenticated` puis `grant update (status)` ; policy « Accepter une demande reçue » recréée avec
  `using (addressee = moi and status = 'pending')` et `with check (addressee = moi and status = 'accepted')`.
- Dépôt : `supabase/migrations/20261007080415_droits_amities.sql` ; la partie A est retirée du
  fichier de propositions (B1 et B2 y restent, **non appliquées**).
- Aucun changement de l'app (elle ne fait que `update({ status: 'accepted' })` sur une demande
  reçue) ; pas de nouveau numéro de version.

## Vérifications (sur la vraie base, transaction annulée, 3 comptes d'essai effacés avec elle)

1. B envoie une demande à A : OK.
2. Attaque — A réécrit `requester` pour devenir ami de C : **refusée** (« permission denied for table friendships »).
3. B tente d'accepter sa propre demande : 0 ligne.
4. A accepte la demande de B : 1 ligne.
5. Aucune amitié A–C.
6. A retire B : 1 ligne.
7. `anon` tente d'insérer : refusé.

Droits finaux sur `friendships` : `authenticated` = SELECT, INSERT, DELETE + UPDATE (`status`
seulement) ; `anon` = plus d'écriture. Aucun compte d'essai resté en base (contrôlé après).

## Reste

- B1 (`my_profile()`, `find_profile_by_friend_code()`) et la migration `public_profile` : accord
  d'Eliott donné, pas encore appliqués.
- B2 : quand plus personne n'a la 0.15.x.
