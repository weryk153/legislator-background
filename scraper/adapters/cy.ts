// 監察院 公職人員財產申報公告資料 (asset-declaration) adapter.
//
// Source confirmed live (Task 11, Step 1, REAL data) by driving the
// priso.cy.gov.tw Angular SPA (linked from 監察院 陽光法令主題網
// https://sunshine.cy.gov.tw/ → "財產申報公告資料") and capturing its XHR JSON API:
//
//   POST https://priso.cy.gov.tw/api/Query/QueryData
//   Content-Type: text/json
//   body: { "Data": { "Method": "", "Type": "name", "Value": "<姓名>" },
//          "Page": { "PageNo": 1, "PageSize": <n> } }
//
// The public entry page is https://priso.cy.gov.tw/layout/baselist . A name search
// first hits Query/QueryGrid (returns a one-row name summary with a Counts total),
// then Query/QueryData returns one row per published declaration. Response shape:
//   { Success, Message, Data: { Page: {...}, Data: [ {
//       Seq, Id,                 // Id = encrypted token addressing the gazette PDF
//       Name,                    // 姓名/名稱, e.g. "韓國瑜"
//       Period,                  // 廉政專刊 期別, e.g. "299"
//       Type,                    // "廉政專刊"
//       Dept,                    // 服務機關, e.g. "立法院"
//       Title,                   // 職稱, e.g. "院長"
//       PublishType,             // "01一般申報" / "04信託申報" / "02更補正申報" ...
//       PublishDate,             // ROC date string, e.g. "民國115年 03月 19日"
//       PublishPage,             // "P1-5"
//       OverFiveYear             // "Y"/"N"
//   } ] } }
//
// PROVENANCE / HONESTY NOTE on amounts:
// The 監察院 publishes the declarations themselves as 廉政專刊 (gazette) PDFs; the
// JSON API above is a *gazette index* and does NOT expose machine-readable monetary
// figures — the NT$ amounts live only inside the PDF addressed by `Id` (fetched via the
// WAF-protected POST Query/getFile, which returns a binary blob). So parseCy emits one
// CandidateAsset per declaration with a real `year` (from the ROC PublishDate), a
// gazette `source`, and an empty `items` array. parseAmount is exported and unit-tested
// so that a future PDF-extraction step can populate the itemized amounts from the PDF.
// source.type is 'gazette' (the underlying authoritative form is the 監察院公報/廉政專刊).
import type { AdapterResult, CandidateAsset, EvidenceSource, SourceAdapter, Target } from '../lib/types';
import { resolvePdfUrl, pdfPageText, parseDeclaration } from '../lib/gazette';

const UA = 'legislator-background-bot/1.0 (public-data; contact: weryk153@gmail.com)';
const PRISO_BASE = 'https://priso.cy.gov.tw';
const QUERY_DATA_URL = `${PRISO_BASE}/api/Query/QueryData`;
const PUBLIC_PAGE = `${PRISO_BASE}/layout/baselist`;

/**
 * Strip every non-digit from a money-ish string and return the integer value.
 * `"1,234,567"` -> 1234567, `"NT$ 12,000 元"` -> 12000, no digits -> 0.
 */
export function parseAmount(s: string): number {
  if (s == null) return 0;
  const digits = String(s).replace(/[^\d]/g, '');
  if (digits.length === 0) return 0;
  const n = Number.parseInt(digits, 10);
  return Number.isFinite(n) ? n : 0;
}

// Convert a possibly-ROC year to a Gregorian year. 民國 years are < 1911 in practice
// (民國1 = 1912), so anything below 1911 is treated as ROC and offset by 1911.
function toGregorianYear(year: number): number {
  if (!Number.isFinite(year) || year <= 0) return 0;
  return year < 1911 ? year + 1911 : year;
}

// Pull a year out of a 監察院 PublishDate. The API uses ROC dates such as
// "民國115年 03月 19日"; we also tolerate a bare 4-digit Gregorian year just in case.
function yearFromPublishDate(raw: string): number {
  const s = String(raw ?? '').trim();
  if (!s) return 0;
  const roc = s.match(/民國\s*(\d{1,3})\s*年/u);
  if (roc) return toGregorianYear(Number.parseInt(roc[1], 10));
  const greg = s.match(/(\d{4})/u);
  if (greg) return toGregorianYear(Number.parseInt(greg[1], 10));
  // Last resort: a leading ROC number with no 年 marker.
  const lead = s.match(/^(\d{1,3})\b/u);
  return lead ? toGregorianYear(Number.parseInt(lead[1], 10)) : 0;
}

const trim = (v: unknown): string => (v == null ? '' : String(v).trim());

/**
 * Parse a 監察院 財產申報公告資料 Query/QueryData response into CandidateAsset rows.
 *
 * `input` is the JSON text of the Query/QueryData response. As a defensive fallback we
 * also accept the already-parsed object, and tolerate the records being delivered either
 * under `Data.Data` (the real envelope) or as a bare array.
 */
export function parseCy(input: string | object, sourceUrl: string, retrievedAt: string): CandidateAsset[] {
  return parseCyRows(input, sourceUrl, retrievedAt).map((r) => r.asset);
}

/**
 * Like {@link parseCy} but keeps each built asset paired with its originating index row
 * so the adapter can enrich `items` from the gazette PDF addressed by the row's 期別 /
 * 公報頁次. Pure (no network); the adapter does the best-effort PDF fetch.
 */
export function parseCyRows(
  input: string | object,
  sourceUrl: string,
  retrievedAt: string,
): Array<{ asset: CandidateAsset; row: any }> {
  let json: any;
  if (typeof input === 'string') {
    try {
      json = JSON.parse(input);
    } catch {
      return [];
    }
  } else {
    json = input;
  }

  const rows: any[] = Array.isArray(json?.Data?.Data)
    ? json.Data.Data
    : Array.isArray(json?.Data)
      ? json.Data
      : Array.isArray(json)
        ? json
        : [];

  const source: EvidenceSource = {
    url: sourceUrl,
    title: '監察院財產申報公報',
    type: 'gazette',
    retrievedAt,
  };

  const out: Array<{ asset: CandidateAsset; row: any }> = [];
  for (const row of rows) {
    if (!row) continue;
    const year = yearFromPublishDate(trim(row.PublishDate) || trim(row.publishDate));
    if (year <= 0) continue;
    // Items start empty; the adapter populates them best-effort from the gazette PDF.
    out.push({ asset: { year, items: [], source }, row });
  }

  return out;
}

// The priso.cy.gov.tw search is a POST JSON API, so we cannot reuse fetchPolite (which
// only issues GETs). This is a small polite POST with the same UA + a couple of retries.
async function politePost(url: string, body: unknown, retries = 2, delayMs = 1500): Promise<Response> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      if (attempt > 0 && delayMs > 0) await new Promise((r) => setTimeout(r, delayMs));
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'content-type': 'text/json',
          accept: 'application/json',
          referer: PUBLIC_PAGE,
          'user-agent': UA,
        },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
      return res;
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

export const cyAdapter: SourceAdapter = {
  name: 'cy',
  async fetchFor(target: Target): Promise<AdapterResult> {
    try {
      const res = await politePost(QUERY_DATA_URL, {
        Data: { Method: '', Type: 'name', Value: target.name },
        Page: { PageNo: 1, PageSize: 100 },
      });
      const text = await res.text();
      const paired = parseCyRows(text, PUBLIC_PAGE, new Date().toISOString().slice(0, 10));

      // Best-effort per-declaration enrichment: resolve the 期別 to its gazette PDF,
      // pull the text of the declaration's 公報頁次 range, and itemize the amounts.
      // Any failure (no PDF for old 期別, network, pdftotext) leaves items: [] — a
      // reviewer fills those from the declaration's PDF link. This must NEVER throw
      // through to fail the whole adapter, so each record is guarded individually.
      for (const { asset, row } of paired) {
        try {
          const pdfUrl = await resolvePdfUrl(String(row.Period));
          // PublishPage looks like "P25-29" / "p149-153" / "P6-6" — the gazette's PRINTED
          // page numbers, which are offset from the PDF's physical page index by a few
          // front-matter pages. Anchor at the start page and pad the declared range so
          // the offset declaration form is captured, but cap the span tight enough to
          // avoid bleeding deep into adjacent persons' forms (parseDeclaration also
          // anchors on the target name).
          const pages = String(row.PublishPage).match(/\d+/g) ?? [];
          const start = Number(pages[0] ?? '1');
          const end = Number(pages[1] ?? pages[0] ?? '1');
          const span = Math.min(Math.max(end - start, 0) + 3, 8);
          const declText = await pdfPageText(pdfUrl, start, span);
          asset.items = parseDeclaration(declText, target.name);
        } catch {
          /* leave items: [] — reviewer fills from the PDF link */
        }
      }

      const assets = paired.map((p) => p.asset);
      return { source: 'cy', ok: true, assets };
    } catch (err) {
      return { source: 'cy', ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  },
};
