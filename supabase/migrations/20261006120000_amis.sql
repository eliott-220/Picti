-- Amis et vie privée (0.14.0) : visibilité « amis » par défaut (réglable dans le profil),
-- recherche d'amis par nom, carte du monde filtrable « Monde / Amis ».
-- Compatible avec l'application déjà en ligne : rien n'est retiré de ce qu'elle appelle.

-- ---------------------------------------------------------------------------
-- Visibilité par défaut des nouvelles photos
-- ---------------------------------------------------------------------------

alter table public.profiles
  add column default_visibility text not null default 'amis'
    check (default_visibility in ('public', 'amis', 'prive'));

-- Modifiable par son propriétaire (policy « Chacun modifie son profil ») : seules ces colonnes
-- sont accordées, le plan reste hors de portée.
grant update (default_visibility) on public.profiles to authenticated;
-- Les visiteurs non connectés n'ont aucune policy de modification (RLS) : on leur retire aussi
-- le droit, par précaution.
revoke update on public.profiles from anon;

-- Photo enregistrée sans visibilité : réservée aux amis. Les photos déjà publiées gardent la leur.
alter table public.photos alter column visibility set default 'amis';

-- ---------------------------------------------------------------------------
-- Recherche d'amis par nom (connectés seulement ; règles RLS appliquées : security invoker)
-- ---------------------------------------------------------------------------

create function public.search_profiles(p_query text)
returns table (
  id uuid,
  name text,
  city text
)
language sql
stable
security invoker
set search_path = ''
as $$
  -- « % » et « _ » saisis sont cherchés tels quels.
  with q as (
    select replace(replace(replace(trim(p_query), '\', '\\'), '%', '\%'), '_', '\_') as pattern
  )
  select pr.id, pr.name, pr.city
  from public.profiles pr
  cross join q
  where (select auth.uid()) is not null
    and char_length(trim(p_query)) >= 3
    and pr.name ilike '%' || q.pattern || '%'
    and pr.id <> (select auth.uid())
    -- Déjà amis : inutile de les proposer.
    and not exists (
      select 1 from public.friendships f
      where f.status = 'accepted'
        and ((f.requester = pr.id and f.addressee = (select auth.uid()))
          or (f.requester = (select auth.uid()) and f.addressee = pr.id))
    )
  order by pr.name, pr.city
  limit 20;
$$;

revoke execute on function public.search_profiles(text) from public, anon;
grant execute on function public.search_profiles(text) to authenticated;

-- ---------------------------------------------------------------------------
-- Carte du monde : filtre « monde » (toutes les photos que j'ai le droit de voir) ou
-- « amis » (les miennes et celles de mes amis acceptés). Les règles RLS de public.photos
-- s'appliquent dans les deux cas (security invoker) : le filtre ne fait que restreindre.
-- ---------------------------------------------------------------------------

drop function public.photos_in_bounds(double precision, double precision, double precision, double precision, integer);

create function public.photos_in_bounds(
  p_south double precision,
  p_west double precision,
  p_north double precision,
  p_east double precision,
  p_limit integer default 2000,
  p_scope text default 'monde'
)
returns table (
  id uuid,
  owner uuid,
  owner_name text,
  lat double precision,
  lon double precision,
  heading real,
  taken_at timestamptz,
  created_at timestamptz,
  thumb_path text
)
language plpgsql
stable
security invoker
set search_path = ''
as $$
#variable_conflict use_column
begin
  if p_scope is null or p_scope not in ('monde', 'amis') then
    raise exception 'Filtre de carte inconnu : %', p_scope using errcode = 'invalid_parameter_value';
  end if;
  return query
  select p.id, p.owner, pr.name, p.lat, p.lon, p.heading, p.taken_at, p.created_at, p.thumb_path
  from public.photos p
  join public.profiles pr on pr.id = p.owner
  where p.mode is not null
    and p.lat between p_south and p_north
    and case
      when p_west <= p_east then p.lon between p_west and p_east
      else p.lon >= p_west or p.lon <= p_east
    end
    and (
      p_scope = 'monde'
      or p.owner = (select auth.uid())
      or private.are_friends(p.owner, (select auth.uid()))
    )
  order by coalesce(p.taken_at, p.created_at) desc
  limit least(greatest(p_limit, 1), 5000);
end;
$$;

revoke execute on function public.photos_in_bounds(double precision, double precision, double precision, double precision, integer, text) from public, anon;
grant execute on function public.photos_in_bounds(double precision, double precision, double precision, double precision, integer, text) to authenticated;
