// 2 度關係候選：對 scraper/entities-wiki.json 每一位抓整頁 wikitext，解析 infobox 關係欄位與
// 關鍵句，輸出到 scraper/out-wiki-relations/<name>.json 供人工審定。只走一跳，不遞迴。
// 不寫 DB、不寫 curated——關係只能由人審定後追加到 relationships-curated.json。
//   pnpm run wiki:discover-relations
//   FORCE=1 pnpm run wiki:discover-relations      # 重抓已有輸出者
//   ONLY=柯文哲,朱立倫 pnpm run wiki:discover-relations
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { fetchPolite } from './lib/fetchPolite';
import { loadEntitiesWiki, photoFileName } from './lib/entitiesWiki';
import { parseInfoboxRelations, extractRelationSentences } from './lib/wikiRelations';

const here = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(here, 'out-wiki-relations');
const API = 'https://zh.wikipedia.org/w/api.php';
const FORCE = !!process.env.FORCE;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function fetchWikitext(title: string): Promise<string | null> {
  const res = await fetchPolite(`${API}?${new URLSearchParams({ action: 'parse', page: title, prop: 'wikitext', redirects: '1', format: 'json' })}`);
  const j = await res.json();
  return j?.parse?.wikitext?.['*'] ?? null;
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  const rows = loadEntitiesWiki();
  const only = process.env.ONLY ? new Set(process.env.ONLY.split(',')) : null;
  const retrievedAt = new Date().toISOString().slice(0, 10);

  let done = 0, skip = 0, fail = 0, totalInfobox = 0, totalSentences = 0;
  for (const r of rows) {
    if (only && !only.has(r.name)) continue;
    const outFile = join(OUT_DIR, photoFileName(r.name, r.distinct).replace(/\.jpg$/, '.json'));
    if (!FORCE && existsSync(outFile)) { skip++; continue; }
    try {
      const wt = await fetchWikitext(r.wikiTitle);
      await sleep(500);
      if (!wt) { fail++; console.log('✗', r.name, '查無 wikitext'); continue; }
      const infobox = parseInfoboxRelations(wt);
      const sentences = extractRelationSentences(wt);
      writeFileSync(outFile, JSON.stringify({
        subject: r.name, distinct: r.distinct ?? '', wikipediaUrl: r.wikipediaUrl, retrievedAt, infobox, sentences,
      }, null, 2));
      done++; totalInfobox += infobox.length; totalSentences += sentences.length;
      console.log('✓', r.name, `infobox ${infobox.length}、句 ${sentences.length}`);
    } catch (e) {
      fail++; console.log('✗', r.name, e instanceof Error ? e.message : String(e));
    }
  }
  console.log(`\n完成：${done} 人（跳過 ${skip}、失敗 ${fail}）；infobox 項目 ${totalInfobox}、關鍵句 ${totalSentences} → scraper/out-wiki-relations/`);
  console.log('下一步：逐檔審定，追加到 scraper/relationships-curated.json（subjectKind: "entity"）。');
}

main().catch((e) => { console.error(e); process.exit(1); });
