// 外部人物 → 維基條目 對照候選。撈 DB 全部 entities，逐人用維基搜尋 API 找同名條目、
// 取導言前 200 字，輸出到 scraper/out-wiki-relations/resolve.json 供人工比對。
// 不寫 DB、不寫 entities-wiki.json——對照必須由人比對 description 與導言後手寫。
//   pnpm run wiki:resolve-entities
//   ONLY=柯文哲,朱立倫 pnpm run wiki:resolve-entities
import { createClient } from '@supabase/supabase-js';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { loadEnv } from './lib/loadEnv';
import { fetchPolite } from './lib/fetchPolite';
import { wikitextToSummary } from './lib/wiki';
import { loadEntitiesWiki, indexEntitiesWiki, entityWikiKey } from './lib/entitiesWiki';

loadEnv();
const here = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(here, 'out-wiki-relations');
const API = 'https://zh.wikipedia.org/w/api.php';
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function apiJson(params: Record<string, string>): Promise<any> {
  const res = await fetchPolite(`${API}?${new URLSearchParams({ ...params, format: 'json' })}`);
  return res.json();
}

async function searchTitles(name: string): Promise<string[]> {
  const j = await apiJson({ action: 'query', list: 'search', srsearch: name, srlimit: '5' });
  return ((j?.query?.search ?? []) as { title: string }[]).map((s) => s.title);
}

async function leadOf(title: string): Promise<string> {
  const j = await apiJson({ action: 'parse', page: title, prop: 'wikitext', section: '0', redirects: '1' });
  return wikitextToSummary(j?.parse?.wikitext?.['*'] ?? '', 200);
}

async function main() {
  const url = process.env.PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Missing PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  const sb = createClient(url, key);
  mkdirSync(OUT_DIR, { recursive: true });

  const known = indexEntitiesWiki(loadEntitiesWiki());
  const only = process.env.ONLY ? new Set(process.env.ONLY.split(',')) : null;

  const { data, error } = await sb.from('entities').select('name, entity_type, description').order('name');
  if (error) throw new Error(`entities query failed: ${error.message}`);
  const entities = (data ?? []) as { name: string; entity_type: string; description: string }[];

  const out: { name: string; entity_type: string; description: string; candidates: { title: string; lead: string }[] }[] = [];
  let skipped = 0;
  for (const e of entities) {
    if (only && !only.has(e.name)) continue;
    // 已對照者跳過。DB 沒有 distinct 欄位，只能用 name 判斷「這個姓名已有任一筆對照」；
    // 同名不同人的第二筆要人工用 ONLY= 強制重跑。
    if (known.has(entityWikiKey(e.name)) || [...known.keys()].some((k) => k.startsWith(`${e.name}::`))) { skipped++; continue; }
    const titles = await searchTitles(e.name);
    await sleep(500);
    const candidates: { title: string; lead: string }[] = [];
    for (const t of titles) {
      // 只看標題含姓名的條目，其餘搜尋命中多為無關頁面
      if (!t.includes(e.name)) continue;
      candidates.push({ title: t, lead: await leadOf(t) });
      await sleep(500);
    }
    out.push({ name: e.name, entity_type: e.entity_type, description: e.description, candidates });
    console.log(`${candidates.length ? '·' : '—'} ${e.name}（${e.description}）→ ${candidates.map((c) => c.title).join(' / ') || '查無'}`);
  }
  writeFileSync(join(OUT_DIR, 'resolve.json'), JSON.stringify(out, null, 2));
  console.log(`\n輸出 ${out.length} 人（已對照跳過 ${skipped}）→ scraper/out-wiki-relations/resolve.json`);
  console.log('下一步：逐筆比對 description 與 lead，確認同一人才寫入 scraper/entities-wiki.json。');
}

main().catch((e) => { console.error(e); process.exit(1); });
