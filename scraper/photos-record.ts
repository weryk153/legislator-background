// 議員照片共用 record — 見 docs/superpowers/specs/2026-07-24-councilor-photos-design.md。
//
// 讀 scraper/out-photos/<縣市>.json（各縣市議會官網蒐集 agent 產出的 manifest，
// gitignored；可能尚未全數到齊——缺檔僅列入「missing」統計，不視為錯誤）→ 逐縣市用
// scraper/lib/photos.ts 的 matchManifest 比對現任議員 → 下載命中的照片 → sharp 縮 320px
// 寬 jpg → public/photos/councilors/<slug>.jpg → officials.photo_url。
//
// 冪等（可重跑）：officials.photo_url 已設值且對應檔案已存在 → 跳過該人（FORCE=1 強制覆蓋重抓）。
// DRY_RUN=1：只跑比對＋下載＋縮圖，不寫檔/不寫 DB，用縮圖後大小回報「會做什麼」。
//   pnpm run photos:record
//   DRY_RUN=1 pnpm run photos:record
//   FORCE=1 pnpm run photos:record
import { createClient } from '@supabase/supabase-js';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import sharp from 'sharp';
import { loadEnv } from './lib/loadEnv';
import { manifestFilenameMatchesCounty, matchManifest, type ManifestEntry, type OfficialLite } from './lib/photos';

loadEnv();
const here = dirname(fileURLToPath(import.meta.url));
const MANIFEST_DIR = join(here, 'out-photos');
const OUT_DIR = join(here, '..', 'public', 'photos', 'councilors');
const UA = 'legislator-background-bot/1.0 (public-data; +https://github.com/weryk153/legislator-background)';
const DRY_RUN = !!process.env.DRY_RUN;
const FORCE = !!process.env.FORCE;
// 開啟後：候選池含已解職議員（見 scraper/lib/photos.ts matchManifest 的 includeDeparted），
// 用於比對 archived- 前綴的歷史 manifest（web.archive.org 圖片網址，下載流程本身不變）。
const INCLUDE_DEPARTED = !!process.env.INCLUDE_DEPARTED;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// 22 縣市（沿用 scraper/lib/ardata-match.ts 的全名清單）。逐一檢查對應 manifest 是否已到齊。
const CITY_NAMES = [
  '臺北市', '新北市', '桃園市', '臺中市', '臺南市', '高雄市', '基隆市', '宜蘭縣',
  '新竹市', '新竹縣', '苗栗縣', '彰化縣', '南投縣', '雲林縣', '嘉義市', '嘉義縣',
  '屏東縣', '臺東縣', '花蓮縣', '澎湖縣', '金門縣', '連江縣',
];

type Official = {
  id: string; slug: string; name: string; district: string; photo_url: string | null; is_incumbent: boolean;
};

async function fetchAllCouncilors(sb: any): Promise<Official[]> {
  // 撈全部（含非現任）：matchManifest 需要非現任者才能判斷「已解職/轉任」skip 原因
  // （manifest 帶「(轉任立委)/(解職...)/(歿)」等狀態註記時，用來與純粹查無此人的
  // 「查無現任」區分）；實際掛照片仍只會配到現任者，matchManifest 內部自行過濾。
  // PostgREST 預設單次回傳上限 1000 筆——本repo已在此踩雷 3 次，務必分頁，否則尾端議員被靜默漏掉。
  const PAGE = 1000;
  const out: Official[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await sb.from('officials')
      .select('id, slug, name, district, photo_url, is_incumbent')
      .eq('office_type', 'councilor')
      .order('id', { ascending: true }).range(from, from + PAGE - 1);
    if (error) throw new Error(`officials query failed: ${error.message}`);
    out.push(...((data ?? []) as Official[]));
    if ((data ?? []).length < PAGE) break;
  }
  return out;
}

async function downloadWithRetry(url: string): Promise<Buffer> {
  let lastErr: unknown;
  for (let a = 0; a < 3; a++) {
    try {
      if (a) await sleep(1500);
      const res = await fetch(url, { headers: { 'user-agent': UA } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return Buffer.from(await res.arrayBuffer());
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

async function main() {
  const sb = createClient(process.env.PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  if (!DRY_RUN) mkdirSync(OUT_DIR, { recursive: true });

  const allCouncilors = await fetchAllCouncilors(sb);
  const asLite = (o: Official): OfficialLite => (
    { id: o.id, slug: o.slug, name: o.name, district: o.district, isIncumbent: o.is_incumbent, photoUrl: o.photo_url }
  );
  const officialsByCounty = new Map<string, OfficialLite[]>();
  for (const county of CITY_NAMES) {
    officialsByCounty.set(county, allCouncilors.filter((o) => o.district.startsWith(county)).map(asLite));
  }
  const byId = new Map(allCouncilors.map((o) => [o.id, o]));

  // 蒐集 agent 的檔名慣例偶有出入（如「雲林縣議會.json」而非設計文件的「雲林縣.json」）：
  // 以「檔名開頭是否為該縣市全名」寬鬆比對，而非要求精確檔名。22 縣市全名彼此皆非前綴關係，
  // 故此寬鬆比對不會造成跨縣市誤讀。「archived-」前綴的歷史 manifest（已解職議員，
  // web.archive.org 圖片網址）視為同一縣市的另一份 manifest，兩者並存時皆會處理
  // （見 manifestFilenameMatchesCounty）。
  const manifestFiles = existsSync(MANIFEST_DIR) ? readdirSync(MANIFEST_DIR).filter((f) => f.endsWith('.json')) : [];
  const manifestFilesOf = (county: string): string[] =>
    manifestFiles.filter((f) => manifestFilenameMatchesCounty(f, county));

  const missing: string[] = [];
  let totalMatched = 0, totalSkipped = 0;
  let downloaded = 0, idempotentSkip = 0, failed = 0;

  for (const county of CITY_NAMES) {
    const manifestFilesForCounty = manifestFilesOf(county);
    if (manifestFilesForCounty.length === 0) { missing.push(county); continue; }

    let countyMatched = 0, countySkipped = 0;
    let countyOk = 0, countySkipIdem = 0, countyFail = 0;

    for (const manifestFile of manifestFilesForCounty) {
      const manifestPath = join(MANIFEST_DIR, manifestFile);

      let manifest: ManifestEntry[];
      try {
        manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
      } catch (e) {
        console.log(`✗ ${county} (${manifestFile}): manifest JSON 解析失敗 — ${e instanceof Error ? e.message : String(e)}`);
        continue;
      }

      const officials = officialsByCounty.get(county) ?? [];
      const { matched, skipped } = matchManifest(officials, manifest, county, { includeDeparted: INCLUDE_DEPARTED });
      countyMatched += matched.length;
      countySkipped += skipped.length;

      for (const m of matched) {
        const off = byId.get(m.officialId);
        if (!off) continue; // 理論上不會發生：matched 只可能來自傳入的 officials
        const filePath = join(OUT_DIR, `${off.slug}.jpg`);

        if (!FORCE && off.photo_url && existsSync(filePath)) {
          countySkipIdem++; idempotentSkip++;
          continue;
        }

        try {
          const buf = await downloadWithRetry(m.imgUrl);
          const thumb = await sharp(buf).rotate().resize({ width: 320, withoutEnlargement: true })
            .jpeg({ quality: 80, mozjpeg: true }).toBuffer();
          const localPath = `/photos/councilors/${off.slug}.jpg`;
          if (DRY_RUN) {
            console.log(`✓(dry) ${county} ${off.name} ← ${m.imgUrl} ${(thumb.length / 1024).toFixed(0)}KB`);
          } else {
            writeFileSync(filePath, thumb);
            const { error: ue } = await sb.from('officials').update({ photo_url: localPath }).eq('id', off.id);
            if (ue) throw new Error(`db update: ${ue.message}`);
            console.log(`✓ ${county} ${off.name} → ${localPath} ${(thumb.length / 1024).toFixed(0)}KB`);
          }
          // 同一次執行內若多份 manifest 重複列到同一人（如 archived 與現行檔並存），
          // 就地更新本機快取，讓後續遇到同一人時的冪等判斷即時生效。
          off.photo_url = localPath;
          countyOk++; downloaded++;
        } catch (e) {
          countyFail++; failed++;
          console.log(`✗ ${county} ${off.name}: ${e instanceof Error ? e.message : String(e)}`);
        }
        await sleep(1000);
      }

      for (const s of skipped) console.log(`— ${county} ${s.name}: ${s.reason}`);
    }

    totalMatched += countyMatched;
    totalSkipped += countySkipped;
    console.log(
      `=== ${county}：matched ${countyMatched}（下載 ${countyOk}、冪等跳過 ${countySkipIdem}、失敗 ${countyFail}）、skipped ${countySkipped} ===`,
    );
  }

  console.log(
    `\n完成：matched ${totalMatched}（下載/會下載 ${downloaded}、冪等跳過 ${idempotentSkip}、失敗 ${failed}）、` +
    `skipped ${totalSkipped}、缺 manifest ${missing.length}/${CITY_NAMES.length}`,
  );
  if (missing.length) console.log('缺 manifest 的縣市：', missing.join('、'));
}

main().catch((e) => { console.error(e); process.exit(1); });
