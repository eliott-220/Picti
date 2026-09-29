-- Carte du monde : photos géocadrées visibles dans une zone (règles RLS appliquées),
-- de la plus récente à la plus ancienne. Gère les zones à cheval sur l'antiméridien.
create function public.photos_in_bounds(
  p_south double precision,
  p_west double precision,
  p_north double precision,
  p_east double precision,
  p_limit integer default 2000
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
language sql
stable
security invoker
set search_path = ''
as $$
  select p.id, p.owner, pr.name, p.lat, p.lon, p.heading, p.taken_at, p.created_at, p.thumb_path
  from public.photos p
  join public.profiles pr on pr.id = p.owner
  where p.mode is not null
    and p.lat between p_south and p_north
    and case
      when p_west <= p_east then p.lon between p_west and p_east
      else p.lon >= p_west or p.lon <= p_east
    end
  order by coalesce(p.taken_at, p.created_at) desc
  limit least(greatest(p_limit, 1), 5000);
$$;

revoke execute on function public.photos_in_bounds(double precision, double precision, double precision, double precision, integer) from public, anon;
grant execute on function public.photos_in_bounds(double precision, double precision, double precision, double precision, integer) to authenticated;
