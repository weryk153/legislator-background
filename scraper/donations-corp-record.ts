// 營利事業捐贈全量入庫（/donors 反查）。讀 out-ardata/*_incomes.csv → aggregateCorpDonations
// → 連結 official_id（只沿用 donation_reports 既有 (official名, election) 配對,寧缺勿錯）
// → wipe-and-rebuild corp_donations（全刪重建,冪等）。
//   pnpm run donations:corp-record            # 寫入
//   DRY_RUN=1 pnpm run donations:corp-record  # 只統計不寫
import { createClient } from '@supabase/supabase-js';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { loadEnv } from './lib/loadEnv';
import { parseArdataCsv } from './lib/ardata';
import { aggregateCorpDonations } from './lib/corp';

loadEnv();
const here = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(here, 'out-ardata');
const SOURCE_URL = 'https://ardata.cy.gov.tw/data/downloads/election';
const RETRIEVED_AT = '2026-07-23';

async function main() {
  const sb = createClient(process.env.PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

  const files = readdirSync(DATA_DIR).filter((f) => f.endsWith('_incomes.csv'));
  if (files.length === 0) throw new Error(`no incomes CSVs in ${DATA_DIR}`);
  const rows = files.flatMap((f) => parseArdataCsv(readFileSync(join(DATA_DIR, f), 'utf8')));
  const corp = aggregateCorpDonations(rows);
  console.log(`${files.length} 檔 → 營利事業配對 ${corp.length} 筆, 公司 ${new Set(corp.map((c) => c.donorUid)).size} 家`);

  // (official姓名, election_name) → official_id：沿用既有 donation_reports 配對
  // PostgREST 預設單次回傳上限 1000 筆，須分頁抓全部，否則末段 donation_reports 會靜默漏掉。
  const reps: Array<{ official_id: string; election_name: string; officials: { name: string } }> = [];
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const { data: chunk, error: re } = await sb.from('donation_reports')
      .select('official_id, election_name, officials!inner(name)')
      .order('id', { ascending: true })
      .range(from, from + PAGE - 1);
    if (re) throw new Error(`donation_reports query: ${re.message}`);
    reps.push(...((chunk ?? []) as typeof reps));
    if (!chunk || chunk.length < PAGE) break;
  }
  const officialByKey = new Map<string, string>();
  const skipped = new Set<string>();
  for (const r of reps) {
    const key = `${r.officials.name}|${r.election_name}`;
    const existing = officialByKey.get(key);
    if (existing && existing !== r.official_id) {
      // 同名同選舉但指向不同 official_id — 寧缺勿錯，刪掉該 key，加入 skipped
      officialByKey.delete(key);
      skipped.add(key);
      console.warn(`⚠ 同名同選舉多人衝突，跳過: ${key} (${existing} vs ${r.official_id})`);
    } else if (!existing && !skipped.has(key)) {
      officialByKey.set(key, r.official_id);
    }
  }
  const linked = corp.filter((c) => officialByKey.has(`${c.recipientName}|${c.electionName}`)).length;
  console.log(`可連結現任: ${linked} / ${corp.length}`);
  if (process.env.DRY_RUN) { console.log('(dry) 不寫入'); return; }

  // wipe-and-rebuild（含既有共用 source）。PostgREST 單次 delete 有回傳筆數上限，
  // 19k 筆可能需要多輪才刪得完 — 迴圈直到 count=0 為止，確保重跑在任何環境都是冪等的。
  for (;;) {
    const { error: de } = await sb.from('corp_donations').delete().neq('donor_uid', '');
    if (de) throw new Error(`corp_donations delete: ${de.message}`);
    const { count, error: ce } = await sb.from('corp_donations').select('id', { count: 'exact', head: true });
    if (ce) throw new Error(`corp_donations count: ${ce.message}`);
    if (!count) break;
  }
  const { data: oldSrc, error: qe } = await sb.from('sources').select('id').eq('url', SOURCE_URL).eq('title', '監察院政治獻金公開查閱平臺 營利事業捐贈整批檔');
  if (qe) throw new Error(`sources query: ${qe.message}`);
  for (const s of oldSrc ?? []) await sb.from('sources').delete().eq('id', s.id);
  const { data: src, error: se } = await sb.from('sources')
    .insert({ url: SOURCE_URL, type: 'gov', title: '監察院政治獻金公開查閱平臺 營利事業捐贈整批檔', retrieved_at: RETRIEVED_AT })
    .select('id').single();
  if (se) throw new Error(`source insert: ${se.message}`);

  for (let i = 0; i < corp.length; i += 500) {
    const chunk = corp.slice(i, i + 500).map((c) => ({
      donor_uid: c.donorUid, donor_name: c.donorName, recipient_name: c.recipientName,
      election_name: c.electionName, amount: c.amount,
      official_id: officialByKey.get(`${c.recipientName}|${c.electionName}`) ?? null,
      source_id: src.id,
    }));
    const { error } = await sb.from('corp_donations').insert(chunk);
    if (error) throw new Error(`insert chunk ${i}: ${error.message}`);
  }
  console.log(`完成: 入庫 ${corp.length} 筆。記得 pnpm run export:donors。`);
}

main().catch((e) => { console.error(e); process.exit(1); });
