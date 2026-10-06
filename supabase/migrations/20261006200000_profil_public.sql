-- Profil public (0.16.0) : ce que l'on peut voir d'un autre utilisateur, depuis la fiche d'une
-- photo (#/personne/<id>). Nouvelle fonction seulement : rien n'est retiré ni modifié, la 0.15.x
-- en ligne n'est pas concernée. L'application (0.16.0) sait s'en passer tant qu'elle n'est pas en
-- place (mêmes champs lus dans `profiles`).
--
-- Renvoie UNIQUEMENT : id, nom, ville, date d'inscription et l'amitié avec moi
-- ('none' | 'outgoing' | 'incoming' | 'friends'). Jamais le code ami, l'offre (plan) ni l'e-mail.
-- Les photos du profil sont lues par une requête normale sur `photos` (owner = p_id) : la RLS ne
-- montre que celles que j'ai le droit de voir.

create function public.public_profile(p_id uuid)
returns table (
  id uuid,
  name text,
  city text,
  created_at timestamptz,
  friendship text
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    pr.id,
    pr.name,
    pr.city,
    pr.created_at,
    case
      when f.status is null then 'none'
      when f.status = 'accepted' then 'friends'
      when f.addressee = (select auth.uid()) then 'incoming'
      else 'outgoing'
    end
  from public.profiles pr
  -- Deux demandes croisées (rare) : l'amitié acceptée d'abord, puis la demande reçue.
  left join lateral (
    select fr.status, fr.addressee
    from public.friendships fr
    where (fr.requester = pr.id and fr.addressee = (select auth.uid()))
       or (fr.requester = (select auth.uid()) and fr.addressee = pr.id)
    order by (fr.status = 'accepted') desc, (fr.addressee = (select auth.uid())) desc
    limit 1
  ) f on true
  where (select auth.uid()) is not null
    and pr.id = p_id;
$$;

-- Réservée aux utilisateurs connectés.
revoke execute on function public.public_profile(uuid) from public, anon;
grant execute on function public.public_profile(uuid) to authenticated;
