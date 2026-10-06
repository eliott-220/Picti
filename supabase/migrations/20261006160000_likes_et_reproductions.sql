-- Likes, capture = like, notifications, versions (reproductions) — 0.15.0.
-- Compatible avec la 0.14.0 en ligne : colonnes ajoutées avec des valeurs par défaut, rien de
-- supprimé ; photos_in_bounds garde ses paramètres (elle renvoie seulement trois colonnes de plus).

-- ---------------------------------------------------------------------------
-- Compteurs des photos, tenus par la base
-- ---------------------------------------------------------------------------

alter table public.photos
  add column likes_count integer not null default 0,
  -- Photo parente d'une version (reproduction) : celle que l'auteur a voulu reproduire, ou la
  -- photo de la même vue choisie par l'application. Supprimée → la version reste, sans parente.
  add column version_of uuid references public.photos (id) on delete set null,
  add column versions_count integer not null default 0,
  add constraint photos_version_of_self check (version_of is null or version_of <> id);

create index photos_version_of_idx on public.photos (version_of) where version_of is not null;

-- Les compteurs ne se modifient pas depuis l'application : une écriture directe les remet à leur
-- valeur (ils ne changent que par les déclencheurs ci-dessous, appelés en cascade).
create function private.protect_photo_counters()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if pg_trigger_depth() > 1 then
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.likes_count := 0;
    new.versions_count := 0;
  else
    new.likes_count := old.likes_count;
    new.versions_count := old.versions_count;
  end if;
  return new;
end;
$$;

create trigger photos_protect_counters
  before insert or update on public.photos
  for each row execute function private.protect_photo_counters();

-- ---------------------------------------------------------------------------
-- Likes
-- ---------------------------------------------------------------------------

create table public.photo_likes (
  photo_id uuid not null references public.photos (id) on delete cascade,
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  -- Like « sur place » : donné par une capture (déclencheur), jamais par l'application.
  on_site boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (photo_id, user_id)
);

create index photo_likes_user_idx on public.photo_likes (user_id);

alter table public.photo_likes enable row level security;

-- Je vois mes likes ; l'auteur d'une photo voit qui l'a likée.
create policy "Voir ses likes et ceux de ses photos"
  on public.photo_likes for select to authenticated
  using (
    user_id = (select auth.uid())
    or exists (select 1 from public.photos p where p.id = photo_id and p.owner = (select auth.uid()))
  );

-- Liker une photo que j'ai le droit de voir (la sous-requête applique les règles de public.photos),
-- pas la mienne ; le like « sur place » est réservé aux captures.
create policy "Liker une photo visible d'un autre"
  on public.photo_likes for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and not on_site
    and exists (select 1 from public.photos p where p.id = photo_id and p.owner <> (select auth.uid()))
  );

-- Retirer son like, sauf celui d'une capture tant qu'elle existe.
create policy "Retirer son like (pas celui d'une capture)"
  on public.photo_likes for delete to authenticated
  using (
    user_id = (select auth.uid())
    and not exists (
      select 1 from public.captures c where c.photo_id = photo_likes.photo_id and c.hunter = (select auth.uid())
    )
  );

revoke update on public.photo_likes from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Notifications (créées par la base seulement)
-- ---------------------------------------------------------------------------

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  recipient uuid not null references public.profiles (id) on delete cascade,
  actor uuid not null references public.profiles (id) on delete cascade,
  kind text not null check (kind in ('like', 'capture')),
  photo_id uuid not null references public.photos (id) on delete cascade,
  created_at timestamptz not null default now(),
  read_at timestamptz,
  check (recipient <> actor)
);

create index notifications_recipient_idx on public.notifications (recipient, created_at desc);

alter table public.notifications enable row level security;

create policy "Lire ses notifications"
  on public.notifications for select to authenticated
  using (recipient = (select auth.uid()));

create policy "Marquer ses notifications comme lues"
  on public.notifications for update to authenticated
  using (recipient = (select auth.uid())) with check (recipient = (select auth.uid()));

revoke insert, update, delete on public.notifications from anon, authenticated;
grant update (read_at) on public.notifications to authenticated;

-- Nouvelles notifications poussées à l'application (Realtime ; RLS appliquée).
alter publication supabase_realtime add table public.notifications;

-- Like à distance : compteur + notification « like » (une seule par personne et par photo tant
-- qu'elle n'est pas lue). Like retiré : compteur, et sa notification non lue disparaît.
create function private.on_photo_like()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner uuid;
begin
  if tg_op = 'INSERT' then
    update public.photos set likes_count = likes_count + 1 where id = new.photo_id returning owner into v_owner;
    if not new.on_site and v_owner is not null and v_owner <> new.user_id then
      delete from public.notifications
        where kind = 'like' and photo_id = new.photo_id and actor = new.user_id and read_at is null;
      insert into public.notifications (recipient, actor, kind, photo_id)
        values (v_owner, new.user_id, 'like', new.photo_id);
    end if;
    return new;
  end if;
  update public.photos set likes_count = greatest(likes_count - 1, 0) where id = old.photo_id;
  delete from public.notifications
    where kind = 'like' and photo_id = old.photo_id and actor = old.user_id and read_at is null;
  return old;
end;
$$;

create trigger photo_likes_count
  after insert or delete on public.photo_likes
  for each row execute function private.on_photo_like();

-- Capturer = liker : like « sur place » (ou le like à distance qui le devient, jamais deux) et
-- notification « capture » à l'auteur (pas de « like » en plus). Rien pour sa propre photo.
create function private.on_capture()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner uuid;
begin
  select owner into v_owner from public.photos where id = new.photo_id;
  if v_owner is null or v_owner = new.hunter then
    return new;
  end if;
  insert into public.photo_likes (photo_id, user_id, on_site)
    values (new.photo_id, new.hunter, true)
    on conflict (photo_id, user_id) do update set on_site = true;
  insert into public.notifications (recipient, actor, kind, photo_id)
    values (v_owner, new.hunter, 'capture', new.photo_id);
  return new;
end;
$$;

create trigger captures_like
  after insert on public.captures
  for each row execute function private.on_capture();

-- Captures déjà faites : leur like sur place (le déclencheur des likes tient le compteur ; un like
-- sur place ne crée pas de notification).
insert into public.photo_likes (photo_id, user_id, on_site, created_at)
select c.photo_id, c.hunter, true, c.captured_at
from public.captures c
join public.photos p on p.id = c.photo_id
where p.owner <> c.hunter
on conflict (photo_id, user_id) do update set on_site = true;

-- ---------------------------------------------------------------------------
-- Versions (reproductions)
-- ---------------------------------------------------------------------------

-- Une version doit être dans la même vue que sa parente (même lieu, cap à ±20°, inclinaison à
-- ±15° : `src/geo/views.ts`, avec 1 m et 1° de marge), sa parente doit être visible par son auteur
-- et ne pas être privée, et la version ne peut pas être plus visible qu'elle.
create function private.check_photo_version()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  parent public.photos;
  rank_of constant jsonb := '{"prive": 0, "amis": 1, "public": 2}';
  radius double precision;
  distance double precision;
begin
  if new.version_of is null then
    return new;
  end if;
  select * into parent from public.photos where id = new.version_of;
  if not found then
    raise exception 'Photo parente introuvable' using errcode = 'foreign_key_violation';
  end if;
  -- Rattachement (nouvelle photo ou parente changée) : parente visible, même vue.
  if tg_op = 'INSERT' or old.version_of is distinct from new.version_of then
    if not (parent.owner = new.owner or parent.visibility = 'public'
            or (parent.visibility = 'amis' and private.are_friends(parent.owner, new.owner))) then
      raise exception 'Photo parente non visible' using errcode = 'insufficient_privilege';
    end if;
    if parent.visibility = 'prive' then
      raise exception 'Une photo privée n''a pas de versions' using errcode = 'check_violation';
    end if;
    if new.mode is null or parent.mode is null then
      raise exception 'Une version et sa parente doivent être géocadrées' using errcode = 'check_violation';
    end if;
    radius := case
      when new.accuracy is null or parent.accuracy is null then 10
      else least(10, greatest(5, new.accuracy, parent.accuracy))
    end;
    distance := 2 * 6371008.8 * asin(sqrt(
      power(sin(radians(parent.lat - new.lat) / 2), 2)
      + cos(radians(new.lat)) * cos(radians(parent.lat)) * power(sin(radians(parent.lon - new.lon) / 2), 2)
    ));
    if distance > radius + 1
       or abs(mod((new.heading - parent.heading + 540)::numeric, 360) - 180) > 21
       or abs(new.pitch - parent.pitch) > 16 then
      raise exception 'Une version doit reprendre la même vue que sa parente' using errcode = 'check_violation';
    end if;
  end if;
  -- Jamais plus visible que la parente (tant qu'elle n'est pas devenue privée).
  if parent.visibility <> 'prive' and (rank_of ->> new.visibility)::int > (rank_of ->> parent.visibility)::int then
    raise exception 'Une version ne peut pas être plus visible que sa parente' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger photos_check_version
  before insert or update of version_of, visibility on public.photos
  for each row execute function private.check_photo_version();

-- Nombre de versions de chaque photo.
create function private.count_photo_versions()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op in ('UPDATE', 'DELETE') and old.version_of is not null
     and (tg_op = 'DELETE' or old.version_of is distinct from new.version_of) then
    update public.photos set versions_count = greatest(versions_count - 1, 0) where id = old.version_of;
  end if;
  if tg_op in ('INSERT', 'UPDATE') and new.version_of is not null
     and (tg_op = 'INSERT' or old.version_of is distinct from new.version_of) then
    update public.photos set versions_count = versions_count + 1 where id = new.version_of;
  end if;
  return null;
end;
$$;

create trigger photos_count_versions
  after insert or update of version_of or delete on public.photos
  for each row execute function private.count_photo_versions();

revoke execute on function private.protect_photo_counters(), private.on_photo_like(), private.on_capture(),
  private.check_photo_version(), private.count_photo_versions() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Notifications push (structure ; envoi pas encore branché)
-- ---------------------------------------------------------------------------

create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now()
);

alter table public.push_subscriptions enable row level security;

create policy "Gérer ses abonnements push"
  on public.push_subscriptions for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- Carte du monde : photos_in_bounds renvoie aussi likes, parente et précision (tête de pile,
-- même lieu). Mêmes paramètres qu'en 0.14.0 : l'application en ligne continue de fonctionner.
-- ---------------------------------------------------------------------------

drop function public.photos_in_bounds(double precision, double precision, double precision, double precision, integer, text);

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
  thumb_path text,
  likes_count integer,
  version_of uuid,
  accuracy real
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
  select p.id, p.owner, pr.name, p.lat, p.lon, p.heading, p.taken_at, p.created_at, p.thumb_path,
         p.likes_count, p.version_of, p.accuracy
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
