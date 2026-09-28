-- Les fonctions SECURITY DEFINER ne doivent pas être appelables via l'API.
create schema if not exists private;
grant usage on schema private to authenticated;

alter function public.are_friends(uuid, uuid) set schema private;
revoke execute on function private.are_friends(uuid, uuid) from public, anon;
grant execute on function private.are_friends(uuid, uuid) to authenticated;

revoke execute on function public.handle_new_user() from public, anon, authenticated;

drop policy "Voir les photos publiques, d'amis ou les siennes" on public.photos;
create policy "Voir les photos publiques, d'amis ou les siennes"
  on public.photos for select to authenticated
  using (
    owner = (select auth.uid())
    or visibility = 'public'
    or (visibility = 'amis' and private.are_friends(owner, (select auth.uid())))
  );
