-- Itemized asset declaration lines (土地/建物/存款/有價證券/…). The single
-- total_amount is no longer required — amounts live per-category here.
alter table asset_declarations alter column total_amount drop not null;

create type asset_category as enum (
  'land', 'building', 'cash', 'deposit', 'securities', 'investment', 'claim', 'debt', 'other'
);

create table asset_items (
  id uuid primary key default gen_random_uuid(),
  declaration_id uuid not null references asset_declarations(id) on delete cascade,
  category asset_category not null,
  amount bigint not null,
  label text
);

alter table asset_items enable row level security;
create policy "public read" on asset_items for select using (true);
