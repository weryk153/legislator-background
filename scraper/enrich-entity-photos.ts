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
import sharp from 'sharp';
import { fetchPolite } from './lib/fetchPolite';
import { pickLicense, type ExtMetadata } from './lib/commonsLicense';
import {
  loadEntitiesWiki, photoFileName, PHOTO_DIR_URL, ENTITIES_WIKI_PATH, type EntityWiki,
} from './lib/entitiesWiki';

const here = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(here, '..', 'public', 'photos', 'entities');
const API = 'https://zh.wikipedia.org/w/api.php';
const COMMONS_API = 'https://commons.wikimedia.org/w/api.php';
const UA = 'legislator-background-bot/1.0 (public-data; +https://github.com/weryk153/legislator-background)';
const DRY_RUN = !!process.env.DRY_RUN;
const FORCE = !!process.env.FORCE;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function apiJson(base: string, params: Record<string, string>): Promise<any> {
  const res = await fetchPolite(`${base}?${new URLSearchParams({ ...params, format: 'json' })}`);
  return res.json();
}

// 條目主圖：原圖 URL 與檔名（File:…）。無主圖 → null。
async function fetchPageImage(title: string): Promise<{ url: string; file: string } | null> {
  const j = await apiJson(API, { action: 'query', prop: 'pageimages', piprop: 'original|name', redirects: '1', titles: title });
  const page = Object.values(j?.query?.pages ?? {})[0] as { original?: { source?: string }; pageimage?: string } | undefined;
  if (!page?.original?.source || !page.pageimage) return null;
  return { url: page.original.source, file: page.pageimage };
}

async function fetchExtMetadata(file: string): Promise<ExtMetadata | undefined> {
  const j = await apiJson(COMMONS_API, { action: 'query', prop: 'imageinfo', iiprop: 'extmetadata', titles: `File:${file}` });
  const page = Object.values(j?.query?.pages ?? {})[0] as { imageinfo?: { extmetadata?: ExtMetadata }[] } | undefined;
  return page?.imageinfo?.[0]?.extmetadata;
}

// upload.wikimedia.org 會限流(429)：退避重試，比照 enrich-mayor-photos.ts。
async function download(url: string): Promise<Buffer> {
  for (let a = 0; a < 4; a++) {
    const res = await fetch(url, { headers: { 'user-agent': UA } });
    if (res.ok) return Buffer.from(await res.arrayBuffer());
    if (res.status === 429 || res.status >= 500) { await sleep(2000 * (a + 1)); continue; }
    throw new Error(`HTTP ${res.status}`);
  }
  throw new Error('HTTP 429 (重試後仍限流)');
}

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
      const img = await fetchPageImage(r.wikiTitle);
      await sleep(500);
      if (!img) { miss++; console.log('—', label, '無主圖'); continue; }
      if (/\.svg$/i.test(img.file)) { miss++; console.log('—', label, '主圖為 SVG，跳過：', img.file); continue; }
      const verdict = pickLicense(await fetchExtMetadata(img.file));
      await sleep(500);
      if (!verdict.ok) { miss++; console.log('—', label, verdict.reason, `(${img.file})`); continue; }

      const buf = await download(img.url);
      const thumb = await sharp(buf).rotate().resize({ width: 320, withoutEnlargement: true })
        .jpeg({ quality: 80, mozjpeg: true }).toBuffer();
      const photo: EntityWiki['photo'] = {
        file: `${PHOTO_DIR_URL}${fileName}`, author: verdict.author, license: verdict.license,
        commonsUrl: `https://commons.wikimedia.org/wiki/File:${encodeURIComponent(img.file.replace(/ /g, '_'))}`,
      };
      if (DRY_RUN) {
        console.log('✓(dry)', label, '←', img.file, `${(thumb.length / 1024).toFixed(0)}KB`, `[${photo.license}｜${photo.author}]`);
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
