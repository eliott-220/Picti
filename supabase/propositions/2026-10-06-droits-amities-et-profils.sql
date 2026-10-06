-- PROPOSITION — NE PAS APPLIQUER SANS L'ACCORD D'ELIOTT (projet Supabase picti, fiybbfiyrnptnpwqkrji).
-- Rapport : claude/picti/2026-10-06-fiche-photo.md, « Sécurité ». Tout a été essayé sur la vraie base
-- le 06/10/2026 dans une transaction annulée (comptes d'essai créés puis effacés avec elle).
--
-- Trois étapes, chacune compatible avec ce qui est en ligne au moment où on l'applique :
--   A  — maintenant : le destinataire d'une demande d'ami ne peut plus que l'accepter.
--   B1 — maintenant : fonctions dédiées (mon profil, recherche par code ami) ; la 0.16.0 s'en sert
--        si elles existent, sinon elle lit la table comme avant.
--   B2 — APRÈS la mise en ligne de la 0.16.x (la 0.15.x lit encore friend_code et plan dans la
--        table) : les autres comptes ne lisent plus que id, name, city, created_at.

-- ---------------------------------------------------------------------------
-- A. Amitiés : faille corrigée
-- ---------------------------------------------------------------------------
-- Aujourd'hui, la policy « Accepter une demande reçue » ne vérifie que addressee et status, et le
-- droit UPDATE porte sur toutes les colonnes : le destinataire d'une demande peut réécrire
-- `requester` et devenir « ami » de n'importe qui sans son accord (il lui suffit d'un second
-- compte qui lui envoie une demande, et de l'identifiant de la cible, visible sur ses photos).
-- Vérifié : l'attaque passe aujourd'hui, elle est refusée après ce correctif ; l'acceptation
-- normale (seule mise à jour faite par l'app, `status` → 'accepted') marche toujours.

revoke insert, update, delete on public.friendships from anon;
revoke update on public.friendships from authenticated;
grant update (status) on public.friendships to authenticated;

drop policy "Accepter une demande reçue" on public.friendships;
create policy "Accepter une demande reçue"
  on public.friendships for update to authenticated
  using ((select auth.uid()) = addressee and status = 'pending')
  with check ((select auth.uid()) = addressee and status = 'accepted');

-- ---------------------------------------------------------------------------
-- B1. Fonctions dédiées (n'enlèvent rien)
-- ---------------------------------------------------------------------------

-- Mon profil complet (code ami, offre, visibilité par défaut) : seulement le mien.
create function public.my_profile()
returns table (
  id uuid,
  name text,
  city text,
  friend_code text,
  plan text,
  default_visibility text
)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, p.name, p.city, p.friend_code, p.plan, p.default_visibility
  from public.profiles p
  where p.id = (select auth.uid());
$$;

revoke execute on function public.my_profile() from public, anon;
grant execute on function public.my_profile() to authenticated;

-- Lien d'invitation / ajout par code : le compte de ce code (id, nom, ville), sans lister les codes.
create function public.find_profile_by_friend_code(p_code text)
returns table (
  id uuid,
  name text,
  city text
)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, p.name, p.city
  from public.profiles p
  where (select auth.uid()) is not null
    and p.friend_code = upper(trim(p_code));
$$;

revoke execute on function public.find_profile_by_friend_code(text) from public, anon;
grant execute on function public.find_profile_by_friend_code(text) to authenticated;

-- ---------------------------------------------------------------------------
-- B2. À appliquer seulement une fois la 0.16.x en ligne (casserait la 0.15.x)
-- ---------------------------------------------------------------------------
-- Les autres comptes ne lisent plus friend_code, plan ni default_visibility. Restent lisibles :
-- id, name, city, created_at — ce qu'utilisent les jointures (photos, amis, likes, notifications),
-- search_profiles, nearby_photos et photos_in_bounds (vérifié). Les fonctions security definer
-- (my_profile, public_profile, redeem_premium_code, déclencheurs) ne sont pas concernées.

-- revoke select on public.profiles from anon, authenticated;
-- grant select (id, name, city, created_at) on public.profiles to authenticated;
