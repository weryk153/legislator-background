-- Enums
create type office_type as enum ('legislator', 'mayor_magistrate', 'councilor');
create type controversy_status as enum ('investigating', 'indicted', 'first_instance', 'settled', 'cleared', 'other');
create type source_type as enum ('court', 'news', 'gov', 'gazette', 'factcheck');

-- Sources: every fact references one of these
create table sources (
  id uuid primary key default gen_random_uuid(),
  url text not null,
  type source_type not null,
  title text not null,
  retrieved_at date not null
);

create table officials (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  party text not null,
  office_type office_type not null,
  district text not null,
  term text not null,
  photo_url text,
  bio text not null default '',
  is_incumbent boolean not null default true
);

create table careers (
  id uuid primary key default gen_random_uuid(),
  official_id uuid not null references officials(id) on delete cascade,
  title text not null,
  organization text not null,
  start_date text not null,
  end_date text,
  source_id uuid not null references sources(id)   -- mandatory source
);

create table judgments (
  id uuid primary key default gen_random_uuid(),
  official_id uuid not null references officials(id) on delete cascade,
  case_reason text not null,
  court text not null,
  case_number text not null,
  outcome text not null,
  is_final boolean not null,
  judgment_date text not null,
  judgment_url text not null,
  source_id uuid not null references sources(id)   -- mandatory source
);

create table controversies (
  id uuid primary key default gen_random_uuid(),
  official_id uuid not null references officials(id) on delete cascade,
  title text not null,
  summary text not null,
  status controversy_status not null,
  event_date text not null,
  report_date text not null
);

-- Controversies have many sources; the build-time validator enforces "at least one".
create table controversy_sources (
  controversy_id uuid not null references controversies(id) on delete cascade,
  source_id uuid not null references sources(id),
  primary key (controversy_id, source_id)
);

create table asset_declarations (
  id uuid primary key default gen_random_uuid(),
  official_id uuid not null references officials(id) on delete cascade,
  year int not null,
  total_amount bigint not null,
  source_id uuid not null references sources(id)   -- mandatory source
);

-- RLS: public read-only; writes only via service role (which bypasses RLS).
alter table sources enable row level security;
alter table officials enable row level security;
alter table careers enable row level security;
alter table judgments enable row level security;
alter table controversies enable row level security;
alter table controversy_sources enable row level security;
alter table asset_declarations enable row level security;

create policy "public read" on sources for select using (true);
create policy "public read" on officials for select using (true);
create policy "public read" on careers for select using (true);
create policy "public read" on judgments for select using (true);
create policy "public read" on controversies for select using (true);
create policy "public read" on controversy_sources for select using (true);
create policy "public read" on asset_declarations for select using (true);
