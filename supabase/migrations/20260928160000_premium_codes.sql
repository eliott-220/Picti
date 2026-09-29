-- Passage en Premium par code (seconde option de paiement, à côté du paiement en ligne).
-- Les codes ne sont stockés que hachés (bcrypt), dans le schéma privé (non exposé par l'API).
-- Ajouter / changer un code (depuis l'éditeur SQL de Supabase) :
--   insert into private.premium_codes (label, code_hash)
--   values ('administrateur', extensions.crypt('LE-CODE', extensions.gen_salt('bf')));
--   update private.premium_codes set active = false where label = 'ancien';

create extension if not exists pgcrypto with schema extensions;

create table private.premium_codes (
  id uuid primary key default gen_random_uuid(),
  label text not null,
  code_hash text not null,
  active boolean not null default true,
  uses integer not null default 0,
  created_at timestamptz not null default now()
);

create table private.premium_attempts (
  user_id uuid not null,
  attempted_at timestamptz not null default now()
);
create index premium_attempts_user_idx on private.premium_attempts (user_id, attempted_at);

revoke all on private.premium_codes, private.premium_attempts from public, anon, authenticated;

-- Renvoie 'premium' si le code est bon, 'invalide' sinon, 'trop-de-tentatives' au-delà de 5 essais par heure.
create function public.redeem_premium_code(p_code text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  recent integer;
  matched uuid;
begin
  if uid is null then
    raise exception 'Connexion requise';
  end if;
  select count(*) into recent
  from private.premium_attempts
  where user_id = uid and attempted_at > now() - interval '1 hour';
  if recent >= 5 then
    return 'trop-de-tentatives';
  end if;
  insert into private.premium_attempts (user_id) values (uid);

  select id into matched
  from private.premium_codes
  where active and code_hash = extensions.crypt(upper(trim(p_code)), code_hash)
  limit 1;
  if matched is null then
    return 'invalide';
  end if;

  update private.premium_codes set uses = uses + 1 where id = matched;
  update public.profiles set plan = 'premium' where id = uid;
  return 'premium';
end;
$$;

revoke execute on function public.redeem_premium_code(text) from public, anon;
grant execute on function public.redeem_premium_code(text) to authenticated;
