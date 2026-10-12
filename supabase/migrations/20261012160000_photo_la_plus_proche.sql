-- Photo la plus proche (0.22.0, tutoriel du premier lancement) : à la fin du tutoriel, AVANT la
-- création du compte, « La photo la plus proche est à 240 m au nord-est ». Nouvelle fonction
-- seulement : rien n'est retiré ni modifié, les versions en ligne ne sont pas concernées.
-- L'application (0.22.0) sait s'en passer tant qu'elle n'est pas en place (« Crée ton compte
-- pour voir les photos autour de toi »).
--
-- Appelable SANS compte (anon), d'où security definer. Elle ne renvoie que :
--   - la distance, arrondie à 10 m ;
--   - la direction, arrondie au huitième de tour (nord, nord-est…) ;
-- de la photo PUBLIQUE géocadrée la plus proche, à moins de 5 km. Jamais l'auteur, la position
-- exacte, l'original ni le chemin des images (il commence par l'identifiant de l'auteur).
--
-- Connecté (tutoriel revu depuis le menu) : aussi l'identifiant de la photo et le chemin de sa
-- vignette, pour « Y aller » — rien de plus que ce que montre déjà la carte à tout compte —, en
-- écartant ses propres photos et celles qu'on a déjà capturées.

create function public.nearest_public_photo(p_lat double precision, p_lng double precision)
returns table (
  distance_m integer,
  bearing_deg integer,
  photo_id uuid,
  thumb_path text
)
language sql
stable
security definer
set search_path = ''
as $$
  with me as (
    select (select auth.uid()) as uid
  ),
  box as (
    select
      5000 / 111320.0 as dlat,
      5000 / (111320.0 * greatest(cos(radians(p_lat)), 0.01)) as dlon
  )
  select
    (round(d.distance / 10) * 10)::integer,
    mod(mod((round(d.bearing / 45) * 45)::integer, 360) + 360, 360),
    case when me.uid is not null then p.id end,
    case when me.uid is not null then p.thumb_path end
  from public.photos p
  cross join me
  cross join box
  cross join lateral (
    select
      2 * 6371008.8 * asin(sqrt(
        power(sin(radians(p.lat - p_lat) / 2), 2)
        + cos(radians(p_lat)) * cos(radians(p.lat)) * power(sin(radians(p.lon - p_lng) / 2), 2)
      )) as distance,
      degrees(atan2(
        sin(radians(p.lon - p_lng)) * cos(radians(p.lat)),
        cos(radians(p_lat)) * sin(radians(p.lat)) - sin(radians(p_lat)) * cos(radians(p.lat)) * cos(radians(p.lon - p_lng))
      )) as bearing
  ) d
  where p_lat between -90 and 90
    and p_lng between -180 and 180
    and p.mode is not null
    and p.visibility = 'public'
    and p.lat between p_lat - box.dlat and p_lat + box.dlat
    and p.lon between p_lng - box.dlon and p_lng + box.dlon
    and d.distance <= 5000
    and (
      me.uid is null
      or (
        p.owner <> me.uid
        and not exists (select 1 from public.captures c where c.photo_id = p.id and c.hunter = me.uid)
      )
    )
  order by d.distance
  limit 1;
$$;

revoke execute on function public.nearest_public_photo(double precision, double precision) from public;
grant execute on function public.nearest_public_photo(double precision, double precision) to anon, authenticated;
