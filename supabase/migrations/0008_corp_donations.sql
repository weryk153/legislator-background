-- 營利事業政治獻金全量（含捐給落選人者）。每列＝公司×候選人×選舉（金額加總）。
-- official_id 沿用 donation_reports 既有比對結果（寧缺勿錯）；NULL＝落選人或未收錄。
create table corp_donations (
  id uuid primary key default gen_random_uuid(),
  donor_uid text not null,        -- 8碼統編；無效統編列用 'name:<公司名>'
  donor_name text not null,       -- 正規名（同統編變體取最長）
  recipient_name text not null,   -- 擬參選人姓名（原文）
  election_name text not null,
  official_id uuid references officials(id) on delete set null,
  amount bigint not null,
  source_id uuid not null references sources(id)
);
create index corp_donations_uid_idx on corp_donations (donor_uid);
create index corp_donations_official_idx on corp_donations (official_id);

alter table corp_donations enable row level security;
create policy "public read" on corp_donations for select using (true);
