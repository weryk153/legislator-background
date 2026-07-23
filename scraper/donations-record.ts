// 政治獻金入庫 — 讀 scraper/out-ardata/*.csv（Task 1 整批下載，UTF-8），
// 解析→彙總→比對→寫 sources + donation_reports + donation_top_donors。
// 寧缺勿錯：none/ambiguous 全部寫進 out-ardata/match-review.json 供人工檢視，不入庫。
//   pnpm run donations:record            # 寫入
//   DRY_RUN=1 pnpm run donations:record  # 只檢查不寫
import { createClient } from '@supabase/supabase-js';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { loadEnv } from './lib/loadEnv';
import { parseArdataCsv, aggregateAccounts, type AccountSummary } from './lib/ardata';
import { matchAccount, type OfficialLite } from './lib/ardata-match';

loadEnv();
const here = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(here, 'out-ardata');
// ardata 專戶查詢頁（整批檔的人類可核對入口）；實際樣式見 scraper/fixtures/ardata-notes.md
const SOURCE_URL = 'https://ardata.cy.gov.tw/data/downloads/election';
const RETRIEVED_AT = '2026-07-23'; // Task 1 下載日

async function main() {
  const sb = createClient(process.env.PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

  // Task 1 下載腳本攤平命名為 <選舉>_<縣市>_incomes.csv / _expenditures.csv，只讀這兩類
  const files = readdirSync(DATA_DIR).filter((f) => f.endsWith('_incomes.csv') || f.endsWith('_expenditures.csv'));
  if (files.length === 0) throw new Error(`no CSVs in ${DATA_DIR} — 先完成 Task 1 整批下載`);
  // 整批包內可能混有彙總表/資產負債表等不同欄位的 CSV：解析不了的檔跳過並列出，
  // 只要有至少一個明細檔成功即可。
  // 檔名格式 <選舉名>_<area>_incomes.csv / <選舉名>_<area>_expenditures.csv：area 是
  // incomes/expenditures 前一個 `_` 與再前一個 `_` 之間的區段（縣市或 山地/平地原住民）。
  const areaOfFilename = (f: string): string | undefined => {
    const m = f.match(/_([^_]+)_(?:incomes|expenditures)\.csv$/);
    return m?.[1];
  };
  const rows: ReturnType<typeof parseArdataCsv> = [];
  for (const f of files) {
    const area = areaOfFilename(f);
    try {
      rows.push(...parseArdataCsv(readFileSync(join(DATA_DIR, f), 'utf8')).map((r) => ({ ...r, area })));
    }
    catch (e) { console.log(`⤫ 跳過 ${f}: ${(e as Error).message}`); }
  }
  if (rows.length === 0) throw new Error('沒有任何明細列被解析出來 — 檢查欄名/編碼(ardata-notes.md)');
  const summaries = aggregateAccounts(rows);
  console.log(`${files.length} 檔 / ${rows.length} 列 / ${summaries.length} 專戶`);

  // 收支科目 smoke：列出全部科目，人工確認有無「捐贈收入」類的新科目需補進
  // DONOR_TYPE_BY_CATEGORY（否則該類捐贈者不會進大額捐贈者表）。
  console.log('收支科目一覽:', [...new Set(rows.map((r) => r.category))].sort().join('、'));

  // PostgREST 預設單次回傳上限 1000 筆，officials 已超過（1034+），須分頁抓全部，
  // 否則排序落在後段的 officials（如部分市長）會被靜默漏掉、比對時誤判查無此人。
  const officials: OfficialLite[] = [];
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const { data: offs, error } = await sb.from('officials')
      .select('id, name, office_type, district, is_incumbent')
      .range(from, from + PAGE - 1);
    if (error) throw new Error(`officials query failed: ${error.message}`);
    officials.push(...((offs ?? []) as OfficialLite[]));
    if (!offs || offs.length < PAGE) break;
  }

  const review: Array<{ account: AccountSummary; status: string; reason: string }> = [];
  let inserted = 0, dup = 0;
  for (const s of summaries) {
    const m = matchAccount({ name: s.name, electionName: s.electionName, area: s.area }, officials);
    if (m.status !== 'matched') {
      review.push({ account: { ...s, topDonors: [] }, status: m.status, reason: m.reason });
      continue;
    }
    const { data: existing, error: qe } = await sb.from('donation_reports')
      .select('id').eq('official_id', m.officialId).eq('election_name', s.electionName);
    if (qe) throw new Error(`existing report query (${s.name}): ${qe.message}`);
    if ((existing ?? []).length > 0) { dup++; continue; }
    if (process.env.DRY_RUN) { inserted++; console.log('✓(dry)', s.name, s.electionName, s.totalIncome); continue; }

    const { data: src, error: se } = await sb.from('sources')
      .insert({ url: SOURCE_URL, type: 'gov', title: `監察院政治獻金公開查閱平臺 ${s.electionName} ${s.name}`, retrieved_at: RETRIEVED_AT })
      .select('id').single();
    if (se) throw new Error(`source insert: ${se.message}`);
    const { data: rep, error: re } = await sb.from('donation_reports').insert({
      official_id: m.officialId, election_name: s.electionName, report_seq: s.reportSeq,
      total_income: s.totalIncome, total_expense: s.totalExpense,
      income_by_type: s.incomeByType, expense_by_type: s.expenseByType, source_id: src.id,
    }).select('id').single();
    if (re) throw new Error(`report insert (${s.name}): ${re.message}`);
    if (s.topDonors.length) {
      const { error: de } = await sb.from('donation_top_donors').insert(
        s.topDonors.map((d) => ({ report_id: rep.id, donor_name: d.donorName, donor_type: d.donorType, amount: d.amount, rank: d.rank })),
      );
      if (de) throw new Error(`donors insert (${s.name}): ${de.message}`);
    }
    inserted++; console.log('●', s.name, s.electionName, `收 ${s.totalIncome} / 支 ${s.totalExpense} / 大額 ${s.topDonors.length}`);
  }

  const reviewPath = join(DATA_DIR, 'match-review.json');
  writeFileSync(reviewPath, JSON.stringify(review, null, 2));
  console.log(`\n完成：入庫 ${inserted}、已存在 ${dup}、待人工 ${review.length} → ${reviewPath}`);
  if (!process.env.DRY_RUN && inserted) console.log('記得 pnpm run export:data 重匯出 officials.json。');
}

main().catch((e) => { console.error(e); process.exit(1); });
