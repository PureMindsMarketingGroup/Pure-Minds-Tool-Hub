-- =============================================================================
-- teambieb.sql — inloggen en de gedeelde bieb van de Tool Hub (Supabase)
-- -----------------------------------------------------------------------------
-- Opnieuw draaien kan: alles is idempotent. De teamlijst zelf staat niet in de
-- repo: voeg een collega toe met
--   insert into public.team (email, name) values ('naam@pureminds.nl', 'Naam');
-- Zie README.md#inloggen.
--
--   public.team      wie een account mag maken en bij de bieb kan
--   public.designs   de bewaarde ontwerpen (de toestand van een maker), 14 dagen
--   storage designs  de foto's, logo's en handtekeningen in die ontwerpen,
--                    als <ontwerp-id>/<bestand>
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
create index if not exists designs_tool_updated on public.designs (tool, updated_at desc);
create index if not exists designs_expires on public.designs (expires_at);
alter table public.designs enable row level security;

-- Wie en wanneer zet de database zelf (niet te vervalsen vanuit de browser). Alleen een
-- andere inhoud telt als opslaan; langer bewaren of weggooien (expires_at) niet. Zo ziet
-- de bieb aan updated_at of iemand anders het ontwerp intussen heeft aangepast.
create or replace function public.designs_stamp()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  who text := (select t.name from public.team t where t.email = lower(coalesce(auth.jwt() ->> 'email', '')));
begin
  if tg_op = 'INSERT' then
    new.created_at := now();
    new.created_by := auth.uid();
    new.created_by_name := who;
  else
    new.created_at := old.created_at;
    new.created_by := old.created_by;
    new.created_by_name := old.created_by_name;
    if new.state = old.state and new.files = old.files then
      new.updated_at := old.updated_at;
      new.updated_by := old.updated_by;
      new.updated_by_name := old.updated_by_name;
      return new;
    end if;
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

-- 4. Wakker blijven -------------------------------------------------------------

-- Een gratis Supabase-project slaapt na 7 dagen zonder verkeer. De server van de
-- hub (uploads/api/keepalive.js, een dagelijkse cron in Vercel) roept dit aan.
create or replace function public.ping()
returns boolean
language sql stable set search_path = ''
as $$ select true $$;
grant execute on function public.ping() to anon, authenticated;
