-- =============================================================================
-- teambieb.sql — inloggen en de gedeelde bieb van de Tool Hub (Supabase)
-- -----------------------------------------------------------------------------
-- Opnieuw draaien kan: alles is idempotent. De teamlijst zelf staat niet in de
-- repo: voeg een collega toe met
--   insert into public.team (email, name) values ('naam@pureminds.nl', 'Naam');
-- Zie README.md#inloggen.
--
--   public.team             wie een account mag maken en bij de bieb kan
--   public.designs          de ontwerpen (de toestand van een maker); de makers slaan
--                           vanzelf op. Weggooien = deleted_at (30 dagen prullenbak)
--   public.design_versions  eerdere versies van een ontwerp, om terug te zetten
--   storage designs         de foto's, logo's en handtekeningen in die ontwerpen,
--                           als <ontwerp-id>/<bestand>
--
-- Alles zit achter Row Level Security: alleen een ingelogde collega van de
-- teamlijst leest of schrijft. De publieke sleutel in js/shared/account.js
-- geeft zonder inloggen nergens toegang toe.
-- =============================================================================

-- 1. Het team ---------------------------------------------------------------

create table if not exists public.team (
  email text primary key check (email = lower(email)),
  name text not null,
  added_at timestamptz not null default now()
);
alter table public.team enable row level security;

-- Hoort wie nu ingelogd is bij het team? (e-mail uit het inlogbewijs). Ook als rpc voor een
-- ingelogde collega: de server van de hub (uploads/lib/team.js) vraagt het zo. Hij zegt alleen
-- iets over jezelf, dus de melding van de Security Advisor hierover is bewust.
create or replace function public.is_team_member()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from public.team t where t.email = lower(coalesce(auth.jwt() ->> 'email', '')));
$$;
revoke execute on function public.is_team_member() from public, anon;
grant execute on function public.is_team_member() to authenticated;

drop policy if exists "team ziet het team" on public.team;
create policy "team ziet het team" on public.team
  for select to authenticated using ((select public.is_team_member()));

-- Alleen wie op de teamlijst staat, kan een account maken
create or replace function public.only_team_signs_up()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if not exists (select 1 from public.team t where t.email = lower(new.email)) then
    raise exception 'not on team: %', new.email using errcode = 'P0001';
  end if;
  return new;
end;
$$;
revoke execute on function public.only_team_signs_up() from public, anon, authenticated;
drop trigger if exists only_team_signs_up on auth.users;
create trigger only_team_signs_up before insert on auth.users
  for each row execute function public.only_team_signs_up();

-- 2. De ontwerpen -------------------------------------------------------------

create table if not exists public.designs (
  id text primary key default gen_random_uuid()::text check (id ~ '^[a-z0-9-]{6,64}$'),
  tool text not null check (tool in ('insta', 'document', 'presentation', 'newsletter')),
  slot text check (slot is null or slot ~ '^[a-z0-9_-]{1,32}$'),
  title text not null default 'Zonder titel' check (length(title) <= 300),
  sub text not null default '' check (length(sub) <= 300),
  noun text not null default 'ontwerp' check (length(noun) <= 60),
  ratio text not null default '1 / 1' check (length(ratio) <= 20),
  thumb text not null default '' check (length(thumb) <= 200000),
  state jsonb not null,
  files text[] not null default '{}',
  created_at timestamptz not null default now(),
  created_by uuid,
  created_by_name text,
  updated_at timestamptz not null default now(),
  updated_by uuid,
  updated_by_name text,
  expires_at timestamptz not null default now() + interval '14 days'
);
-- Sinds het vanzelf opslaan (oktober 2026): een eigen naam, de prullenbak, en wie het nu open heeft
alter table public.designs add column if not exists name text check (name is null or length(name) <= 200);
alter table public.designs add column if not exists deleted_at timestamptz;
alter table public.designs add column if not exists deleted_by_name text;
alter table public.designs add column if not exists editing_by uuid;
alter table public.designs add column if not exists editing_name text;
alter table public.designs add column if not exists editing_at timestamptz;
-- Niet meer na 14 dagen weg: een ontwerp blijft tot iemand het weggooit. expires_at doet niet meer
-- mee (de verre datum houdt een tabblad met de oude code werkend tot het ververst)
update public.designs set deleted_at = expires_at where deleted_at is null and expires_at < now();
update public.designs set expires_at = '2999-12-31' where expires_at < '2999-01-01';
alter table public.designs alter column expires_at set default '2999-12-31';
create index if not exists designs_tool_updated on public.designs (tool, updated_at desc);
create index if not exists designs_deleted on public.designs (deleted_at);
drop index if exists public.designs_expires;
alter table public.designs enable row level security;

-- Wie en wanneer zet de database zelf (niet te vervalsen vanuit de browser). Alleen een
-- andere inhoud telt als opslaan; een naam, de prullenbak of "wie heeft het open" niet. Zo ziet
-- de bieb aan updated_at of iemand anders het ontwerp intussen heeft aangepast.
create or replace function public.designs_stamp()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  who text := (select t.name from public.team t where t.email = lower(coalesce(auth.jwt() ->> 'email', '')));
begin
  new.expires_at := '2999-12-31';   -- verloopt niet meer (zie boven)
  if tg_op = 'INSERT' then
    new.created_at := now();
    new.created_by := auth.uid();
    new.created_by_name := who;
    new.deleted_at := null;
  else
    new.created_at := old.created_at;
    new.created_by := old.created_by;
    new.created_by_name := old.created_by_name;
  end if;
  -- Weggegooid door wie (en terug: niemand)
  if new.deleted_at is null then
    new.deleted_by_name := null;
  elsif tg_op = 'INSERT' or old.deleted_at is null then
    new.deleted_by_name := who;
  else
    new.deleted_by_name := old.deleted_by_name;
  end if;
  -- Wie het nu open heeft: altijd wie dit verzoek doet
  if new.editing_at is not null and (tg_op = 'INSERT' or new.editing_at is distinct from old.editing_at) then
    new.editing_by := auth.uid();
    new.editing_name := who;
  end if;
  if tg_op = 'UPDATE' and new.state = old.state and new.files = old.files then
    new.updated_at := old.updated_at;
    new.updated_by := old.updated_by;
    new.updated_by_name := old.updated_by_name;
    return new;
  end if;
  new.updated_at := now();
  new.updated_by := auth.uid();
  new.updated_by_name := who;
  return new;
end;
$$;
revoke execute on function public.designs_stamp() from public, anon, authenticated;
drop trigger if exists designs_stamp on public.designs;
create trigger designs_stamp before insert or update on public.designs
  for each row execute function public.designs_stamp();

drop policy if exists "team leest ontwerpen" on public.designs;
drop policy if exists "team maakt ontwerpen" on public.designs;
drop policy if exists "team past ontwerpen aan" on public.designs;
drop policy if exists "team gooit ontwerpen weg" on public.designs;
create policy "team leest ontwerpen" on public.designs
  for select to authenticated using ((select public.is_team_member()));
create policy "team maakt ontwerpen" on public.designs
  for insert to authenticated with check ((select public.is_team_member()));
create policy "team past ontwerpen aan" on public.designs
  for update to authenticated using ((select public.is_team_member())) with check ((select public.is_team_member()));
create policy "team gooit ontwerpen weg" on public.designs
  for delete to authenticated using ((select public.is_team_member()));

-- Zonder inloggen: niets (RLS houdt het al tegen, dit is de tweede deur)
revoke all on public.team, public.designs from anon;

-- 3. De bestanden in de ontwerpen ----------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit)
values ('designs', 'designs', false, 26214400)
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit;

drop policy if exists "team leest bestanden" on storage.objects;
drop policy if exists "team zet bestanden neer" on storage.objects;
drop policy if exists "team vervangt bestanden" on storage.objects;
drop policy if exists "team gooit bestanden weg" on storage.objects;
create policy "team leest bestanden" on storage.objects
  for select to authenticated using (bucket_id = 'designs' and (select public.is_team_member()));
create policy "team zet bestanden neer" on storage.objects
  for insert to authenticated with check (bucket_id = 'designs' and (select public.is_team_member()));
create policy "team vervangt bestanden" on storage.objects
  for update to authenticated using (bucket_id = 'designs' and (select public.is_team_member()))
  with check (bucket_id = 'designs' and (select public.is_team_member()));
create policy "team gooit bestanden weg" on storage.objects
  for delete to authenticated using (bucket_id = 'designs' and (select public.is_team_member()));

-- 4. Versies: altijd terug te zetten --------------------------------------------

-- De makers slaan vanzelf op. Voordat een andere inhoud de vorige overschrijft, bewaart de
-- database die vorige als versie: als er de laatste 10 minuten geen versie is gemaakt, of als
-- iemand anders het nu aanpast. Per ontwerp de nieuwste 50; ze gaan weg met het ontwerp.
create table if not exists public.design_versions (
  id bigint generated always as identity primary key,
  design_id text not null references public.designs (id) on delete cascade,
  title text,
  state jsonb not null,
  files text[] not null default '{}',
  saved_at timestamptz not null,        -- wanneer deze versie gemaakt was
  saved_by uuid,
  saved_by_name text,
  kept_at timestamptz not null default now()   -- wanneer hij als versie bewaard werd
);
create index if not exists design_versions_design on public.design_versions (design_id, kept_at desc);
alter table public.design_versions enable row level security;

drop policy if exists "team leest versies" on public.design_versions;
create policy "team leest versies" on public.design_versions
  for select to authenticated using ((select public.is_team_member()));
revoke all on public.design_versions from anon;

create or replace function public.designs_keep_version()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if (new.state is distinct from old.state or new.files is distinct from old.files)
     and (old.updated_by is distinct from new.updated_by
          or not exists (select 1 from public.design_versions v
                         where v.design_id = old.id and v.kept_at > now() - interval '10 minutes')) then
    insert into public.design_versions (design_id, title, state, files, saved_at, saved_by, saved_by_name)
    values (old.id, old.title, old.state, old.files, old.updated_at, old.updated_by, old.updated_by_name);
    delete from public.design_versions v
    where v.design_id = old.id
      and v.id not in (select w.id from public.design_versions w where w.design_id = old.id order by w.kept_at desc limit 50);
  end if;
  return null;
end;
$$;
revoke execute on function public.designs_keep_version() from public, anon, authenticated;
drop trigger if exists designs_keep_version on public.designs;
create trigger designs_keep_version after update on public.designs
  for each row execute function public.designs_keep_version();

-- Vóór het terugzetten van een versie: wat er nu staat ook als versie bewaren
create or replace function public.keep_version(design text)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if not public.is_team_member() then
    raise exception 'not on team' using errcode = '42501';
  end if;
  insert into public.design_versions (design_id, title, state, files, saved_at, saved_by, saved_by_name)
  select d.id, d.title, d.state, d.files, d.updated_at, d.updated_by, d.updated_by_name
  from public.designs d where d.id = design;
end;
$$;
revoke execute on function public.keep_version(text) from public, anon;
grant execute on function public.keep_version(text) to authenticated;

-- 5. De reservekopie: een tweede bieb achter de schermen ---------------------------

-- Elke nacht gaat alles wat die dag veranderde (ook wat in de prullenbak ging) naar een aparte
-- tabel, 60 dagen bewaard. Niemand in de hub ziet hem of kan eruit weggooien (geen policies);
-- terughalen gaat met SQL in Supabase. Zo blijft er iets, ook als een ontwerp na 30 dagen
-- prullenbak definitief weg is. De bestanden (foto's) blijven in de opslag tot dat opruimen.
create table if not exists public.designs_backup (
  day date not null,
  id text not null,
  tool text,
  slot text,
  name text,
  title text,
  state jsonb,
  files text[],
  created_by_name text,
  updated_at timestamptz,
  updated_by_name text,
  deleted_at timestamptz,
  primary key (day, id)
);
alter table public.designs_backup enable row level security;
revoke all on public.designs_backup from anon, authenticated;

create or replace function public.backup_designs()
returns void
language sql security definer set search_path = ''
as $$
  insert into public.designs_backup (day, id, tool, slot, name, title, state, files, created_by_name, updated_at, updated_by_name, deleted_at)
  select current_date, d.id, d.tool, d.slot, d.name, d.title, d.state, d.files, d.created_by_name, d.updated_at, d.updated_by_name, d.deleted_at
  from public.designs d
  where d.updated_at > now() - interval '25 hours' or d.deleted_at > now() - interval '25 hours'
  on conflict (day, id) do update set
    name = excluded.name, title = excluded.title, state = excluded.state, files = excluded.files,
    updated_at = excluded.updated_at, updated_by_name = excluded.updated_by_name, deleted_at = excluded.deleted_at;
  delete from public.designs_backup where day < current_date - 60;
$$;
revoke execute on function public.backup_designs() from public, anon, authenticated;

create extension if not exists pg_cron;
select cron.unschedule(jobid) from cron.job where jobname = 'bieb-reservekopie';
select cron.schedule('bieb-reservekopie', '30 2 * * *', 'select public.backup_designs()');

-- 6. Wakker blijven -------------------------------------------------------------

-- Een gratis Supabase-project slaapt na 7 dagen zonder verkeer. De server van de
-- hub (uploads/api/keepalive.js, een dagelijkse cron in Vercel) roept dit aan.
create or replace function public.ping()
returns boolean
language sql stable set search_path = ''
as $$ select true $$;
grant execute on function public.ping() to anon, authenticated;
