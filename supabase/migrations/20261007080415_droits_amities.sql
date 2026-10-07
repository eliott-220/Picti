-- Faille des amitiés (partie A de supabase/propositions/2026-10-06-droits-amities-et-profils.sql).
-- Appliquée à la base le 07/10/2026 avec l'accord d'Eliott (version Supabase 20261007080415).
--
-- Avant : la policy « Accepter une demande reçue » ne vérifiait que addressee et status, et le
-- droit UPDATE portait sur toutes les colonnes de friendships : le destinataire d'une demande
-- pouvait réécrire `requester` et devenir « ami » de n'importe qui sans son accord.
-- Après : seul `status` se modifie, seulement sur une demande en attente reçue, seulement vers
-- 'accepted' ; anon n'écrit plus dans la table. Rien ne change pour l'app (elle ne fait que
-- `update({ status: 'accepted' })` sur une demande reçue).

revoke insert, update, delete on public.friendships from anon;
revoke update on public.friendships from authenticated;
grant update (status) on public.friendships to authenticated;

drop policy "Accepter une demande reçue" on public.friendships;
create policy "Accepter une demande reçue"
  on public.friendships for update to authenticated
  using ((select auth.uid()) = addressee and status = 'pending')
  with check ((select auth.uid()) = addressee and status = 'accepted');
