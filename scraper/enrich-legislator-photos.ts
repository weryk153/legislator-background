// 立委大頭貼 enrich：立法院開放資料（ly.govapi.tw）每位委員都有「照片位址」欄位，
// 指向 www.ly.gov.tw 官方肖像。下載 → sharp 縮為 320px 寬縮圖存入 public/photos/legislators/
// → 將 officials.photo_url 設為本地路徑（hotlink 立院圖會在對方改版/防盜連時整批破圖，故落地）。
// 可重跑；支援 ONLY=王世堅,韓國瑜 與 DRY_RUN=1。
//   pnpm run enrich:photos
import { createClient } from '@supabase/supabase-js';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import sharp from 'sharp';
import { loadEnv } from './lib/loadEnv';

loadEnv();
const here = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(here, '..', 'public', 'photos', 'legislators');
const UA = 'legislator-background-bot/1.0 (public-data; +https://github.com/weryk153/legislator-background)';
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ly API 以「委員姓名」查詢；原民立委名字帶羅馬拼音尾綴（伍麗華Saidhai‧Tahovecahe），
// 先用全名查，查不到再退回純中文前綴。
const chinesePrefix = (name: string): string => {
  const m = name.match(/^[一-鿿・·‧]+/);
  return m ? m[0] : name;
};

async function fetchPhotoUrl(name: string): Promise<string | null> {
  for (const q of [name, chinesePrefix(name)]) {
    for (let a = 0; a < 3; a++) {
      try {
        await sleep(a ? 1500 : 0);
        const url = `https://ly.govapi.tw/v2/legislators?${new URLSearchParams({ 屆: '11', 委員姓名: q })}`;
        const r = await fetch(url, { headers: { 'user-agent': UA } });
        const j = await r.json();
        const leg = (j?.legislators ?? [])[0];
        const p = leg?.照片位址 ? String(leg.照片位址).trim() : '';
        if (p) return p.replace(/(?<!:)\/\//g, '/'); // 修掉 www.ly.gov.tw//Images 的重複斜線
      } catch { /* retry */ }
    }
    if (q !== name) break;
  }
  return null;
}

async function main() {
  const sb = createClient(process.env.PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  mkdirSync(OUT_DIR, { recursive: true });

  const only = process.env.ONLY ? process.env.ONLY.split(',') : null;
  const { data, error } = await sb.from('officials')
    .select('id, slug, name').eq('office_type', 'legislator').order('name');
  if (error) throw new Error(`officials query failed: ${error.message}`);
  let list = (data as { id: string; slug: string; name: string }[]);
  if (only) list = list.filter((o) => only.includes(o.name));

  let ok = 0, miss = 0, fail = 0;
  for (const off of list) {
    const photoUrl = await fetchPhotoUrl(off.name);
    if (!photoUrl) { miss++; console.log('—', off.name, '查無照片位址'); continue; }
    try {
      const res = await fetch(photoUrl, { headers: { 'user-agent': UA } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const buf = Buffer.from(await res.arrayBuffer());
      // 直幅肖像縮為 320px 寬（list 小頭像＋檔案頁皆夠用），mozjpeg 壓縮。
      const thumb = await sharp(buf).rotate().resize({ width: 320, withoutEnlargement: true })
        .jpeg({ quality: 80, mozjpeg: true }).toBuffer();
      if (process.env.DRY_RUN) { console.log('✓(dry)', off.name, `${(thumb.length / 1024).toFixed(0)}KB`); ok++; continue; }
      writeFileSync(join(OUT_DIR, `${off.slug}.jpg`), thumb);
      const localPath = `/photos/legislators/${off.slug}.jpg`;
      const { error: ue } = await sb.from('officials').update({ photo_url: localPath }).eq('id', off.id);
      if (ue) throw new Error(`db update: ${ue.message}`);
      ok++; console.log('✓', off.name, '→', localPath, `${(thumb.length / 1024).toFixed(0)}KB`);
    } catch (e) {
      fail++; console.log('✗', off.name, e instanceof Error ? e.message : String(e));
    }
    await sleep(400);
  }
  console.log(`\n完成：成功 ${ok}、查無 ${miss}、失敗 ${fail}（共 ${list.length}）`);
}

main().catch((e) => { console.error(e); process.exit(1); });
