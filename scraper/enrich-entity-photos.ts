// 外部人物照片：依 scraper/entities-wiki.json 逐人取維基條目主圖（pageimages）→ 查 Commons
// 授權（imageinfo extmetadata，只收 CC／公有領域）→ 下載 → sharp 縮 320px 寬 jpg →
// public/photos/entities/<name>.jpg → 把 photo{file,author,license,commonsUrl} 寫回對照表。
// 不碰 DB：photo_url 由 import:relationships 建 entity 時從對照表套上（重匯不會掉）。
//
// 冪等：已有 photo 且檔案存在 → 跳過；noPhoto: true → 跳過（人工判定主圖不是本人）。
//   pnpm run enrich:entity-photos
//   DRY_RUN=1 pnpm run enrich:entity-photos   # 只報告會抓哪張圖、授權為何，不寫檔不改對照表
//   FORCE=1  pnpm run enrich:entity-photos    # 重抓已有照片者
//   ONLY=柯文哲,朱立倫 pnpm run enrich:entity-photos
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { fetchWikiPhoto } from './lib/wikiPhoto';
import {
  loadEntitiesWiki, photoFileName, PHOTO_DIR_URL, ENTITIES_WIKI_PATH, type EntityWiki,
} from './lib/entitiesWiki';

const here = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(here, '..', 'public', 'photos', 'entities');
const DRY_RUN = !!process.env.DRY_RUN;
const FORCE = !!process.env.FORCE;

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  const rows = loadEntitiesWiki();
  const only = process.env.ONLY ? new Set(process.env.ONLY.split(',')) : null;

  let ok = 0, skip = 0, miss = 0, fail = 0;
  for (const r of rows) {
    const label = r.distinct ? `${r.name}（${r.distinct}）` : r.name;
    if (only && !only.has(r.name)) continue;
    if (r.noPhoto) { skip++; continue; }
    const fileName = photoFileName(r.name, r.distinct);
    if (!FORCE && r.photo && existsSync(join(OUT_DIR, fileName))) { skip++; continue; }
    try {
      const res = await fetchWikiPhoto(r.wikiTitle);
      if (!res.ok) { miss++; console.log('—', label, res.reason); continue; }
      const { thumb, ...meta } = res.photo;
      const photo: EntityWiki['photo'] = {
        file: `${PHOTO_DIR_URL}${fileName}`, author: meta.author, license: meta.license, commonsUrl: meta.commonsUrl,
      };
      if (DRY_RUN) {
        console.log('✓(dry)', label, '←', meta.file, `${(thumb.length / 1024).toFixed(0)}KB`, `[${photo.license}｜${photo.author}]`);
        ok++; continue;
      }
      writeFileSync(join(OUT_DIR, fileName), thumb);
      r.photo = photo;
      ok++; console.log('✓', label, '→', photo.file, `[${photo.license}｜${photo.author}]`);
    } catch (e) {
      fail++; console.log('✗', label, e instanceof Error ? e.message : String(e));
    }
  }
  if (!DRY_RUN) writeFileSync(ENTITIES_WIKI_PATH, JSON.stringify(rows, null, 2) + '\n');
  console.log(`\n完成：成功 ${ok}、跳過 ${skip}、無圖/授權不符 ${miss}、失敗 ${fail}${DRY_RUN ? '（DRY_RUN，未寫檔）' : ''}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
