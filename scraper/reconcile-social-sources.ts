// 社團職務的出處對帳：讓資料庫每一筆的來源，與 curated 檔所寫的一致。
//
// 為什麼需要：import-social-careers.ts 的冪等鍵是 (official_id, title)，已存在就跳過——
// 它不會回頭修正來源。早期我把議會官網抓到的職務併進了同一人既有的「維基來源」條目，
// 於是檔案頁在維基百科沒寫的事情底下標了「出處：維基百科」。那是來源說謊，不是小瑕疵。
//
// 本腳本只改 source_id，不新增也不刪除職務。可重複執行。
//   DRY_RUN=1 pnpm exec tsx scraper/reconcile-social-sources.ts
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { loadEnv } from './lib/loadEnv';

loadEnv();
const here = dirname(fileURLToPath(import.meta.url));
const DRY_RUN = !!process.env.DRY_RUN;

interface Entry { name: string; district?: string; wikiTitle?: string; wikipediaUrl: string; sourceTitle?: string; positions: string[] }
const FILES = [
  { file: 'mayor-social-careers.json', officeType: 'mayor_magistrate' },
  { file: 'councilor-social-careers.json', officeType: 'councilor' },
];

const sb = createClient(process.env.PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
async function all<T>(table: string, cols: string): Promise<T[]> {
  const out: T[] = [];
  for (let f = 0; ; f += 1000) {
    const { data, error } = await sb.from(table).select(cols).range(f, f + 999);
    if (error) throw new Error(`${table}: ${error.message}`);
    out.push(...((data ?? []) as T[]));
    if ((data ?? []).length < 1000) break;
  }
  return out;
}

const officials = await all<any>('officials', 'id, name, office_type, district');
const careers = await all<any>('careers', 'id, official_id, title, source_id');
const sources = await all<any>('sources', 'id, url, title, type');
const srcById = new Map(sources.map((s) => [s.id, s]));
const srcByUrl = new Map<string, any>();
for (const s of sources) if (!srcByUrl.has(s.url)) srcByUrl.set(s.url, s);

let fixed = 0, ok = 0, miss = 0;
for (const spec of FILES) {
  const rows = JSON.parse(readFileSync(join(here, spec.file), 'utf8')) as Entry[];
  for (const r of rows) {
    const county = (String(r.district ?? '').match(/^(.+?[縣市])/) || [])[1] ?? '';
    const cands = officials.filter((o) => o.office_type === spec.officeType && o.name === r.name
      && (!county || String(o.district).startsWith(county)));
    if (cands.length !== 1) { miss += r.positions.length; continue; }
    const wantTitle = r.sourceTitle ?? `維基百科：${r.wikiTitle ?? r.name}`;
    for (const p of r.positions) {
      const c = careers.find((x) => x.official_id === cands[0].id && x.title === p);
      if (!c) { miss++; console.log(`缺：${r.name} | ${p}`); continue; }
      if (srcById.get(c.source_id)?.url === r.wikipediaUrl) { ok++; continue; }
      console.log(`改：${r.name} | ${p}\n     ${srcById.get(c.source_id)?.title} → ${wantTitle}`);
      fixed++;
      if (DRY_RUN) continue;
      let src = srcByUrl.get(r.wikipediaUrl);
      if (!src) {
        const { data, error } = await sb.from('sources').insert({
          url: r.wikipediaUrl, type: r.sourceTitle ? 'gov' : 'wiki', title: wantTitle,
          retrieved_at: new Date().toISOString().slice(0, 10),
        }).select('id, url, title, type').single();
        if (error) throw new Error(`source insert (${r.name}): ${error.message}`);
        src = data; srcByUrl.set(src.url, src); srcById.set(src.id, src);
      }
      const { error } = await sb.from('careers').update({ source_id: src.id }).eq('id', c.id);
      if (error) throw new Error(`career update (${r.name} / ${p}): ${error.message}`);
    }
  }
}
console.log(`\n出處相符 ${ok} 筆、改正 ${fixed} 筆、資料庫查無 ${miss} 筆${DRY_RUN ? '（DRY_RUN）' : ''}`);
