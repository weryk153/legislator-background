// =============================================================================
// 廉政專刊 期別 → public PDF-URL mapping — DISCOVERY NOTES (Task 4, Step 1)
// =============================================================================
// VERIFIED LIVE (2026-06): the 監察院 陽光法令主題網 publishes a "廉政專刊電子書"
// listing at:
//
//   https://sunshine.cy.gov.tw/News.aspx?n=17&sms=8861&page=1&PageSize=500
//
// It is a plain server-rendered ASP.NET page (no XHR/JSON API needed). Each issue
// row carries a *hidden* anchor (style="font-size:0em") pointing at the public
// gazette PDF on the file host:
//
//   <a href="https://www-ws.cy.gov.tw/Download.ashx?u=<base64path>&n=<base64name>&icon=..pdf">
//
// The base64-decoded `n` filename is "【廉政專刊第NNN期】.pdf", so the 期別 (NNN)
// is recoverable straight from the link. Bumping PageSize returns the whole list in
// one GET. Confirmed end-to-end: the Download.ashx URL serves application/pdf with a
// normal UA, and pdftotext extracts the Chinese declaration text.
//
// COVERAGE: the e-book listing spans 期別 ~108..319 (210 issues, tiny gaps at 182/196).
// OLDER 申報專刊 issues (期別 < ~108, e.g. a 1990s 立委 first term) are NOT in this
// listing — resolvePdfUrl simply throws "No gazette PDF for period X" for those and
// the cy adapter leaves items: [] (a human fills from the declaration's PDF link).
// This is expected and acceptable; the mapping is real, just bounded to modern issues.
// =============================================================================

import { execFileSync, execSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fetchPolite } from './fetchPolite';
import type { AssetCategory, AssetItem } from './types';

// The 廉政專刊電子書 listing endpoint. A large PageSize pulls the full catalogue in
// one request (only ~210 rows total, so this stays well-mannered).
const PERIOD_INDEX_URL =
  'https://sunshine.cy.gov.tw/News.aspx?n=17&sms=8861&page=1&PageSize=500';

let periodCache: Map<string, string> | null = null;

// Resolve a 廉政專刊 期別 to its public PDF URL. See discovery notes above. Throws if
// the period is not present in the e-book listing (older 申報專刊 issues, network
// failure, or layout change) — callers treat that as "no enrichment available".
export async function resolvePdfUrl(period: string): Promise<string> {
  if (!periodCache) periodCache = await loadPeriodIndex();
  const url = periodCache.get(String(period).trim());
  if (!url) throw new Error(`No gazette PDF for period ${period}`);
  return url;
}

// Build the period→url map from the 廉政專刊電子書 listing (see Step 1 discovery).
// Best-effort: any fetch/parse failure yields an empty map so resolvePdfUrl throws
// cleanly rather than crashing the pipeline.
async function loadPeriodIndex(): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  try {
    const res = await fetchPolite(PERIOD_INDEX_URL);
    const html = await res.text();
    // Hidden anchors expose the gazette PDF directly. Pair each Download.ashx URL with
    // the 期別 decoded from its base64 `n` filename ("【廉政專刊第NNN期】.pdf").
    const re = /href="(https:\/\/www-ws\.cy\.gov\.tw\/Download\.ashx\?u=[^"]+&n=([^"]+))"/g;
    for (const m of html.matchAll(re)) {
      const full = m[1].replace(/&amp;/g, '&');
      const period = periodFromBase64Name(m[2]);
      // First occurrence wins (newest listing order), and don't clobber a period we
      // already mapped.
      if (period && !map.has(period)) map.set(period, full);
    }
  } catch {
    // Leave map empty — resolvePdfUrl will throw "No gazette PDF for period X".
  }
  return map;
}

// Decode a URL-encoded base64 filename and pull the 期別 out of "…第NNN期…".
function periodFromBase64Name(encoded: string): string | null {
  try {
    const name = Buffer.from(decodeURIComponent(encoded), 'base64').toString('utf8');
    const m = name.match(/第\s*(\d+)\s*期/u);
    return m ? m[1] : null;
  } catch {
    return null;
  }
}

const PDFTOTEXT = execSync('brew --prefix').toString().trim() + '/bin/pdftotext';

// Fetch a 監察院 declaration PDF by its encrypted file Id and return its text.
// The priso getFile endpoint returns the person's own declaration PDF (not WAF-blocked —
// the parameter key is `FileId`). Throws on failure (the cy adapter swallows it).
export async function getDeclarationText(fileId: string): Promise<string> {
  const res = await fetch('https://priso.cy.gov.tw/api/Query/getFile', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'user-agent': 'Mozilla/5.0', referer: 'https://priso.cy.gov.tw/' },
    body: JSON.stringify({ FileId: fileId }),
  });
  if (!res.ok) throw new Error(`getFile HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (!buf.subarray(0, 5).toString('latin1').includes('%PDF')) {
    throw new Error(`getFile not a PDF: ${buf.subarray(0, 40).toString('utf8')}`);
  }
  const dir = mkdtempSync(join(tmpdir(), 'decl-'));
  const pdf = join(dir, 'd.pdf');
  const txt = join(dir, 'd.txt');
  try {
    writeFileSync(pdf, buf);
    execFileSync(PDFTOTEXT, ['-layout', pdf, txt]);
    return readFileSync(txt, 'utf8');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

// Download a gazette PDF and return the text of pages [page, page+span]. Best-effort
// for callers: it can throw (network / pdftotext failure) and the cy adapter swallows
// that to leave items: [].
export async function pdfPageText(url: string, page: number, span = 1): Promise<string> {
  const res = await fetchPolite(url);
  const buf = Buffer.from(await res.arrayBuffer());
  const dir = mkdtempSync(join(tmpdir(), 'gz-'));
  const pdf = join(dir, 'g.pdf');
  const txt = join(dir, 'g.txt');
  try {
    writeFileSync(pdf, buf);
    // The 公報頁次 is the gazette's *printed* page number, which differs from the PDF's
    // physical page index by a small front-matter offset; pdftotext occasionally rejects
    // a range that runs past the document end. That's expected and handled by the caller
    // (items stay empty), so swallow pdftotext's stderr to avoid noisy CLI output.
    execFileSync(PDFTOTEXT, ['-f', String(page), '-l', String(page + span), pdf, txt], {
      stdio: ['ignore', 'ignore', 'ignore'],
    });
    return readFileSync(txt, 'utf8');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

// Category keyword order matters: more specific keywords first so a section
// header is classified before a broader keyword can claim it. The 廉政專刊
// declaration form prints each asset section as a header line that carries a
// running total, e.g.:
//   （七）存款（指新臺幣、外幣之存款）
//   （總金額：新臺幣 37,476,896 元）
//   （八）有價證券（總價額：新臺幣 50 元）
// When a section is empty the header is followed by 本欄空白 and the total
// reads "（總金額：新臺幣  元）" (no digits) — which yields amount 0 and is skipped.
// 土地/建物 are handled separately (no section total — summed per-parcel below).
const CATEGORY_KEYWORDS: Array<[AssetCategory, string[]]> = [
  ['deposit', ['存款']],
  ['cash', ['現金']],
  ['securities', ['有價證券', '股票', '基金', '債券']],
  ['investment', ['事業投資', '投資']],
  ['claim', ['債權']],
  ['debt', ['債務']],
];

// Only treat a line as carrying a section total when it announces one. This
// avoids picking up incidental digits (areas, weights, account numbers) that
// litter the fragmented table text.
const TOTAL_MARKERS = ['總金額', '總價額'];

export function parseGazetteAmount(s: string): number {
  const digits = (s.match(/[\d,]+/g) ?? []).join('').replace(/,/g, '');
  return digits ? Number(digits) : 0;
}

// 土地/建物 have no section total, and the per-holding 取得價額 is frequently
// "(超過五年)" — by law the value is exempt from disclosure when held >5 years — so a
// money sum is both incomplete and easy to corrupt (the row's other numbers are 面積/
// 權利範圍). We therefore report a reliable PARCEL COUNT instead of a bogus amount.
// Each holding row in a section's MAIN holdings (before the 變動情形 changes subsection)
// carries a 取得原因 (買賣/贈與/…); count those lines.
const ACQUIRE_REASON = /(贈與|買賣|繼承|拍賣|分割|交換|徵收|設定|信託|自[行力]|起造|配偶|其他)/;
export function countParcels(section: string): number {
  const changeIdx = section.search(/變\s*動\s*情\s*形/);
  const holdings = changeIdx >= 0 ? section.slice(0, changeIdx) : section;
  let n = 0;
  for (const line of holdings.split('\n')) if (ACQUIRE_REASON.test(line)) n += 1;
  return n;
}

export function parseDeclaration(text: string, name: string): AssetItem[] {
  const idx = text.indexOf(name);
  if (idx === -1) return [];
  // A single declaration spans well over 4 KB once pdftotext fragments the
  // vertical table text, so scan generously from the name onward.
  const block = text.slice(idx, idx + 20000);
  const lines = block.split('\n');
  const items: AssetItem[] = [];
  for (const [category, keywords] of CATEGORY_KEYWORDS) {
    let found = false;
    for (let i = 0; i < lines.length && !found; i++) {
      const line = lines[i];
      if (!keywords.some((k) => line.includes(k))) continue;
      // The category's running total prints either inline on the header line or
      // on one of the next couple of lines. Locate the line that carries the
      // total marker (within a small window of the header).
      let totalLine = -1;
      for (let j = i; j < lines.length && j <= i + 2; j++) {
        if (TOTAL_MARKERS.some((m) => lines[j].includes(m))) {
          totalLine = j;
          break;
        }
      }
      // No total announced near this keyword (e.g. land/building list items use
      // per-item 取得價額, not a section total) — keep looking for a later match.
      if (totalLine === -1) continue;
      // Parse the total line; if its digits wrapped onto following lines, extend
      // until we have a number, but stop before the next total marker so a
      // sibling section's amount can never bleed in.
      let scan = lines[totalLine];
      for (let j = totalLine + 1; parseGazetteAmount(scan) === 0 && j < lines.length && j <= totalLine + 3; j++) {
        if (TOTAL_MARKERS.some((m) => lines[j].includes(m))) break;
        scan += ' ' + lines[j];
      }
      const amount = parseGazetteAmount(scan);
      if (amount > 0) {
        items.push({ category, amount, label: line.trim().slice(0, 60) });
      }
      found = true; // first section header carrying a total for this category wins
    }
  }

  // 土地/建物: report a parcel COUNT (取得價額 is often 超過五年 免申報, so a money sum
  // would be wrong). amount = number of parcels; label flags it as a count for the UI.
  const landIdx = block.indexOf('1.土地');
  const bldgIdx = block.indexOf('2.建物');
  const propEnd = block.search(/（[三四五六七]）/); // 現金/存款/… section ends the real-estate block
  if (landIdx >= 0) {
    const end = bldgIdx > landIdx ? bldgIdx : propEnd > landIdx ? propEnd : landIdx + 6000;
    const n = countParcels(block.slice(landIdx, end));
    if (n > 0) items.push({ category: 'land', amount: n, label: 'count' });
  }
  if (bldgIdx >= 0) {
    const end = propEnd > bldgIdx ? propEnd : bldgIdx + 6000;
    const n = countParcels(block.slice(bldgIdx, end));
    if (n > 0) items.push({ category: 'building', amount: n, label: 'count' });
  }

  return items;
}
