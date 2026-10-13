// Contrôles SQL hors ligne de la migration du socle (0.24.0), dans un PostgreSQL embarqué (PGlite) — aucune
// connexion à la vraie base. Parent : ../../CLAUDE.md. Lancer avec PICTI_PGLITE_MODULE = chemin de
// `@electric-sql/pglite/dist/index.js` (paquet installé hors du dépôt, voir la note de session du 13/10/2026).
import { readFile, readdir } from 'node:fs/promises'
import assert from 'node:assert/strict'
const { PGlite } = await import(process.env.PICTI_PGLITE_MODULE || '@electric-sql/pglite')
const db = new PGlite()
await db.exec(`
create role anon; create role authenticated; create role service_role bypassrls;
create schema auth; create schema storage; create schema extensions;
create table auth.users(id uuid primary key, raw_user_meta_data jsonb default '{}');
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
grant usage on schema public,auth,storage to anon,authenticated,service_role;
alter default privileges in schema public grant all on tables to authenticated,service_role;
alter default privileges in schema public grant all on sequences to authenticated,service_role;
create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text);
alter table storage.objects enable row level security;
grant all on storage.objects to authenticated;
create function storage.foldername(text) returns text[] language sql as $$ select string_to_array($1,'/') $$;
`)
for (const name of (await readdir(new URL('../migrations/',import.meta.url))).sort()) {
 if (!name.endsWith('.sql')) continue
 let sql = await readFile(new URL('../migrations/'+name,import.meta.url),'utf8')
 // PGlite sans pgcrypto ni réplication : fonctions Premium créées mais non appelées dans ce scénario.
 sql = sql.replace('create extension if not exists pgcrypto with schema extensions;', '').replace('alter publication supabase_realtime add table public.notifications;', '')
 await db.exec(sql)
}
const a='00000000-0000-4000-8000-000000000001', b='00000000-0000-4000-8000-000000000002', c='00000000-0000-4000-8000-000000000003', d='00000000-0000-4000-8000-000000000004'
const photo='10000000-0000-4000-8000-000000000001', photo2='10000000-0000-4000-8000-000000000002'
for (const id of [a,b,c,d]) await db.query('insert into auth.users(id) values($1)',[id])
await db.exec(`insert into public.photos(id,owner,width,height,focal35,image_path,thumb_path,visibility,mode,lat,lon,heading,pitch,roll) values
('${photo}','${a}',100,100,26,'${a}/a.jpg','${a}/t.jpg','public','direct',46,-1,0,0,0),
('${photo2}','${b}',100,100,26,'${b}/a.jpg','${b}/t.jpg','public','direct',46,-1,0,0,0);
insert into public.friendships(requester,addressee,status) values('${a}','${b}','accepted');`)
async function as(id,sql) {
 await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub','${id}',false);`)
 try { return await db.query(sql) } finally { await db.exec('reset role') }
}
let checks=0
async function count(id,sql,n) { assert.equal((await as(id,sql)).rows.length,n,sql); checks++ }
async function denied(id,sql) { await assert.rejects(()=>as(id,sql)); checks++ }
await count(b,'select * from public.photos',2)
await denied(b,`insert into public.reports(reporter,photo_id,reason) values('${c}','${photo}','privacy')`)
await denied(b,`insert into public.reports(photo_id,reason,status) values('${photo}','privacy','traité')`)
await as(b,`insert into public.reports(photo_id,reason) values('${photo}','privacy')`)
await count(b,`select * from public.photos where id='${photo}'`,0)
await count(c,`select * from public.photos where id='${photo}'`,1)
await denied(b,`update public.reports set status='traité'`)
await count(c,'select * from public.reports',0)
await as(c,`insert into public.reports(photo_id,reason) values('${photo}','spam')`)
await count(d,`select * from public.photos where id='${photo}'`,1)
await as(d,`insert into public.reports(photo_id,reason) values('${photo}','violence')`)
// L'autrice voit encore sa photo masquée ; les autres non.
await count(a,`select * from public.photos where id='${photo}'`,1)
await count(c,`select * from public.nearby_photos(46,-1,500) where id='${photo}'`,0)
await denied(a,`update public.photos set hidden_at=null where id='${photo}'`)
await denied(b,`insert into public.blocks(blocker,blocked) values('${c}','${a}')`)
await as(a,`insert into public.blocks(blocked) values('${b}')`)
await count(a,`select * from public.photos where owner='${b}'`,0)
await count(a,'select * from public.friendships',0)
await count(b,'select * from public.blocks',0)
await count(a,'select * from public.my_blocked_users()',1)
await count(a,`select * from public.public_profile('${b}')`,0)
await denied(b,`insert into public.friendships(requester,addressee) values('${b}','${a}')`)
await db.exec(`insert into public.notifications(recipient,actor,kind,photo_id) values('${a}','${b}','like','${photo}')`)
assert.equal((await db.query('select * from public.notifications')).rows.length,0); checks++
await as(a,`delete from public.blocks where blocked='${b}'`)
await count(a,`select * from public.photos where owner='${b}'`,1)
await count(a,'select * from public.friendships',0)
await as(a,`select public.accept_terms('2026-10-13')`)
assert.equal((await db.query(`select terms_version from public.profiles where id='${a}'`)).rows[0].terms_version,'2026-10-13'); checks++
await denied(a,`select public.accept_terms('wrong')`)
await db.exec("set role anon; select set_config('request.jwt.claim.sub','',false)")
assert.equal((await db.query('select * from public.nearest_public_photo(46,-1)')).rows.length,1); checks++
await db.exec('reset role')
console.log(`${checks} contrôles SQL réussis (PostgreSQL embarqué ; aucune connexion à la production).`)
await db.close()
