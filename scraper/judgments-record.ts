// 判決記錄輔助 — 把「已人工確認」的判決寫入 DB（去重＋附 court 來源）。
//
// 來源：scraper/judgments-confirmed.json（人工開司法院全文、確認身分＋主文後填寫）。
// 每筆需自行確認：身分(公眾人物/職稱/共同被告)、主文結果、是否定讞。本腳本只負責安全寫入。
//
// 去重鍵：official_id + 正規化 case_number（同人同字號不重覆插入）。可重跑。
//   pnpm run judgments:record            # 寫入
//   DRY_RUN=1 pnpm run judgments:record  # 只檢查不寫
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { loadEnv } from './lib/loadEnv';

loadEnv();
const here = dirname(fileURLToPath(import.meta.url));

type Confirmed = {
  name: string; case_reason: string; court: string; case_number: string;
  outcome: string; is_final: boolean; judgment_date: string; judgment_url: string;
};

const REQUIRED: (keyof Confirmed)[] = ['name', 'case_reason', 'court', 'case_number', 'outcome', 'judgment_date', 'judgment_url'];
const normNo = (s: string) => s.replace(/\s+/g, '').replace(/台/g, '臺');

async function main() {
  const sb = createClient(process.env.PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const rows = JSON.parse(readFileSync(join(here, 'judgments-confirmed.json'), 'utf8')) as Confirmed[];

  // 名冊：立委＋首長 name → id[]（同名不唯一者標記，避免錯掛）
  const { data: offs, error } = await sb.from('officials')
    .select('id, name, office_type').in('office_type', ['legislator', 'mayor_magistrate', 'councilor']);
  if (error) throw new Error(`officials query failed: ${error.message}`);
  const byName = new Map<string, string[]>();
  for (const o of offs as { id: string; name: string }[]) (byName.get(o.name) ?? byName.set(o.name, []).get(o.name)!).push(o.id);

  let inserted = 0, dup = 0, skipped = 0;
  for (const r of rows) {
    const miss = REQUIRED.filter((k) => !String(r[k] ?? '').trim());
    if (miss.length) { skipped++; console.log('⤫', r.name || '(無名)', '缺欄位:', miss.join(',')); continue; }
    const ids = byName.get(r.name) ?? [];
    if (ids.length !== 1) { skipped++; console.log('⤫', r.name, ids.length === 0 ? '查無此立委/首長' : '同名多筆，需消歧'); continue; }
    const officialId = ids[0];

    // 去重：同人同字號已存在則跳過
    const { data: existing } = await sb.from('judgments').select('case_number').eq('official_id', officialId);
    if ((existing ?? []).some((e: any) => normNo(e.case_number) === normNo(r.case_number))) {
      dup++; console.log('=', r.name, r.case_number, '已存在，跳過'); continue;
    }
    if (process.env.DRY_RUN) { inserted++; console.log('✓(dry)', r.name, r.case_number); continue; }

    const { data: src, error: se } = await sb.from('sources')
      .insert({ url: r.judgment_url, type: 'court', title: `司法院裁判書 ${r.case_number}`, retrieved_at: '2026-06-26' })
      .select('id').single();
    if (se) { skipped++; console.log('✗', r.name, 'source:', se.message); continue; }
    const { error: je } = await sb.from('judgments').insert({
      official_id: officialId, case_reason: r.case_reason, court: r.court, case_number: r.case_number,
      outcome: r.outcome, is_final: !!r.is_final, judgment_date: r.judgment_date, judgment_url: r.judgment_url, source_id: src.id,
    });
    if (je) { skipped++; console.log('✗', r.name, je.message); continue; }
    inserted++; console.log('●', r.name, r.case_number, '→', r.case_reason);
  }
  console.log(`\n完成：新增 ${inserted}、已存在 ${dup}、略過 ${skipped}（共 ${rows.length}）`);
  if (!process.env.DRY_RUN && inserted) console.log('記得 pnpm run export:data 重匯出 officials.json。');
}

main().catch((e) => { console.error(e); process.exit(1); });
