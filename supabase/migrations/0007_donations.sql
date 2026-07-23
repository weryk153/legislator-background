-- 政治獻金（監察院 ardata 整批下載，彙總後入庫）。逐筆明細不入庫；
-- 每人每選舉一列摘要 + 大額捐贈者（營利事業全列、個人前20、匿名不列名）。
create table donation_reports (
  id uuid primary key default gen_random_uuid(),
  official_id uuid not null references officials(id) on delete cascade,
  election_name text not null,           -- 如「第11屆立法委員選舉」
  report_seq text not null default '',   -- 申報序次(年度)
  total_income bigint not null,
  total_expense bigint not null,
  income_by_type jsonb not null default '{}'::jsonb,   -- 收支科目 → 小計(元)
  expense_by_type jsonb not null default '{}'::jsonb,
  source_id uuid not null references sources(id),
  unique (official_id, election_name)    -- 去重鍵：同人同選舉不重覆
);

create table donation_top_donors (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references donation_reports(id) on delete cascade,
  donor_name text not null,
  donor_type text not null,              -- 個人/營利事業/政黨/人民團體
  amount bigint not null,                -- 同一捐贈者多筆加總（元）
  rank int not null
);
create index donation_top_donors_report_idx on donation_top_donors (report_id);

-- RLS：公開唯讀，寫入只走 service role，與既有表一致
alter table donation_reports enable row level security;
alter table donation_top_donors enable row level security;
create policy "public read" on donation_reports for select using (true);
create policy "public read" on donation_top_donors for select using (true);
