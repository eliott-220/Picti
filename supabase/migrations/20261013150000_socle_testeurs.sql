-- PICTI 0.24.0 (partie 2) : socle avant d'ouvrir l'app à des inconnus (TestFlight externe, App Store) —
-- signaler, bloquer, masquer une photo signalée trois fois, accepter les conditions d'utilisation, et ce
-- qu'il faut pour supprimer son compte (Edge Function `delete-account`).
--
-- PAS APPLIQUÉE : à appliquer avec l'accord d'Eliott, APRÈS 20261012160000_photo_la_plus_proche et
-- 20261012220000_retirer_une_capture (elle remplace `nearest_public_photo`). Compatible avec la 0.19.0 en
-- ligne : elle ajoute des tables, des colonnes et des règles restrictives (qui ne font que retirer des lignes :
-- blocages, photos signalées ou masquées), sans toucher aux droits ni aux fonctions dont la 0.19.0 se sert.
-- Vérifiée sur la vraie base dans une transaction annulée (voir la note de session du 13/10/2026).

-- ---------------------------------------------------------------------------------------------------------
-- Conditions d'utilisation : date et version acceptées (écrites par le serveur seulement).
alter table public.profiles
  add column terms_accepted_at timestamptz,
  add column terms_version text;
-- Le droit de mise à jour de `profiles` est accordé colonne par colonne (name, city, default_visibility) :
-- les deux nouvelles colonnes ne sont pas modifiables depuis l'app.

-- Inscription : la case cochée est notée par le serveur, à l'heure du serveur (jamais une date du client).
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  accepted boolean := new.raw_user_meta_data ->> 'terms_accepted' = 'true'
    and new.raw_user_meta_data ->> 'terms_version' = '2026-10-13';
begin
  insert into public.profiles (id, name, city, terms_accepted_at, terms_version)
  values (
    new.id,
    left(coalesce(new.raw_user_meta_data ->> 'name', ''), 60),
    left(coalesce(new.raw_user_meta_data ->> 'city', ''), 80),
    case when accepted then now() end,
    case when accepted then '2026-10-13' end
  );
  return new;
end;
$$;

-- Comptes existants : la feuille s'affiche une fois, l'acceptation passe par cette fonction.
create function public.accept_terms(p_version text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or p_version is distinct from '2026-10-13' then
    raise exception 'Version des conditions inconnue';
  end if;
  update public.profiles set terms_accepted_at = now(), terms_version = p_version where id = auth.uid();
end;
$$;
revoke all on function public.accept_terms(text) from public, anon;
grant execute on function public.accept_terms(text) to authenticated;

-- ---------------------------------------------------------------------------------------------------------
-- Bloquer : dans les deux sens, appliqué par la base (règles restrictives), pas seulement par l'app.
create table public.blocks (
  blocker uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  blocked uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker, blocked),
  check (blocker <> blocked)
);
create index blocks_reverse_idx on public.blocks (blocked, blocker);
alter table public.blocks enable row level security;
revoke all on public.blocks from anon, authenticated;
grant select, insert, delete on public.blocks to authenticated;
-- On ne voit que ses propres blocages : la personne bloquée n'en sait rien.
create policy "Voir ses blocages" on public.blocks for select to authenticated using (blocker = (select auth.uid()));
create policy "Bloquer quelqu'un" on public.blocks for insert to authenticated with check (blocker = (select auth.uid()));
create policy "Débloquer" on public.blocks for delete to authenticated using (blocker = (select auth.uid()));

create function private.blocked_pair(a uuid, b uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.blocks where (blocker = a and blocked = b) or (blocker = b and blocked = a)
  );
$$;
revoke all on function private.blocked_pair(uuid, uuid) from public, anon;
grant execute on function private.blocked_pair(uuid, uuid) to authenticated;

-- Bloquer retire l'amitié (débloquer ne la rétablit pas) et les notifications de l'un vers l'autre.
create function private.after_block()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.friendships
    where (requester = new.blocker and addressee = new.blocked) or (requester = new.blocked and addressee = new.blocker);
  delete from public.notifications
    where (recipient = new.blocker and actor = new.blocked) or (recipient = new.blocked and actor = new.blocker);
  return new;
end;
$$;
create trigger blocks_cleanup after insert on public.blocks for each row execute function private.after_block();

-- Plus de notification entre deux comptes bloqués (elles sont créées par des déclencheurs du serveur).
create function private.filter_blocked_notification()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if private.blocked_pair(new.recipient, new.actor) then
    return null;
  end if;
  return new;
end;
$$;
create trigger notifications_blocked before insert on public.notifications
  for each row execute function private.filter_blocked_notification();

-- ---------------------------------------------------------------------------------------------------------
-- Signaler une photo ou un utilisateur.
create table public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  photo_id uuid references public.photos (id) on delete cascade,
  user_id uuid references public.profiles (id) on delete cascade,
  reason text not null check (reason in ('sexual', 'violence', 'harassment', 'privacy', 'spam', 'other')),
  details text not null default '' check (char_length(details) <= 300),
  created_at timestamptz not null default now(),
  status text not null default 'ouvert' check (status in ('ouvert', 'traité')),
  check ((photo_id is null) <> (user_id is null)),
  unique (reporter, photo_id),
  unique (reporter, user_id)
);
create index reports_photo_idx on public.reports (photo_id, status) where photo_id is not null;
alter table public.reports enable row level security;
revoke all on public.reports from anon, authenticated;
-- Créer ses signalements et ne lire que les siens ; ni modification ni suppression depuis l'app.
grant select on public.reports to authenticated;
grant insert (photo_id, user_id, reason, details) on public.reports to authenticated;
create policy "Lire ses signalements" on public.reports for select to authenticated using (reporter = (select auth.uid()));
create policy "Signaler une photo ou un utilisateur" on public.reports for insert to authenticated with check (
  reporter = (select auth.uid())
  and (
    (photo_id is not null and exists (select 1 from public.photos p where p.id = photo_id and p.owner <> (select auth.uid())))
    or (user_id is not null and user_id <> (select auth.uid()) and exists (select 1 from public.profiles p where p.id = user_id))
  )
);

-- Photo masquée pour tout le monde (sauf son auteur) en attendant une décision : 3 signalements ouverts de
-- comptes différents. La ligne de la photo est verrouillée : deux signalements simultanés ne ratent pas le seuil.
alter table public.photos add column hidden_at timestamptz;

create function private.moderate_report()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.photo_id is not null then
    perform 1 from public.photos where id = new.photo_id for update;
    if (select count(distinct reporter) from public.reports where photo_id = new.photo_id and status = 'ouvert') >= 3 then
      update public.photos set hidden_at = coalesce(hidden_at, now()) where id = new.photo_id;
    end if;
  end if;
  return new;
end;
$$;
create trigger reports_moderation after insert on public.reports for each row execute function private.moderate_report();

-- `hidden_at` ne s'écrit que par le serveur : la table `photos` garde son droit de mise à jour (la 0.19.0
-- en ligne s'en sert), ce déclencheur refuse seulement de toucher à cette colonne depuis l'app.
create function private.protect_moderation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user in ('authenticated', 'anon') then
    if tg_op = 'INSERT' then
      new.hidden_at := null;
    elsif new.hidden_at is distinct from old.hidden_at then
      raise exception 'La modération est réservée au serveur';
    end if;
  end if;
  return new;
end;
$$;
create trigger photos_protect_moderation before insert or update on public.photos
  for each row execute function private.protect_moderation();

-- Une photo que j'ai signalée disparaît pour moi aussitôt (viseur, carte, piles, recherche).
create function private.reported_by_me(p_photo uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.reports where reporter = (select auth.uid()) and photo_id = p_photo);
$$;
revoke all on function private.reported_by_me(uuid) from public, anon;
grant execute on function private.reported_by_me(uuid) to authenticated;

revoke all on function private.after_block(), private.filter_blocked_notification(), private.moderate_report(),
  private.protect_moderation() from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------------------------
-- Règles restrictives : elles s'ajoutent aux règles existantes et ne font que retirer des lignes. Les
-- fonctions de lecture de l'app (`nearby_photos`, `photos_in_bounds`, `search_profiles`) s'exécutent avec les
-- droits de l'utilisateur : elles en profitent sans changement.
create policy "Photos masquées, signalées ou bloquées" on public.photos as restrictive for select to authenticated
  using (
    owner = (select auth.uid())
    or (hidden_at is null and not private.blocked_pair(owner, (select auth.uid())) and not private.reported_by_me(id))
  );
create policy "Profils bloqués" on public.profiles as restrictive for select to authenticated
  using (not private.blocked_pair(id, (select auth.uid())));
create policy "Amitiés impossibles entre bloqués" on public.friendships as restrictive for all to authenticated
  using (not private.blocked_pair(requester, addressee))
  with check (not private.blocked_pair(requester, addressee));
create policy "Notifications entre bloqués" on public.notifications as restrictive for all to authenticated
  using (not private.blocked_pair(recipient, actor))
  with check (not private.blocked_pair(recipient, actor));
create policy "Captures des photos visibles" on public.captures as restrictive for select to authenticated
  using (
    hunter = (select auth.uid())
    or (exists (select 1 from public.photos p where p.id = photo_id) and not private.blocked_pair(hunter, (select auth.uid())))
  );
create policy "Likes des photos visibles" on public.photo_likes as restrictive for select to authenticated
  using (
    user_id = (select auth.uid())
    or (exists (select 1 from public.photos p where p.id = photo_id) and not private.blocked_pair(user_id, (select auth.uid())))
  );

-- Fonctions en droits du propriétaire (qui ignorent les règles) : elles filtrent elles-mêmes.
create or replace function public.nearest_public_photo(p_lat double precision, p_lng double precision)
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
    and p.hidden_at is null
    and p.lat between p_lat - box.dlat and p_lat + box.dlat
    and p.lon between p_lng - box.dlon and p_lng + box.dlon
    and d.distance <= 5000
    and (
      me.uid is null
      or (
        p.owner <> me.uid
        and not exists (select 1 from public.captures c where c.photo_id = p.id and c.hunter = me.uid)
        and not private.blocked_pair(p.owner, me.uid)
        and not exists (select 1 from public.reports r where r.photo_id = p.id and r.reporter = me.uid)
      )
    )
  order by d.distance
  limit 1;
$$;

-- `public_profile` (migration 20261006200000, pas encore appliquée le 13/10/2026) : si elle est en place,
-- elle ne montre plus un compte bloqué (même définition, plus le filtre du blocage).
do $do$
begin
  if to_regprocedure('public.public_profile(uuid)') is not null then
    execute $f$
      create or replace function public.public_profile(p_id uuid)
      returns table (id uuid, name text, city text, created_at timestamptz, friendship text)
      language sql
      stable
      security definer
      set search_path = ''
      as $$
        select
          pr.id, pr.name, pr.city, pr.created_at,
          case
            when f.status is null then 'none'
            when f.status = 'accepted' then 'friends'
            when f.addressee = (select auth.uid()) then 'incoming'
            else 'outgoing'
          end
        from public.profiles pr
        left join lateral (
          select fr.status, fr.addressee
          from public.friendships fr
          where (fr.requester = pr.id and fr.addressee = (select auth.uid()))
             or (fr.requester = (select auth.uid()) and fr.addressee = pr.id)
          order by (fr.status = 'accepted') desc, (fr.addressee = (select auth.uid())) desc
          limit 1
        ) f on true
        where (select auth.uid()) is not null
          and pr.id = p_id
          and not private.blocked_pair(pr.id, (select auth.uid()));
      $$
    $f$;
  end if;
end;
$do$;

-- Mes utilisateurs bloqués, avec leur nom (que la règle « Profils bloqués » ne laisse plus lire).
create function public.my_blocked_users()
returns table (id uuid, name text, blocked_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, p.name, b.created_at
  from public.blocks b join public.profiles p on p.id = b.blocked
  where b.blocker = (select auth.uid())
  order by b.created_at desc;
$$;
revoke all on function public.my_blocked_users() from public, anon;
grant execute on function public.my_blocked_users() to authenticated;

-- ---------------------------------------------------------------------------------------------------------
-- Originale supprimée (photo supprimée, ou compte supprimé) : ses reproductions par d'autres restent à eux,
-- mais la base efface leur lien (`version_of`, on delete set null). On note qu'elles en avaient un : l'app
-- affiche « D'après une photo supprimée ».
alter table public.photos add column parent_deleted boolean not null default false;

create function private.mark_versions_orphaned()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.photos set parent_deleted = true where version_of = old.id;
  return old;
end;
$$;
create trigger photos_orphan_versions before delete on public.photos
  for each row execute function private.mark_versions_orphaned();
revoke all on function private.mark_versions_orphaned() from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------------------------
-- Administration (SQL seulement, jamais lisible depuis l'app) : les signalements à traiter.
create view public.reports_ouverts with (security_invoker = true) as
  select r.*, p.owner as photo_owner, p.hidden_at as photo_hidden_at
  from public.reports r left join public.photos p on p.id = r.photo_id
  where r.status = 'ouvert';
revoke all on public.reports_ouverts from public, anon, authenticated;
grant select on public.reports_ouverts to service_role;

-- Suppression d'un compte : les fichiers du stockage ne sont pas liés à la base. L'Edge Function efface
-- d'abord le compte (tout ou rien, en une transaction), puis les fichiers ; un fichier qui n'a pas pu l'être
-- est noté ici et réessayé à l'appel suivant. Aucune règle : lisible et modifiable par le serveur seulement.
create table public.storage_cleanup (
  path text primary key,
  created_at timestamptz not null default now(),
  attempts integer not null default 0
);
alter table public.storage_cleanup enable row level security;
revoke all on public.storage_cleanup from anon, authenticated;
