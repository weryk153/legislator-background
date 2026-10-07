// 2026 縣市長參選人（office_type=candidate）照片：依 scraper/candidate-photos-wiki.json
// 逐人取維基條目主圖 → 查 Commons 授權（只收 CC／公有領域／政府開放授權）→ 縮 320px 寬
// → public/photos/candidates/<slug>.jpg → 寫 officials.photo_url，並把 photo{…} 寫回對照表
// （署名由站上從對照表讀取顯示，CC BY／CC BY-SA 須標示作者與授權）。
//
// 對照表只收人工查證過的條目（同名者多，不得以裸名去抓）；查證依據寫在 verifiedBy。
// 沒有維基條目的參選人，等中選會 2026 選舉公報上網後另行補齊。
//
// 冪等：已有 photo 且檔案存在 → 跳過；noPhoto: true → 跳過（人工判定主圖不是本人）。
//   pnpm run enrich:candidate-photos
//   DRY_RUN=1 pnpm run enrich:candidate-photos   # 只報告會抓哪張圖、授權為何，不寫檔不寫 DB
//   FORCE=1  pnpm run enrich:candidate-photos    # 重抓已有照片者
import { createClient } from '@supabase/supabase-js';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { loadEnv } from './lib/loadEnv';
import { fetchWikiPhoto } from './lib/wikiPhoto';
import {
  CANDIDATE_PHOTOS_PATH, CANDIDATE_PHOTO_DIR_URL, loadCandidatePhotos, type CandidatePhoto,
} from '../src/lib/candidatePhotos';

loadEnv();
const here = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(here, '..', 'public', 'photos', 'candidates');
const DRY_RUN = !!process.env.DRY_RUN;
const FORCE = !!process.env.FORCE;

async function main() {
  const sb = createClient(process.env.PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  mkdirSync(OUT_DIR, { recursive: true });
  const rows = loadCandidatePhotos();

  let ok = 0, skip = 0, miss = 0, fail = 0;
  for (const r of rows) {
    if (r.noPhoto) { skip++; continue; }
    const fileName = `${r.slug}.jpg`;
    if (!FORCE && r.photo && existsSync(join(OUT_DIR, fileName))) { skip++; continue; }
    try {
      const res = await fetchWikiPhoto(r.wikiTitle);
      if (!res.ok) { miss++; console.log('—', r.name, res.reason); continue; }
      const { thumb, ...meta } = res.photo;
      const photo: CandidatePhoto['photo'] = {
        file: `${CANDIDATE_PHOTO_DIR_URL}${fileName}`, author: meta.author, license: meta.license, commonsUrl: meta.commonsUrl,
      };
      if (DRY_RUN) {
        console.log('✓(dry)', r.name, '←', meta.file, `${(thumb.length / 1024).toFixed(0)}KB`, `[${photo!.license}｜${photo!.author}]`);
        ok++; continue;
      }
      const { data, error } = await sb.from('officials').update({ photo_url: photo!.file })
        .eq('slug', r.slug).eq('office_type', 'candidate').select('id');
      if (error) throw new Error(`db update: ${error.message}`);
      if (!data?.length) throw new Error(`DB 查無 office_type=candidate 的 ${r.slug}`);
      writeFileSync(join(OUT_DIR, fileName), thumb);
      r.photo = photo;
      ok++; console.log('✓', r.name, '→', photo!.file, `[${photo!.license}｜${photo!.author}]`);
    } catch (e) {
      fail++; console.log('✗', r.name, e instanceof Error ? e.message : String(e));
    }
  }
  if (!DRY_RUN) writeFileSync(CANDIDATE_PHOTOS_PATH, JSON.stringify(rows, null, 2) + '\n');
  console.log(`\n完成：成功 ${ok}、跳過 ${skip}、無圖/授權不符 ${miss}、失敗 ${fail}${DRY_RUN ? '（DRY_RUN，未寫檔）' : ''}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
