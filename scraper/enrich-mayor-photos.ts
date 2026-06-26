// 縣市首長大頭貼 enrich：首長無立法院那種開放資料 API，最穩定的肖像來源是維基百科
// 條目信息框照片（Wikimedia Commons）。用 MediaWiki pageimages API 取信息框主圖 →
// sharp 縮 320px 寬 → 落地 public/photos/mayors/{slug}.jpg → 寫 officials.photo_url。
//
// 授權注意：Commons 圖多為 CC-BY-SA／公有領域，嚴格說 CC-BY-SA 需標示作者出處。
// 本站已於頁尾標註「資料來源含維基百科」；若要完全合規可再補逐張作者標示。
//
// 可重跑；支援 ONLY=楊文科,張善政 與 DRY_RUN=1。
//   pnpm run enrich:mayor-photos
import { createClient } from '@supabase/supabase-js';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import sharp from 'sharp';
import { loadEnv } from './lib/loadEnv';

loadEnv();
const here = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(here, '..', 'public', 'photos', 'mayors');
const UA = 'legislator-background-bot/1.0 (public-data; +https://github.com/weryk153/legislator-background)';
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// 同名消歧：維基條目名不等於姓名時，指向特定條目（沿用 enrich-mayor-careers 的對照）。
const PAGE: Record<string, string> = { 許淑華: '許淑華 (1975年)', 王忠銘: '王忠銘 (中華民國)' };

async function fetchInfoboxImage(page: string): Promise<string | null> {
  const url = 'https://zh.wikipedia.org/w/api.php?' + new URLSearchParams({
    action: 'query', prop: 'pageimages', piprop: 'thumbnail', pithumbsize: '400',
    format: 'json', redirects: '1', titles: page,
  });
  for (let a = 0; a < 3; a++) {
    try {
      await sleep(a ? 2000 : 0);
      const r = await fetch(url, { headers: { 'user-agent': UA } });
      const j = await r.json();
      const pages = j?.query?.pages ?? {};
      const first = Object.values(pages)[0] as { thumbnail?: { source?: string } } | undefined;
      if (first?.thumbnail?.source) return first.thumbnail.source;
      return null; // 查到條目但無圖
    } catch { /* retry */ }
  }
  return null;
}

async function main() {
  const sb = createClient(process.env.PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  mkdirSync(OUT_DIR, { recursive: true });

  const only = process.env.ONLY ? process.env.ONLY.split(',') : null;
  const { data, error } = await sb.from('officials')
    .select('id, slug, name').eq('office_type', 'mayor_magistrate').order('name');
  if (error) throw new Error(`officials query failed: ${error.message}`);
  let list = (data as { id: string; slug: string; name: string }[]);
  if (only) list = list.filter((o) => only.includes(o.name));

  let ok = 0, miss = 0, fail = 0;
  for (const off of list) {
    const page = PAGE[off.name] ?? off.name;
    const imgUrl = await fetchInfoboxImage(page);
    if (!imgUrl) { miss++; console.log('—', off.name, '維基無信息框照片'); continue; }
    try {
      // upload.wikimedia.org 會限流(429)：退避重試。
      let buf: Buffer | null = null;
      for (let a = 0; a < 4; a++) {
        const res = await fetch(imgUrl, { headers: { 'user-agent': UA } });
        if (res.ok) { buf = Buffer.from(await res.arrayBuffer()); break; }
        if (res.status === 429 || res.status >= 500) { await sleep(2000 * (a + 1)); continue; }
        throw new Error(`HTTP ${res.status}`);
      }
      if (!buf) throw new Error('HTTP 429 (重試後仍限流)');
      const thumb = await sharp(buf).rotate().resize({ width: 320, withoutEnlargement: true })
        .jpeg({ quality: 80, mozjpeg: true }).toBuffer();
      if (process.env.DRY_RUN) { console.log('✓(dry)', off.name, '←', imgUrl.split('/').pop(), `${(thumb.length / 1024).toFixed(0)}KB`); ok++; continue; }
      writeFileSync(join(OUT_DIR, `${off.slug}.jpg`), thumb);
      const localPath = `/photos/mayors/${off.slug}.jpg`;
      const { error: ue } = await sb.from('officials').update({ photo_url: localPath }).eq('id', off.id);
      if (ue) throw new Error(`db update: ${ue.message}`);
      ok++; console.log('✓', off.name, '→', localPath, `${(thumb.length / 1024).toFixed(0)}KB`);
    } catch (e) {
      fail++; console.log('✗', off.name, e instanceof Error ? e.message : String(e));
    }
    await sleep(800);
  }
  console.log(`\n完成：成功 ${ok}、查無 ${miss}、失敗 ${fail}（共 ${list.length}）`);
}

main().catch((e) => { console.error(e); process.exit(1); });
