-- PICTI 0.23.0 : retirer une capture (fiche › « ⋯ » › « Retirer de mes captures », appui long dans
-- Mon profil › Mes captures et Mes chasses).
--
-- Le droit existe déjà (migration 20260928120000_init_picti.sql) : policy « Supprimer ses captures »
-- (delete, `hunter = auth.uid()`) — l'app supprime sa ligne de `captures` sans cette migration.
-- Ce qui manque : la notification « capture » envoyée à l'auteur, que le chasseur ne peut pas effacer
-- (delete révoqué sur `notifications`, 20261006160000), et le like « sur place » créé par la capture,
-- qui resterait « sur place » sans capture. Ce déclencheur les remet d'accord.
--
-- PAS APPLIQUÉE : vérifiée sur la vraie base dans une transaction annulée le 12/10/2026 ; à appliquer
-- seulement avec l'accord d'Eliott.

create function private.on_capture_deleted()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- La notification « capture » de cette capture (lue ou non) disparaît.
  delete from public.notifications
    where kind = 'capture' and photo_id = old.photo_id and actor = old.hunter;
  -- Le like de la capture reste, mais devient un like ordinaire (il se retire comme les autres).
  update public.photo_likes set on_site = false
    where photo_id = old.photo_id and user_id = old.hunter and on_site;
  return old;
end;
$$;

create trigger captures_unlike
  after delete on public.captures
  for each row execute function private.on_capture_deleted();

revoke execute on function private.on_capture_deleted() from public, anon, authenticated;
