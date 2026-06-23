// Full asset re-enrichment: rebuild every official's asset declarations using the fixed
// parser (full-declaration scan) + 一般申報-only filter. Replaces each official's asset rows
// with the parseable 一般申報 years (drops misleading partial/amendment years and empty
// old years with no accessible PDF). Concurrency-bounded + polite; safe to re-run.
import { createClient } from '@supabase/supabase-js';
import { loadEnv } from './lib/loadEnv';
import { getDeclarationText, parseDeclaration } from './lib/gazette';

loadEnv();
const UA = 'legislator-background-bot/1.0 (public-data; contact: weryk153@gmail.com)';
const QUERY = 'https://priso.cy.gov.tw/api/Query/QueryData';
const PAGE = 'https://priso.cy.gov.tw/layout/baselist';
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const yearOf = (p: string) => { const m = String(p).match(/民國\s*(\d+)/u); return m ? Number(m[1]) + 1911 : 0; };

async function queryDecls(name: string): Promise<any[]> {
  for (let a = 0; a < 3; a++) {
    try {
      const res = await fetch(QUERY, { method: 'POST', headers: { 'content-type': 'text/json', referer: PAGE, 'user-agent': UA },
        body: JSON.stringify({ Data: { Method: '', Type: 'name', Value: name }, Page: { PageNo: 1, PageSize: 100 } }) });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return (await res.json())?.Data?.Data || [];
    } catch { await sleep(1500); }
  }
  throw new Error('queryDecls failed: ' + name);
}

async function rebuildOne(sb: any, off: { id: string; name: string }) {
  const rows = await queryDecls(off.name); // throws → caller skips (no wipe)
  // 一般申報 only, dedup by year keep highest 期別
  const byYear = new Map<number, any>();
  for (const r of rows) {
    if (!String(r.PublishType ?? '').includes('一般申報')) continue;
    const y = yearOf(r.PublishDate);
    if (!y) continue;
    const cur = byYear.get(y);
    if (!cur || Number(r.Period ?? 0) > Number(cur.Period ?? 0)) byYear.set(y, r);
  }
  const years = [...byYear.entries()].sort((a, b) => b[0] - a[0]);
  const parsed: Array<{ year: number; items: any[] }> = [];
  for (const [y, r] of years) {
    try {
      const txt = await getDeclarationText(String(r.Id));
      const items = parseDeclaration(txt, off.name);
      if (items.length) parsed.push({ year: y, items });
    } catch { /* old/unavailable (資料異常) — skip this year */ }
    await sleep(300);
  }
  if (!parsed.length) return { name: off.name, years: 0, note: 'no parseable 一般申報' };

  // Replace asset data: delete existing declarations (cascade items), insert fresh.
  const { data: src } = await sb.from('sources').insert({
    url: PAGE, type: 'gazette', title: '監察院財產申報公報', retrieved_at: new Date().toISOString().slice(0, 10),
  }).select('id').single();
  await sb.from('asset_declarations').delete().eq('official_id', off.id);
  for (const p of parsed) {
    const { data: decl } = await sb.from('asset_declarations')
      .insert({ official_id: off.id, year: p.year, total_amount: null, source_id: src.id }).select('id').single();
    for (const it of p.items) await sb.from('asset_items').insert({ declaration_id: decl!.id, category: it.category, amount: it.amount, label: it.label ?? null });
  }
  return { name: off.name, years: parsed.length };
}

async function main() {
  const sb = createClient(process.env.PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const only = process.env.ONLY ? process.env.ONLY.split(',') : null;
  const q = sb.from('officials').select('id, name').order('id');
  const { data: offs } = await q;
  let list = offs as { id: string; name: string }[];
  if (only) list = list.filter((o) => only.includes(o.name));
  if (process.env.LIMIT) list = list.slice(0, Number(process.env.LIMIT));
  console.log('officials:', list.length);
  let done = 0, skipped = 0, zero = 0;
  const CONC = 4;
  let i = 0;
  async function worker() {
    while (i < list.length) {
      const off = list[i++];
      try {
        const r = await rebuildOne(sb, off);
        if (r.years === 0) zero++;
      } catch { skipped++; }
      done++;
      if (done % 25 === 0) console.log(`  ${done}/${list.length} (skipped ${skipped}, zero-year ${zero})`);
    }
  }
  await Promise.all(Array.from({ length: CONC }, worker));
  console.log(`DONE: processed ${done}, query-skipped ${skipped}, zero-parseable ${zero}`);
}
main().catch((e) => { console.error(e); process.exit(1); });
