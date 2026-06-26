// 判決 discovery（立委＋首長）— Playwright 驅動司法院裁判書系統進階查詢。
//
// 已驗證流程（2026-06-26，無 CAPTCHA）：進階頁 Default_AD.aspx → 勾「刑事」(jud_sys=M)
// → 「主文」欄(#jud_jmain)填姓名 → 送出(#btnQry) → 結果 iframe(qryresultlst.aspx)，
// 每筆 data.aspx?ty=JD&id=<JID> 帶官方判決 ID。
//
// 「主文=姓名」對罕見名很準，但常見名(林淑芬/王美惠…)會混入同名他人(詐欺/竊盜/毒品…)。
// 故本腳本對每筆候選加「消歧訊號」幫人工分流，並抓總數＋分頁避免截斷：
//   - category：official_crime(貪污/選罷/背信…政治人物典型) / street_crime(詐欺/竊盜/毒品…常見同名雜訊) / other
//   - regionMatch：判決法院轄區是否＝此人選區縣市（弱訊號）
//   - confidence：official→high；street 且轄區不符→low；其餘→medium
// 只產候選清單，NOT 入庫：判決敏感、須人工確認身分(無罪推定)。
//
//   pnpm run judgments:discover                    # 全部立委+首長
//   ONLY=高虹安,林淑芬 pnpm run judgments:discover
//   LIMIT=5 PAGES=3 pnpm run judgments:discover    # 前5位、每人最多抓3頁
import { chromium, type Frame } from 'playwright';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(here, 'out-judgments');
const AD_URL = 'https://judgment.judicial.gov.tw/FJUD/Default_AD.aspx';
const MAX_PAGES = Number(process.env.PAGES || 5); // 每人最多抓幾頁（每頁約20筆）
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

type Person = { name: string; slug: string; party: string; district: string; officeType: string };
type Candidate = {
  id: string; title: string; court: string; date: string; reason: string; excerpt: string; url: string;
  category: 'official_crime' | 'street_crime' | 'other'; regionMatch: boolean | null;
  confidence: 'high' | 'medium' | 'low';
};

// 政治人物典型罪名（高信號）vs 常見街頭犯罪（同名雜訊高發）
const OFFICIAL_CRIME = ['貪污', '圖利', '選舉罷免', '選罷', '政治獻金', '背信', '偽造文書', '洩密', '國家機密', '證券交易', '銀行法', '商業會計', '侵占', '瀆職', '受賄', '行賄', '財產來源不明'];
const STREET_CRIME = ['詐欺', '竊盜', '毒品', '洗錢', '公共危險', '傷害', '性自主', '強盜', '搶奪', '槍砲', '賭博', '妨害自由', '過失', '妨害風化', '贓物', '恐嚇', '殺人', '妨害電腦'];
const stem = (s: string) => s.replace(/[縣市]$/, '').replace(/^台/, '臺');

function classify(reason: string): Candidate['category'] {
  if (OFFICIAL_CRIME.some((k) => reason.includes(k))) return 'official_crime';
  if (STREET_CRIME.some((k) => reason.includes(k))) return 'street_crime';
  return 'other';
}
function courtCounty(title: string): string | null {
  const m = title.match(/(?:臺灣|福建)(.+?)地方法院/) || title.match(/高等法院(.+?)分院/); // 連江/金門為福建法院
  return m ? stem(m[1]) : null; // 高等/最高法院→null（上訴審無轄區訊號）
}
function personCounty(district: string): string | null {
  if (/不分區|僑居|全國|原住民/.test(district)) return null;
  const m = district.match(/^(.+?[縣市])/);
  return m ? stem(m[1]) : null;
}

function loadPeople(): Person[] {
  const all = JSON.parse(readFileSync(join(here, '..', 'src', 'data', 'officials.json'), 'utf8'));
  // OFFICE：逗號分隔 office_type；預設 立委+首長。OFFICE=councilor 掃議員。
  const offices = process.env.OFFICE ? process.env.OFFICE.split(',') : ['legislator', 'mayor_magistrate'];
  let people: Person[] = all
    .filter((o: any) => offices.includes(o.officeType))
    .map((o: any) => ({ name: o.name, slug: o.slug, party: o.party, district: o.district, officeType: o.officeType }));
  if (process.env.COUNTY) people = people.filter((p) => p.district.startsWith(process.env.COUNTY!)); // 議員分縣市批次
  if (process.env.ONLY) { const set = new Set(process.env.ONLY.split(',')); people = people.filter((p) => set.has(p.name)); }
  if (process.env.LIMIT) people = people.slice(0, Number(process.env.LIMIT));
  return people;
}

// 解析目前結果頁的候選（含分類）。在 frame context 內抽原始欄位，回 node 端再分類。
async function extractPage(frame: Frame): Promise<Omit<Candidate, 'category' | 'regionMatch' | 'confidence'>[]> {
  return frame.evaluate(() => {
    const base = 'https://judgment.judicial.gov.tw/FJUD/';
    const links = [...document.querySelectorAll('a[href*="data.aspx"][href*="ty=JD"]')] as HTMLAnchorElement[];
    const seen = new Set<string>(); const out: any[] = [];
    for (const a of links) {
      const href = a.getAttribute('href') || '';
      const id = new URLSearchParams(href.split('?')[1] || '').get('id') || '';
      if (!id || seen.has(id)) continue; seen.add(id);
      const row = a.closest('tr');
      const next = row?.nextElementSibling as HTMLElement | null;
      const rowText = (row?.innerText || '').replace(/\s+/g, ' ').trim();
      const title = (a.textContent || '').replace(/\s+/g, ' ').trim();
      const date = (rowText.match(/\d{2,3}[.\-/]\d{1,2}[.\-/]\d{1,2}/) || [''])[0];
      const reason = (rowText.split(/\s+/).pop() || '');
      out.push({ id, title, court: (title.match(/^(.*?法院(?:.+?分院)?)/) || ['', ''])[1],
        date, reason, excerpt: (next?.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 200),
        url: `${base}data.aspx?ty=JD&id=${encodeURIComponent(id)}` });
    }
    return out;
  });
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  const people = loadPeople();
  const scope = process.env.OFFICE || '立委+首長';
  console.log(`discovery：${people.length} 位（${scope}${process.env.COUNTY ? '・' + process.env.COUNTY : ''}），刑事＋主文=姓名，每人最多 ${MAX_PAGES} 頁\n`);

  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ locale: 'zh-TW' });
  const page = await ctx.newPage();
  let withCases = 0, totalHits = 0, truncated = 0;
  const summary: any[] = [];

  for (const p of people) {
    // RESUME=1：已有輸出檔者跳過（維護中斷後補跑；失敗者不寫檔故會被重試）
    if (process.env.RESUME && existsSync(join(OUT_DIR, `${p.slug}.json`))) { console.log('↩', p.name, '已有檔，跳過'); continue; }
    const pCounty = personCounty(p.district);
    let candidates: Candidate[] = []; let total = 0; let cut = false; let failed = false;
    try {
      await page.goto(AD_URL, { waitUntil: 'domcontentloaded', timeout: 30_000 });
      await page.check('input[name="jud_sys"][value="M"]', { timeout: 15_000 });
      await page.fill('#jud_jmain', p.name);
      await page.click('#btnQry', { timeout: 15_000 });
      await page.waitForSelector('#iframe-data', { timeout: 30_000 });

      let frame: Frame | null = null;
      for (let a = 0; a < 20 && !frame; a++) {
        frame = page.frames().find((f) => /qryresultlst/.test(f.url())) ?? null;
        if (!frame) await sleep(500);
      }
      if (frame) {
        for (let a = 0; a < 20; a++) {
          const ready = await frame.evaluate(() =>
            document.querySelector('a[href*="data.aspx"][href*="ty=JD"]') != null ||
            /查無|沒有符合/.test(document.body?.innerText || '')).catch(() => false);
          if (ready) break;
          await sleep(500);
        }
        total = await frame.evaluate(() => {
          const m = (document.body?.innerText || '').match(/共\s*([\d,]+)\s*筆/); return m ? Number(m[1].replace(/,/g, '')) : 0;
        }).catch(() => 0);

        const byId = new Map<string, any>();
        for (let pg = 1; pg <= MAX_PAGES; pg++) {
          for (const c of await extractPage(frame)) if (!byId.has(c.id)) byId.set(c.id, c);
          // 下一頁
          const nextSel = 'a:has-text("下一頁"), a[aria-label*="下一頁"]';
          const hasNext = await frame.locator(nextSel).first().count().catch(() => 0);
          if (!hasNext || pg >= MAX_PAGES) break;
          await frame.locator(nextSel).first().click({ timeout: 10_000 }).catch(() => {});
          await frame.waitForLoadState('domcontentloaded', { timeout: 15_000 }).catch(() => {});
          await sleep(600);
        }
        candidates = [...byId.values()].map((c) => {
          const category = classify(c.reason);
          const cc = courtCounty(c.title);
          const regionMatch = cc && pCounty ? cc === pCounty : null;
          let confidence: Candidate['confidence'];
          if (p.officeType === 'councilor') {
            // 議員為地方民代，案件幾乎在自己縣市法院 → 轄區相符為主要消歧訊號。
            if (regionMatch === false) confidence = 'low';                    // 外縣市 → 多為同名他人
            else if (regionMatch === true) confidence = category === 'official_crime' ? 'high' : 'medium';
            else confidence = category === 'official_crime' ? 'medium' : 'low'; // 上訴審無轄區訊號
          } else {
            confidence = category === 'official_crime' ? 'high' : (category === 'street_crime' && regionMatch === false) ? 'low' : 'medium';
          }
          return { ...c, category, regionMatch, confidence } as Candidate;
        });
        cut = total > candidates.length;
      }
    } catch (e) {
      failed = true;
      console.log('✗', p.name, e instanceof Error ? e.message : String(e));
    }
    if (failed) { await sleep(1000); continue; } // 失敗不寫檔，供 RESUME 補跑

    const byConf = { high: 0, medium: 0, low: 0 };
    candidates.forEach((c) => byConf[c.confidence]++);
    if (candidates.length) { withCases++; totalHits += candidates.length; }
    if (cut) truncated++;
    summary.push({ name: p.name, slug: p.slug, district: p.district, total, captured: candidates.length, truncated: cut, byConf });
    writeFileSync(join(OUT_DIR, `${p.slug}.json`), JSON.stringify(
      { name: p.name, slug: p.slug, party: p.party, district: p.district, officeType: p.officeType,
        query: '刑事 + 主文=' + p.name, discoveredAt: '2026-06-26',
        total, captured: candidates.length, truncated: cut, byConfidence: byConf, candidates }, null, 2));
    const tag = cut ? ` (共${total}，截斷)` : '';
    console.log(candidates.length
      ? `● ${p.name} → ${candidates.length} 筆${tag}  [高${byConf.high}/中${byConf.medium}/低${byConf.low}]`
      : `· ${p.name} → 無`);
    await sleep(1000);
  }

  await browser.close();
  summary.sort((a, b) => b.byConf.high - a.byConf.high || b.captured - a.captured);
  writeFileSync(join(OUT_DIR, '_summary.json'), JSON.stringify(summary, null, 2));
  const highPeople = summary.filter((s) => s.byConf.high > 0).length;
  console.log(`\n完成：${people.length} 位掃描，${withCases} 位有候選、共 ${totalHits} 筆（${truncated} 位截斷）。`);
  console.log(`其中 ${highPeople} 位有 high-confidence(官員型罪名) 候選 → 優先人工確認。輸出 scraper/out-judgments/`);
}

main().catch((e) => { console.error(e); process.exit(1); });
