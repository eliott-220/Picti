-- PICTI : réseau social de photos géocadrées.
-- Profils, amitiés, photos (visibilité publique / amis / privée), captures,
-- recherche par proximité et stockage des images.

-- ---------------------------------------------------------------------------
-- Profils
-- ---------------------------------------------------------------------------

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  name text not null default '' check (char_length(name) <= 60),
  city text not null default '' check (char_length(city) <= 80),
  -- Code court à partager pour être ajouté en ami.
  friend_code text not null unique
    default upper(substr(md5(gen_random_uuid()::text), 1, 6)),
  -- 'premium' débloquera le géocadrage en différé quand il deviendra payant.
  plan text not null default 'free' check (plan in ('free', 'premium')),
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "Profils lisibles par les utilisateurs connectés"
  on public.profiles for select to authenticated using (true);

create policy "Chacun modifie son profil"
  on public.profiles for update to authenticated
  using ((select auth.uid()) = id) with check ((select auth.uid()) = id);

-- Le plan ne se modifie pas depuis l'application (réservé au paiement).
revoke update on public.profiles from authenticated;
grant update (name, city) on public.profiles to authenticated;

-- Création automatique du profil à l'inscription.
create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, name, city)
  values (
    new.id,
    left(coalesce(new.raw_user_meta_data ->> 'name', ''), 60),
    left(coalesce(new.raw_user_meta_data ->> 'city', ''), 80)
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Amitiés
-- ---------------------------------------------------------------------------

create table public.friendships (
  requester uuid not null references public.profiles (id) on delete cascade,
  addressee uuid not null references public.profiles (id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted')),
  created_at timestamptz not null default now(),
  primary key (requester, addressee),
  check (requester <> addressee)
);

create index friendships_addressee_idx on public.friendships (addressee);

alter table public.friendships enable row level security;

create policy "Voir ses demandes et amitiés"
  on public.friendships for select to authenticated
  using ((select auth.uid()) in (requester, addressee));

create policy "Envoyer une demande d'ami"
  on public.friendships for insert to authenticated
  with check ((select auth.uid()) = requester and status = 'pending');

create policy "Accepter une demande reçue"
  on public.friendships for update to authenticated
  using ((select auth.uid()) = addressee)
  with check ((select auth.uid()) = addressee and status = 'accepted');

create policy "Retirer une amitié ou une demande"
  on public.friendships for delete to authenticated
  using ((select auth.uid()) in (requester, addressee));

create function public.are_friends(a uuid, b uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.friendships f
    where f.status = 'accepted'
      and ((f.requester = a and f.addressee = b) or (f.requester = b and f.addressee = a))
  );
$$;

-- ---------------------------------------------------------------------------
-- Photos géocadrées
-- ---------------------------------------------------------------------------

create table public.photos (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  title text not null default '' check (char_length(title) <= 120),
  taken_at timestamptz,
  created_at timestamptz not null default now(),
  width integer not null check (width > 0),
  height integer not null check (height > 0),
  focal35 real not null check (focal35 > 0),
  depth real not null default 6 check (depth > 0),
  -- 'direct' | 'differe-auto' | 'differe-manuel' ; null = pas encore géocadrée
  mode text check (mode in ('direct', 'differe-auto', 'differe-manuel')),
  lat double precision check (lat between -90 and 90),
  lon double precision check (lon between -180 and 180),
  alt double precision,
  accuracy real,
  heading real,
  pitch real,
  roll real,
  heading_source text check (heading_source in ('boussole', 'exif')),
  pitch_assumed boolean not null default false,
  -- Position approximative connue avant géocadrage (EXIF sans direction).
  hint_lat double precision,
  hint_lon double precision,
  visibility text not null default 'public' check (visibility in ('public', 'amis', 'prive')),
  image_path text not null,
  thumb_path text not null,
  -- Une photo géocadrée a une position et une orientation complètes.
  check (mode is null or (lat is not null and lon is not null and heading is not null
                          and pitch is not null and roll is not null))
);

create index photos_owner_idx on public.photos (owner, created_at desc);
create index photos_position_idx on public.photos (lat, lon) where mode is not null;
create index photos_image_path_idx on public.photos (image_path);
create index photos_thumb_path_idx on public.photos (thumb_path);

alter table public.photos enable row level security;

create policy "Voir les photos publiques, d'amis ou les siennes"
  on public.photos for select to authenticated
  using (
    owner = (select auth.uid())
    or visibility = 'public'
    or (visibility = 'amis' and public.are_friends(owner, (select auth.uid())))
  );

create policy "Publier ses photos"
  on public.photos for insert to authenticated
  with check (owner = (select auth.uid()));

create policy "Modifier ses photos"
  on public.photos for update to authenticated
  using (owner = (select auth.uid())) with check (owner = (select auth.uid()));

create policy "Supprimer ses photos"
  on public.photos for delete to authenticated
  using (owner = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- Captures (photos retrouvées in situ)
-- ---------------------------------------------------------------------------

create table public.captures (
  id uuid primary key default gen_random_uuid(),
  photo_id uuid not null references public.photos (id) on delete cascade,
  hunter uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  captured_at timestamptz not null default now(),
  score real not null default 0,
  unique (photo_id, hunter)
);

create index captures_hunter_idx on public.captures (hunter, captured_at desc);

alter table public.captures enable row level security;

-- Le chasseur voit ses captures ; l'auteur voit qui a capturé ses photos.
create policy "Voir ses captures et celles de ses photos"
  on public.captures for select to authenticated
  using (
    hunter = (select auth.uid())
    or exists (select 1 from public.photos p where p.id = photo_id and p.owner = (select auth.uid()))
  );

create policy "Capturer une photo visible"
  on public.captures for insert to authenticated
  with check (
    hunter = (select auth.uid())
    and exists (select 1 from public.photos p where p.id = photo_id and p.mode is not null)
  );

create policy "Supprimer ses captures"
  on public.captures for delete to authenticated
  using (hunter = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- Photos à proximité (les règles de visibilité s'appliquent : security invoker)
-- ---------------------------------------------------------------------------

create function public.nearby_photos(p_lat double precision, p_lon double precision, p_radius double precision default 500)
returns table (
  id uuid,
  owner uuid,
  owner_name text,
  distance double precision
)
language sql
stable
security invoker
set search_path = ''
as $$
  with box as (
    select
      p_radius / 111320.0 as dlat,
      p_radius / (111320.0 * greatest(cos(radians(p_lat)), 0.01)) as dlon
  )
  select p.id, p.owner, pr.name, d.distance
  from public.photos p
  cross join box
  join public.profiles pr on pr.id = p.owner
  cross join lateral (
    select 2 * 6371008.8 * asin(sqrt(
      power(sin(radians(p.lat - p_lat) / 2), 2)
      + cos(radians(p_lat)) * cos(radians(p.lat)) * power(sin(radians(p.lon - p_lon) / 2), 2)
    )) as distance
  ) d
  where p.mode is not null
    and p.lat between p_lat - box.dlat and p_lat + box.dlat
    and p.lon between p_lon - box.dlon and p_lon + box.dlon
    and d.distance <= p_radius
  order by d.distance
  limit 200;
$$;

-- ---------------------------------------------------------------------------
-- Stockage des images : bucket privé, un dossier par utilisateur
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('photos', 'photos', false, 15728640, array['image/jpeg', 'image/png', 'image/webp', 'image/heic'])
on conflict (id) do nothing;

create policy "Déposer ses images"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'photos' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "Supprimer ses images"
  on storage.objects for delete to authenticated
  using (bucket_id = 'photos' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- Une image est lisible si la photo correspondante l'est (règles de public.photos).
create policy "Voir les images des photos visibles"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'photos'
    and (
      (storage.foldername(name))[1] = (select auth.uid())::text
      or exists (
        select 1 from public.photos p
        where p.image_path = storage.objects.name or p.thumb_path = storage.objects.name
      )
    )
  );
