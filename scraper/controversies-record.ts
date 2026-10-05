// 爭議記錄 — 把「使用者已在審核頁核准」的爭議寫入 DB（去重＋附來源）。
//
// 來源：scraper/controversies-confirmed.json。每筆由查證代理找出、使用者逐筆核准後才放進來；
// 本腳本只負責安全寫入，不判斷內容。比照 judgments-record.ts。
//
// 去重鍵：official_id + 正規化標題（同人同事件不重覆插入）。可重跑。
//   pnpm run controversies:record            # 寫入
//   DRY_RUN=1 pnpm run controversies:record  # 只檢查不寫
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { loadEnv } from './lib/loadEnv';
import { validateControversy, sourceTypeOf, dedupeKey, type ConfirmedControversy } from './lib/controversy-record-lib';

loadEnv();
const here = dirname(fileURLToPath(import.meta.url));
const DRY_RUN = !!process.env.DRY_RUN;
const today = new Date().toISOString().slice(0, 10);

async function main() {
  const sb = createClient(process.env.PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const rows = JSON.parse(readFileSync(join(here, 'controversies-confirmed.json'), 'utf8')) as ConfirmedControversy[];

  let inserted = 0, dup = 0, skipped = 0;
  for (const r of rows) {
    const v = validateControversy(r);
    if (!v.ok) { skipped++; console.log('⤫', r.slug, r.title, '驗證失敗:', v.errors.join('; ')); continue; }

    const { data: off, error: oe } = await sb.from('officials').select('id, name').eq('slug', r.slug).maybeSingle();
    if (oe) throw new Error(`officials query failed: ${oe.message}`);
    if (!off) { skipped++; console.log('⤫', r.slug, '查無此檔案'); continue; }

    const { data: existing, error: ee } = await sb.from('controversies').select('title').eq('official_id', off.id);
    if (ee) throw new Error(`controversies query failed: ${ee.message}`);
    const key = dedupeKey(off.id, r.title);
    if ((existing ?? []).some((e: { title: string }) => dedupeKey(off.id, e.title) === key)) {
      dup++; console.log('=', off.name, r.title, '已存在'); continue;
    }

    if (DRY_RUN) { inserted++; console.log('✓(dry)', off.name, r.title, `(${r.status}, ${r.sources.length} 來源)`); continue; }

    const { data: c, error: ce } = await sb.from('controversies').insert({
      official_id: off.id, title: r.title, summary: r.summary, status: r.status,
      event_date: r.event_date, report_date: today,
    }).select('id').single();
    if (ce) throw new Error(`controversy insert failed (${off.name} ${r.title}): ${ce.message}`);
    for (const s of r.sources) {
      const { data: src, error: se } = await sb.from('sources')
        .insert({ url: s.url, title: s.title, type: sourceTypeOf(s.url), retrieved_at: today }).select('id').single();
      if (se) throw new Error(`source insert failed: ${se.message}`);
      const { error: le } = await sb.from('controversy_sources').insert({ controversy_id: c.id, source_id: src.id });
      if (le) throw new Error(`controversy_sources insert failed: ${le.message}`);
    }
    inserted++; console.log('●', off.name, r.title);
  }
  console.log(`\n完成：${DRY_RUN ? '(dry) ' : ''}寫入 ${inserted}、已存在 ${dup}、略過 ${skipped}（共 ${rows.length} 筆）`);
  if (!DRY_RUN && inserted) console.log('記得跑 pnpm run export:data。');
  if (skipped) process.exitCode = 1;
}

main().catch((e) => { console.error(e); process.exit(1); });
