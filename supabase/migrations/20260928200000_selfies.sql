-- Selfies : photos géocadrées en direct avec la caméra avant. Le géocadrage enregistré est
-- celui de l'objectif avant (cap retourné par rapport au téléphone) : un selfie se retrouve
-- donc comme toute autre photo, en visant depuis la place du téléphone l'endroit où se
-- tenait son auteur. Mêmes règles que les autres photos (visibilité, chasse, Premium).
alter table public.photos
  add column selfie boolean not null default false;
