-- 人物關係圖：外部公眾人物 + 人與人關係。沿用既有 sources 表。
create type entity_type as enum (
  'businessperson', 'religious', 'celebrity', 'media', 'family_member', 'organization', 'other'
);
create type relation_type as enum (
  -- 家族
  'spouse', 'parent_child', 'sibling', 'relative',
  -- 政治
  'faction', 'mentor', 'party_bloc', 'aide', 'backer', 'co_case'
);
create type node_ref_type as enum ('official', 'entity');

-- 非公職的外部公眾人物（無完整檔案頁）
create table entities (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  entity_type entity_type not null,
  description text not null default '',
  photo_url text,
  wikipedia_url text
);

-- 人與人的關係（端點可指向 official 或 entity；完整性由 build 期 validate 保證）
create table relationships (
  id uuid primary key default gen_random_uuid(),
  from_type node_ref_type not null,
  from_id uuid not null,
  to_type node_ref_type not null,
  to_id uuid not null,
  relation_type relation_type not null,
  directed boolean not null default false,
  note text,
  source_id uuid not null references sources(id),     -- 每條關係必附來源
  check (not (from_type = to_type and from_id = to_id)) -- 禁止自連
);
create index relationships_from_idx on relationships (from_type, from_id);
create index relationships_to_idx on relationships (to_type, to_id);

-- RLS：公開唯讀，寫入只走 service role（bypass RLS），與既有表一致
alter table entities enable row level security;
alter table relationships enable row level security;
create policy "public read" on entities for select using (true);
create policy "public read" on relationships for select using (true);
