// 縣市首長的社會團體／財團法人職務匯入（scraper/mayor-social-careers.json）。
//
// 為什麼要另做一支：立委的這類職務隨立法院開放資料的「經歷」欄位而來（見 adapters/ly.ts），
// 但首長沒有對等的官方來源——enrich-mayor-careers.ts 只讀維基 infobox 的 office/term 欄位，
// 那裡僅有公職。社團職務散在條目的 past 欄位與內文敘述裡，只能人工讀過後逐筆審定，
// 故比照 relationships-curated.json 的做法：資料進版控、腳本只負責寫入。
//
// 冪等：以 (official_id, title) 判斷，已存在者跳過，可重複執行。
//   pnpm run import:mayor-careers
//   DRY_RUN=1 pnpm run import:mayor-careers
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { loadEnv } from './lib/loadEnv';

loadEnv();
const here = dirname(fileURLToPath(import.meta.url));
const DRY_RUN = !!process.env.DRY_RUN;

interface MayorSocialCareers {
  name: string;
  wikiTitle: string;
  wikipediaUrl: string;
  positions: string[];
}

async function main() {
  const url = process.env.PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Missing PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  const sb = createClient(url, key);

  const rows = JSON.parse(
    readFileSync(join(here, 'mayor-social-careers.json'), 'utf8'),
  ) as MayorSocialCareers[];

  const { data: offs, error: oe } = await sb
    .from('officials').select('id, name').eq('office_type', 'mayor_magistrate');
  if (oe) throw new Error(`officials query failed: ${oe.message}`);
  const byName = new Map<string, string[]>();
  for (const o of (offs ?? []) as { id: string; name: string }[]) {
    (byName.get(o.name) ?? byName.set(o.name, []).get(o.name)!).push(o.id);
  }

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
  for (const r of rows) {
    const ids = byName.get(r.name) ?? [];
    // 唯一匹配才寫入——同名首長在名冊裡不該出現，真出現時寧可略過並列報。
    if (ids.length !== 1) { misses.push(`${r.name}（名冊匹配 ${ids.length} 筆）`); continue; }
    const officialId = ids[0];

    const fresh = r.positions.filter((p) => !existing.has(`${officialId}::${p}`));
    if (fresh.length === 0) { skipped += r.positions.length; continue; }

    if (DRY_RUN) {
      console.log(`✓(dry) ${r.name}：新增 ${fresh.length} 筆／已存在 ${r.positions.length - fresh.length} 筆`);
      for (const p of fresh) console.log('        ', p);
      inserted += fresh.length;
      skipped += r.positions.length - fresh.length;
      continue;
    }

    const { data: src, error: se } = await sb.from('sources').insert({
      url: r.wikipediaUrl, type: 'wiki', title: `維基百科：${r.wikiTitle}`,
      retrieved_at: new Date().toISOString().slice(0, 10),
    }).select('id').single();
    if (se) throw new Error(`source insert failed (${r.name}): ${se.message}`);

    for (const p of fresh) {
      // organization 留空、日期留空：條目多半只寫職務名稱，沒有可靠起訖日。
      // 檔案頁的 careerPeriod() 會因此不顯示期間——不會誤稱為「現任」。
      const { error } = await sb.from('careers').insert({
        official_id: officialId, title: p, organization: '',
        // start_date 為 NOT NULL（見 supabase/migrations/0001_init.sql），沿用既有資料的
        // 空字串慣例表示「無日期」；end_date 可為 null。
        start_date: '', end_date: null, source_id: src.id,
      });
      if (error) throw new Error(`career insert failed (${r.name} / ${p}): ${error.message}`);
      inserted++;
    }
    skipped += r.positions.length - fresh.length;
    console.log(`✓ ${r.name}：新增 ${fresh.length} 筆`);
  }

  console.log(`\n完成：新增 ${inserted} 筆、已存在略過 ${skipped} 筆${DRY_RUN ? '（DRY_RUN，未寫入）' : ''}`);
  if (misses.length) {
    console.log(`\n⚠️ 名冊未唯一匹配、未寫入（${misses.length} 位）：`);
    for (const m of misses) console.log('  -', m);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
