// 縣市首長與議員的社會團體／財團法人職務匯入。
//
// 為什麼要另做一支：立委的這類職務隨立法院開放資料的「經歷」欄位而來（見 adapters/ly.ts），
// 但首長與議員沒有對等的官方來源——enrich-mayor-careers.ts 與 enrich-councilor-careers.ts
// 都只讀維基 infobox 的 office/term 欄位，那裡僅有公職。社團職務散在條目的 past 欄位與
// 內文敘述裡，只能人工讀過後逐筆審定，故比照 relationships-curated.json 的做法：
// 資料進版控、腳本只負責寫入。
//
// 議員的同名風險遠高於首長（常見名多、跨縣市重複），故 curated 檔帶 district，
// 匹配時必須縣市也相符才寫入。
//
// 冪等：以 (official_id, title) 判斷，已存在者跳過，可重複執行。
//   pnpm run import:social-careers              # 兩份都匯
//   ONLY=mayor pnpm run import:social-careers   # 只匯首長
//   DRY_RUN=1 pnpm run import:social-careers
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { loadEnv } from './lib/loadEnv';

loadEnv();
const here = dirname(fileURLToPath(import.meta.url));
const DRY_RUN = !!process.env.DRY_RUN;

interface SocialCareers {
  name: string;
  wikiTitle?: string;
  district?: string;   // 議員必備：同名消歧義用
  wikipediaUrl: string;
  positions: string[];
}
const FILES: { file: string; officeType: string; label: string }[] = [
  { file: 'mayor-social-careers.json', officeType: 'mayor_magistrate', label: '首長' },
  { file: 'councilor-social-careers.json', officeType: 'councilor', label: '議員' },
];

async function main() {
  const url = process.env.PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Missing PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  const sb = createClient(url, key);
  const only = process.env.ONLY;

  const { data: offs, error: oe } = await sb.from('officials').select('id, name, office_type, district');
  if (oe) throw new Error(`officials query failed: ${oe.message}`);
  const officials = (offs ?? []) as { id: string; name: string; office_type: string; district: string }[];

  // 既有 careers：用來判斷這一筆是否已寫過（冪等）。
  const existing = new Set<string>();
  for (let f = 0; ; f += 1000) {
    const { data, error } = await sb.from('careers').select('official_id, title').range(f, f + 999);
    if (error) throw new Error(`careers scan failed: ${error.message}`);
    const page = (data ?? []) as { official_id: string; title: string }[];
    for (const c of page) existing.add(`${c.official_id}::${c.title}`);
    if (page.length < 1000) break;
  }

  let inserted = 0, skipped = 0;
  const misses: string[] = [];

  for (const spec of FILES) {
    if (only && !spec.file.startsWith(only)) continue;
    let rows: SocialCareers[];
    try {
      rows = JSON.parse(readFileSync(join(here, spec.file), 'utf8')) as SocialCareers[];
    } catch {
      console.log(`— ${spec.label}：找不到 ${spec.file}，略過`);
      continue;
    }
    const pool = officials.filter((o) => o.office_type === spec.officeType);
    console.log(`\n## ${spec.label}（${rows.length} 位）`);

    for (const r of rows) {
      // 匹配規則：姓名相符，且 curated 有寫 district 時縣市也要相符。
      // 議員同名的機率遠高於首長，只靠姓名匹配會把職務掛到別人身上——
      // 這正是本站「常見名寧缺勿錯」原則要防的錯誤，故不唯一就略過並列報。
      const county = (String(r.district ?? '').match(/^(.+?[縣市])/) || [])[1] ?? '';
      const cands = pool.filter((o) => o.name === r.name
        && (!county || String(o.district).startsWith(county)));
      if (cands.length !== 1) {
        misses.push(`${spec.label} ${r.name}（${r.district ?? '無選區'}）：名冊匹配 ${cands.length} 筆`);
        continue;
      }
      const officialId = cands[0].id;
      const fresh = r.positions.filter((p) => !existing.has(`${officialId}::${p}`));
      skipped += r.positions.length - fresh.length;
      if (fresh.length === 0) continue;

      if (DRY_RUN) {
        console.log(`✓(dry) ${r.name}：新增 ${fresh.length} 筆`);
        for (const p of fresh) console.log('        ', p);
        inserted += fresh.length;
        continue;
      }

      const { data: src, error: se } = await sb.from('sources').insert({
        url: r.wikipediaUrl, type: 'wiki', title: `維基百科：${r.wikiTitle ?? r.name}`,
        retrieved_at: new Date().toISOString().slice(0, 10),
      }).select('id').single();
      if (se) throw new Error(`source insert failed (${r.name}): ${se.message}`);

      for (const p of fresh) {
        // organization 留空、日期留空：條目多半只寫職務名稱，沒有可靠起訖日。
        // start_date 為 NOT NULL（見 supabase/migrations/0001_init.sql），沿用既有資料的
        // 空字串慣例表示「無日期」。檔案頁的 careerPeriod() 因此不顯示期間——不會誤稱現任。
        const { error } = await sb.from('careers').insert({
          official_id: officialId, title: p, organization: '',
          start_date: '', end_date: null, source_id: src.id,
        });
        if (error) throw new Error(`career insert failed (${r.name} / ${p}): ${error.message}`);
        existing.add(`${officialId}::${p}`);
        inserted++;
      }
      console.log(`✓ ${r.name}：新增 ${fresh.length} 筆`);
    }
  }

  console.log(`\n完成：新增 ${inserted} 筆、已存在略過 ${skipped} 筆${DRY_RUN ? '（DRY_RUN，未寫入）' : ''}`);
  if (misses.length) {
    console.log(`\n⚠️ 名冊未唯一匹配、未寫入（${misses.length} 筆）：`);
    for (const m of misses) console.log('  -', m);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
