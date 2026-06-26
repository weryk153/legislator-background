// 判決 discovery（立委＋首長）— Playwright 驅動司法院裁判書系統進階查詢。
//
// 已驗證流程（2026-06-26，無 CAPTCHA）：進階頁 Default_AD.aspx → 勾「刑事」(jud_sys=M)
// → 「主文」欄(#jud_jmain)填姓名（人名在主文＝被判對象，濾掉只是被提及的雜訊）→ 送出(#btnQry)
// → 結果在 iframe(qryresultlst.aspx)，每筆 data.aspx?ty=JD&id=<JID> 帶官方判決 ID。
//
// 本腳本只做「發現＋產候選清單」，NOT 入庫：判決敏感、須人工確認身分(無罪推定)。
// 輸出 scraper/out-judgments/{slug}.json，由人工核對後才記錄。
//
//   pnpm run judgments:discover            # 全部立委+首長
//   ONLY=高虹安,沈伯洋 pnpm run judgments:discover
//   LIMIT=5 pnpm run judgments:discover    # 前 5 位（測試）
import { chromium } from 'playwright';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(here, 'out-judgments');
const AD_URL = 'https://judgment.judicial.gov.tw/FJUD/Default_AD.aspx';
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

type Person = { name: string; slug: string; party: string; district: string; officeType: string };
type Candidate = { id: string; title: string; date: string; reason: string; excerpt: string; url: string };

function loadPeople(): Person[] {
  const all = JSON.parse(readFileSync(join(here, '..', 'src', 'data', 'officials.json'), 'utf8'));
  let people: Person[] = all
    .filter((o: any) => o.officeType === 'legislator' || o.officeType === 'mayor_magistrate')
    .map((o: any) => ({ name: o.name, slug: o.slug, party: o.party, district: o.district, officeType: o.officeType }));
  if (process.env.ONLY) { const set = new Set(process.env.ONLY.split(',')); people = people.filter((p) => set.has(p.name)); }
  if (process.env.LIMIT) people = people.slice(0, Number(process.env.LIMIT));
  return people;
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  const people = loadPeople();
  console.log(`discovery：${people.length} 位（立委＋首長），主文=姓名、限刑事\n`);

  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ locale: 'zh-TW' });
  const page = await ctx.newPage();
  let totalHits = 0, withCases = 0;
  const summary: { name: string; slug: string; count: number }[] = [];

  for (const p of people) {
    let candidates: Candidate[] = [];
    try {
      await page.goto(AD_URL, { waitUntil: 'domcontentloaded', timeout: 30_000 });
      await page.check('input[name="jud_sys"][value="M"]', { timeout: 15_000 }); // 刑事
      await page.fill('#jud_jmain', p.name);
      await page.click('#btnQry', { timeout: 15_000 });

      // 結果列載入 iframe(qryresultlst)。等該 frame 出現且內容到位。
      await page.waitForSelector('#iframe-data', { timeout: 30_000 });
      let frame = null;
      for (let a = 0; a < 20 && !frame; a++) {
        frame = page.frames().find((f) => /qryresultlst/.test(f.url())) ?? null;
        if (!frame) await sleep(500);
      }
      if (frame) {
        await frame.waitForLoadState('domcontentloaded', { timeout: 20_000 }).catch(() => {});
        // 等到出現結果連結或「查無」
        for (let a = 0; a < 20; a++) {
          const ready = await frame.evaluate(() =>
            document.querySelector('a[href*="data.aspx"][href*="ty=JD"]') != null ||
            /查無|沒有符合/.test(document.body?.innerText || '')).catch(() => false);
          if (ready) break;
          await sleep(500);
        }
        candidates = await frame.evaluate(() => {
          const base = 'https://judgment.judicial.gov.tw/FJUD/';
          const links = [...document.querySelectorAll('a[href*="data.aspx"][href*="ty=JD"]')] as HTMLAnchorElement[];
          const seen = new Set<string>();
          const out: any[] = [];
          for (const a of links) {
            const href = a.getAttribute('href') || '';
            const id = new URLSearchParams(href.split('?')[1] || '').get('id') || '';
            if (!id || seen.has(id)) continue; seen.add(id);
            const row = a.closest('tr');
            const next = row?.nextElementSibling as HTMLElement | null;
            const rowText = (row?.innerText || '').replace(/\s+/g, ' ').trim();
            const excerpt = (next?.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 200);
            const date = (rowText.match(/\d{2,3}[.\-/]\d{1,2}[.\-/]\d{1,2}/) || [''])[0];
            // 案由：行末常為案由（如「貪污治罪條例等」）
            const reason = (rowText.split(/\s+/).pop() || '');
            out.push({ id, title: (a.textContent || '').replace(/\s+/g, ' ').trim(),
              date, reason, excerpt, url: `${base}data.aspx?ty=JD&id=${encodeURIComponent(id)}` });
          }
          return out;
        });
      }
    } catch (e) {
      console.log('✗', p.name, e instanceof Error ? e.message : String(e));
    }
    if (candidates.length) { withCases++; totalHits += candidates.length; }
    summary.push({ name: p.name, slug: p.slug, count: candidates.length });
    writeFileSync(join(OUT_DIR, `${p.slug}.json`), JSON.stringify(
      { name: p.name, slug: p.slug, party: p.party, district: p.district, officeType: p.officeType,
        query: '刑事 + 主文=' + p.name, discoveredAt: new Date().toISOString().slice(0, 10), candidates }, null, 2));
    console.log(candidates.length ? `● ${p.name} → ${candidates.length} 筆候選` : `· ${p.name} → 無`);
    await sleep(1200); // 禮貌間隔
  }

  await browser.close();
  writeFileSync(join(OUT_DIR, '_summary.json'), JSON.stringify(summary, null, 2));
  console.log(`\n完成：${people.length} 位掃描，${withCases} 位有候選、候選共 ${totalHits} 筆。輸出 scraper/out-judgments/`);
  console.log('下一步：人工核對身分後再記錄（勿自動入庫）。');
}

main().catch((e) => { console.error(e); process.exit(1); });
