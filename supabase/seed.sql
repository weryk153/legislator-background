-- Sources
insert into sources (id, url, type, title, retrieved_at) values
  ('00000000-0000-0000-0000-0000000000f1', 'https://judgment.judicial.gov.tw/', 'court', '司法院裁判書（範例）', '2026-06-01'),
  ('00000000-0000-0000-0000-0000000000f2', 'https://www.ly.gov.tw/', 'gov', '立法院委員資料（範例）', '2026-06-01'),
  ('00000000-0000-0000-0000-0000000000f3', 'https://example.com/news', 'news', '新聞報導（範例）', '2026-06-01');

-- Officials
insert into officials (id, name, party, office_type, district, term, bio) values
  ('00000000-0000-0000-0000-0000000000a1', '陳〇〇', '國民黨', 'legislator', '台北市第3選區', '11', '律師、台北市議員兩屆'),
  ('00000000-0000-0000-0000-0000000000a2', '林〇〇', '民進黨', 'legislator', '不分區', '11', 'NGO 秘書長、社會學者'),
  ('00000000-0000-0000-0000-0000000000a3', '王〇〇', '民眾黨', 'legislator', '台中市第5選區', '11', '企業負責人');

-- Careers
insert into careers (official_id, title, organization, start_date, end_date, source_id) values
  ('00000000-0000-0000-0000-0000000000a1', '市議員', '台北市議會', '2014', '2022', '00000000-0000-0000-0000-0000000000f2');

-- Judgments
insert into judgments (official_id, case_reason, court, case_number, outcome, is_final, judgment_date, judgment_url, source_id) values
  ('00000000-0000-0000-0000-0000000000a1', '妨害名譽', '臺灣臺北地方法院', '111年度易字第1號', '一審判決無罪', false, '2024-05-01', 'https://judgment.judicial.gov.tw/', '00000000-0000-0000-0000-0000000000f1'),
  ('00000000-0000-0000-0000-0000000000a3', '背信', '臺灣臺中地方法院', '110年度訴字第2號', '一審有罪、上訴中', false, '2024-03-01', 'https://judgment.judicial.gov.tw/', '00000000-0000-0000-0000-0000000000f1');

-- Controversies
with c as (
  insert into controversies (id, official_id, title, summary, status, event_date, report_date)
  values ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000a3', '工程招標爭議', '遭質疑特定廠商綁標，當事人否認。', 'investigating', '2023-08-01', '2023-09-15')
  returning id
)
insert into controversy_sources (controversy_id, source_id)
select id, '00000000-0000-0000-0000-0000000000f3' from c;

-- Asset declarations
insert into asset_declarations (official_id, year, total_amount, source_id) values
  ('00000000-0000-0000-0000-0000000000a1', 2024, 120000000, '00000000-0000-0000-0000-0000000000f2'),
  ('00000000-0000-0000-0000-0000000000a2', 2024, 24000000, '00000000-0000-0000-0000-0000000000f2');
