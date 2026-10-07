// 維基條目主圖 → Commons 授權檢查 → 320px 寬 jpg 縮圖。enrich-entity-photos 與
// enrich-candidate-photos 共用：條目怎麼找、授權怎麼判、縮圖怎麼做只有這一份。
import sharp from 'sharp';
import { fetchPolite } from './fetchPolite';
import { pickLicense, type ExtMetadata } from './commonsLicense';

const API = 'https://zh.wikipedia.org/w/api.php';
const COMMONS_API = 'https://commons.wikimedia.org/w/api.php';
const UA = 'legislator-background-bot/1.0 (public-data; +https://github.com/weryk153/legislator-background)';
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export interface WikiPhoto {
  thumb: Buffer;       // 已縮好的 jpg
  file: string;        // Commons 檔名（不含 File:）
  author: string;
  license: string;
  commonsUrl: string;
}
export type WikiPhotoResult = { ok: true; photo: WikiPhoto } | { ok: false; reason: string };

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

/** 取條目主圖並檢查授權；無圖、SVG、授權不符時回 ok:false 與原因（不丟錯）。網路錯誤照常丟出。 */
export async function fetchWikiPhoto(wikiTitle: string): Promise<WikiPhotoResult> {
  const img = await fetchPageImage(wikiTitle);
  await sleep(500);
  if (!img) return { ok: false, reason: '無主圖' };
  if (/\.svg$/i.test(img.file)) return { ok: false, reason: `主圖為 SVG，跳過：${img.file}` };
  const verdict = pickLicense(await fetchExtMetadata(img.file));
  await sleep(500);
  if (!verdict.ok) return { ok: false, reason: `${verdict.reason} (${img.file})` };

  const buf = await download(img.url);
  const thumb = await sharp(buf).rotate().resize({ width: 320, withoutEnlargement: true })
    .jpeg({ quality: 80, mozjpeg: true }).toBuffer();
  return {
    ok: true,
    photo: {
      thumb, file: img.file, author: verdict.author, license: verdict.license,
      commonsUrl: `https://commons.wikimedia.org/wiki/File:${encodeURIComponent(img.file.replace(/ /g, '_'))}`,
    },
  };
}
