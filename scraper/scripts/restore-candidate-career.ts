// 補回 enrich-mayor-careers 清掉的「2026 ○○市長候選人」那筆 career。
// 該腳本寫入前會先刪光此人既有 careers；roster-record 的 add 遇到已存在的檔案會跳過，
// 重跑也補不回來，所以另寫這支只補參選那一筆。
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { loadEnv } from '../lib/loadEnv';

loadEnv();
const sb = createClient(process.env.PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const ops = (JSON.parse(readFileSync('scraper/roster-confirmed.json', 'utf8')) as any[])
  .filter((o) => o.op === 'add' && o.office_type === 'candidate');
const only = (process.env.ONLY ?? '').split(',').filter(Boolean);

for (const op of ops.filter((o) => only.length === 0 || only.includes(o.name))) {
  const { data: off } = await sb.from('officials').select('id').eq('slug', `cand-${op.name}-${op.district}`).single();
  if (!off) { console.log('✗', op.name, '查無檔案'); continue; }
  const { data: has } = await sb.from('careers').select('id').eq('official_id', off.id).eq('title', op.career_title);
  if ((has ?? []).length) { console.log('=', op.name, '已有參選 career'); continue; }
  const { data: src } = await sb.from('sources').insert({ url: op.source_url, type: 'gov', title: op.source_title, retrieved_at: '2026-10-05' }).select('id').single();
  await sb.from('careers').insert({ official_id: off.id, title: op.career_title, organization: op.career_org, start_date: op.start_date, end_date: null, source_id: src!.id });
  console.log('✓', op.name);
}
