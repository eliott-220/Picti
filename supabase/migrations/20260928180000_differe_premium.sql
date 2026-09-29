-- Le géocadrage en différé (photo importée lue depuis l'EXIF, ou recalée sur place) est
-- réservé à PICTI Premium : la base refuse de faire passer une photo en mode différé pour
-- un compte gratuit. Les photos déjà en différé restent modifiables (titre, visibilité…).
create function private.enforce_differe_premium()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.mode in ('differe-auto', 'differe-manuel')
     and (tg_op = 'INSERT' or old.mode is distinct from new.mode)
     and not exists (select 1 from public.profiles p where p.id = new.owner and p.plan = 'premium')
  then
    raise exception 'Le géocadrage en différé est réservé à PICTI Premium'
      using errcode = 'insufficient_privilege';
  end if;
  return new;
end;
$$;

revoke execute on function private.enforce_differe_premium() from public, anon, authenticated;

create trigger photos_differe_premium
  before insert or update of mode on public.photos
  for each row execute function private.enforce_differe_premium();
