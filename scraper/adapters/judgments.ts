// 司法院裁判書查詢系統 (court-judgment) adapter — Playwright-driven.
//
// LEGAL SENSITIVITY: judgments are ALWAYS review-only. This adapter only fetches,
// parses and *scores* candidate judgments for identity confidence; it NEVER decides
// they belong to the target. The orchestrator/review layer marks them needs_review
// and a human confirms identity before anything is published.
//
// FIXTURE PROVENANCE: the unit tests run against scraper/fixtures/judgment-sample.html,
// which is a REPRESENTATIVE (hand-built) judgment-detail page — NOT real data. The live
// site (https://judgment.judicial.gov.tw/FJUD/...) was unreachable from the build
// environment (DNS did not resolve) and is known to gate automation behind a 驗證碼
// (CAPTCHA), so per the task time-box the live capture was abandoned. Only the pure
// parseJudgment/scoreCandidate/looksBlocked functions are exercised by tests; fetchFor
// (which drives Playwright) is NOT run in tests.
import { parse } from 'node-html-parser';
import type { AdapterResult, CandidateJudgment, EvidenceSource, SourceAdapter, Target } from '../lib/types';
import { scoreMatch, type MatchTarget } from '../match/score';

const SEARCH_URL = 'https://judgment.judicial.gov.tw/FJUD/default.aspx';
const UA = 'legislator-background-bot/1.0 (public-data; contact: weryk153@gmail.com)';

// Convert a ROC ("民國") year to Gregorian. 民國1 = 1912, so add 1911.
function toGregorianYear(year: number): number {
  if (!Number.isFinite(year) || year <= 0) return 0;
  return year < 1911 ? year + 1911 : year;
}

// Extract an ISO-ish date string (YYYY-MM-DD) from a judgment page's text.
// The real system uses ROC dates such as "中華民國 111 年 03 月 15 日"; we also
// tolerate a bare Gregorian date.
function extractDate(text: string): string {
  const roc = text.match(/(?:中華)?民國\s*(\d{1,3})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日/u);
  if (roc) {
    const y = toGregorianYear(Number.parseInt(roc[1], 10));
    const m = String(Number.parseInt(roc[2], 10)).padStart(2, '0');
    const d = String(Number.parseInt(roc[3], 10)).padStart(2, '0');
    if (y > 0) return `${y}-${m}-${d}`;
  }
  const greg = text.match(/(\d{4})\s*[-/年]\s*(\d{1,2})\s*[-/月]\s*(\d{1,2})/u);
  if (greg) {
    const m = String(Number.parseInt(greg[2], 10)).padStart(2, '0');
    const d = String(Number.parseInt(greg[3], 10)).padStart(2, '0');
    return `${greg[1]}-${m}-${d}`;
  }
  return '';
}

// Pull the court name. Prefer a "臺灣…法院" / "…地方法院" / "…高等法院" / "最高法院"
// token; fall back to the leading line of the body.
function extractCourt(text: string): string {
  const m = text.match(/((?:臺灣|台灣|福建)?[一-鿿]{0,8}(?:地方法院|高等法院|行政法院|智慧財產(?:及商業)?法院)|最高法院)/u);
  return m ? m[1].trim() : '';
}

// Pull the 裁判字號 / case number, e.g. "111年度易字第1號". Tolerates spaces between
// the digits and the Chinese characters the way the gazette renders them.
function extractCaseNumber(text: string): string {
  const compact = text.replace(/\s+/gu, '');
  const m = compact.match(/(\d{1,3}年度[一-鿿]{1,6}字第\d{1,6}號)/u);
  return m ? m[1] : '';
}

// Pull the 案由 (case reason / charge), e.g. "妨害名譽".
function extractCaseReason(text: string): string {
  const compact = text.replace(/[ \t]+/gu, '');
  const m = compact.match(/裁判案由[：:\s]*([一-鿿、]{2,20})/u);
  if (m) return m[1].trim();
  // Fallback: "因<案由>案件" phrasing inside the body.
  const m2 = compact.match(/因([一-鿿、]{2,20})案件/u);
  return m2 ? m2[1].trim() : '';
}

// Pull the names of 被告 / 上訴人 / 聲請人 (defendant / appellant / petitioner) from the
// page text, for identity matching and human review. Tolerant: captures the 2–4 char
// Chinese name following one of those party labels. Returns the unique names in order;
// empty if none found.
function extractDefendantNames(text: string): string[] {
  const re = /(?:被告|上訴人|聲請人)\s*([一-龥]{2,4})/gu;
  const names: string[] = [];
  for (const m of text.matchAll(re)) {
    const name = m[1];
    if (name && !names.includes(name)) names.push(name);
  }
  return names;
}

// Pull the 主文 (disposition / outcome) — the operative ruling. Grab the text after a
// "主文" heading up to the next major heading (事實/理由/犯罪事實) or end of text.
function extractOutcome(text: string): string {
  // Headings render with padding, e.g. "主    文" / "事    實"; match across whitespace.
  const start = text.match(/主\s*文/u);
  if (!start || start.index === undefined) return '';
  let body = text.slice(start.index + start[0].length);
  const end = body.search(/犯\s*罪\s*事\s*實|事\s*實|理\s*由/u);
  if (end > 0) body = body.slice(0, end);
  return body.replace(/\s+/gu, ' ').trim();
}

// A judgment is treated as final when nothing in it signals a remaining appeal.
// "得上訴" / "得抗告" mark a not-yet-final disposition; "不得上訴" / "全案確定" /
// "已確定" mark finality. Default to NOT final (conservative — review-only anyway).
function extractIsFinal(text: string): boolean {
  const compact = text.replace(/\s+/gu, '');
  if (/不得上訴|不得抗告|全案(?:即)?確定|本案(?:即)?確定|已確定/u.test(compact)) return true;
  if (/得上訴|得抗告/u.test(compact)) return false;
  return false;
}

/**
 * Pure parser: turn a single judgment-detail HTML page into a CandidateJudgment.
 * `match` starts neutral ({ confidence: 0, signals: [] }); scoring is a separate step.
 */
export function parseJudgment(html: string, sourceUrl: string, retrievedAt: string): CandidateJudgment {
  const root = parse(html);
  const text = root.text.replace(/ /gu, ' ');

  const court = extractCourt(text);
  const caseNumber = extractCaseNumber(text);
  const caseReason = extractCaseReason(text);
  const outcome = extractOutcome(text);
  const isFinal = extractIsFinal(text);
  const judgmentDate = extractDate(text);
  const defendantNames = extractDefendantNames(text);

  const source: EvidenceSource = {
    url: sourceUrl,
    title: caseNumber || court || '裁判書',
    type: 'court',
    retrievedAt,
  };

  return {
    caseReason,
    court,
    caseNumber,
    outcome,
    isFinal,
    judgmentDate,
    judgmentUrl: sourceUrl,
    source,
    defendantNames,
    match: { confidence: 0, signals: [] },
  };
}

/**
 * Pure scorer: run the shared matcher using the judgment's OWN extracted defendant name
 * (NOT the target's name) so the same-name-collision guard actually works — a judgment
 * about a different person scores zero. Does NOT mutate the input.
 */
export function scoreCandidate(j: CandidateJudgment, t: MatchTarget): CandidateJudgment {
  const names = [t.name, ...t.aliases];
  // prefer a defendant name that matches the target; else the first defendant; else '' (no name match)
  const candidateName =
    j.defendantNames.find((n) => names.includes(n)) ?? j.defendantNames[0] ?? '';
  const match = scoreMatch({ candidateName, text: `${j.outcome} ${j.caseReason}` }, t);
  return { ...j, match };
}

/** Heuristic: does this HTML look like a CAPTCHA / verification gate rather than a result? */
export function looksBlocked(html: string): boolean {
  return /驗證碼|captcha|請輸入驗證/i.test(html);
}

export const judgmentsAdapter: SourceAdapter = {
  name: 'judgments',
  async fetchFor(target: Target): Promise<AdapterResult> {
    // Import lazily so the (heavy) Playwright dependency is only loaded when an actual
    // fetch is attempted — the pure parser/scorer above stay import-cheap for tests.
    const { chromium } = await import('playwright');
    let browser: import('playwright').Browser | undefined;
    try {
      browser = await chromium.launch({ headless: true });
      const context = await browser.newContext({ userAgent: UA });
      const page = await context.newPage();

      await page.goto(SEARCH_URL, { waitUntil: 'domcontentloaded', timeout: 30_000 });

      // Bail early if the entry page itself is a verification gate.
      if (looksBlocked(await page.content())) {
        return { source: 'judgments', ok: false, error: 'CAPTCHA/blocked — manual follow-up needed' };
      }

      // Drive the keyword search for the target's name.
      const searchBox = page.locator('#txtKW, input[name="txtKW"]').first();
      await searchBox.fill(target.name, { timeout: 15_000 });
      await page.locator('#btnSimpleQry, input[type="submit"]').first().click({ timeout: 15_000 });
      await page.waitForLoadState('domcontentloaded', { timeout: 30_000 });

      // A CAPTCHA frequently appears only after submitting a query.
      if (looksBlocked(await page.content())) {
        return { source: 'judgments', ok: false, error: 'CAPTCHA/blocked — manual follow-up needed' };
      }

      // Collect links to individual judgment detail pages from the result list.
      const detailHrefs = await page.evaluate(() =>
        Array.from(document.querySelectorAll('a[href*="data.aspx"], #jud a[href]'))
          .map((a) => (a as HTMLAnchorElement).href)
          .filter((h, i, arr) => h && arr.indexOf(h) === i)
          .slice(0, 20),
      );

      const retrievedAt = new Date().toISOString().slice(0, 10);
      const judgments: CandidateJudgment[] = [];
      for (const href of detailHrefs) {
        await page.goto(href, { waitUntil: 'domcontentloaded', timeout: 30_000 });
        const detailHtml = await page.content();
        if (looksBlocked(detailHtml)) {
          return { source: 'judgments', ok: false, error: 'CAPTCHA/blocked — manual follow-up needed' };
        }
        const parsed = parseJudgment(detailHtml, href, retrievedAt);
        if (!parsed.court && !parsed.caseNumber) continue; // not a judgment page
        // Score for identity confidence — review layer still gates publication.
        judgments.push(
          scoreCandidate(parsed, { name: target.name, keywords: target.keywords, aliases: target.aliases }),
        );
      }

      return { source: 'judgments', ok: true, judgments };
    } catch (err) {
      return { source: 'judgments', ok: false, error: err instanceof Error ? err.message : String(err) };
    } finally {
      if (browser) await browser.close();
    }
  },
};
