import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { parseJudgment, scoreCandidate, looksBlocked } from '../adapters/judgments';

const here = dirname(fileURLToPath(import.meta.url));
// REPRESENTATIVE fixture (not real data): the live 司法院裁判書查詢系統 was unreachable
// and gates automation behind a CAPTCHA. See fixtures/judgment-sample.html header.
const html = readFileSync(join(here, '..', 'fixtures', 'judgment-sample.html'), 'utf8');

describe('parseJudgment', () => {
  it('extracts court, case number, date and sets a court source', () => {
    const j = parseJudgment(html, 'https://judgment.judicial.gov.tw/...', '2026-06-17');
    expect(j.court.length).toBeGreaterThan(0);
    expect(j.caseNumber.length).toBeGreaterThan(0);
    expect(j.source.type).toBe('court');
  });

  it('captures the disposition (主文) and the case reason', () => {
    const j = parseJudgment(html, 'https://judgment.judicial.gov.tw/...', '2026-06-17');
    expect(j.outcome.length).toBeGreaterThan(0);
    expect(j.caseReason).toContain('妨害名譽');
    // The fixture says "本件得上訴" → not yet final.
    expect(j.isFinal).toBe(false);
    expect(j.match.confidence).toBe(0);
    expect(j.match.signals).toEqual([]);
  });
});

describe('parseJudgment defendant extraction', () => {
  it('extracts the 被告 name from the judgment body', () => {
    const j = parseJudgment(html, 'https://judgment.judicial.gov.tw/...', '2026-06-17');
    expect(j.defendantNames).toContain('徐巧芯');
  });
});

describe('scoreCandidate', () => {
  it('attaches a match score with confidence and signals', () => {
    const j = parseJudgment(html, 'https://judgment.judicial.gov.tw/...', '2026-06-17');
    const scored = scoreCandidate(j, { name: '徐巧芯', keywords: ['大安'], aliases: [] });
    expect(scored.match.confidence).toBeGreaterThanOrEqual(0);
    expect(Array.isArray(scored.match.signals)).toBe(true);
  });

  it('scores name-exact when the judgment defendant IS the target', () => {
    const j = parseJudgment(html, 'https://judgment.judicial.gov.tw/...', '2026-06-17');
    const scored = scoreCandidate(j, { name: '徐巧芯', keywords: [], aliases: [] });
    expect(scored.match.signals).toContain('name-exact');
    expect(scored.match.confidence).toBeGreaterThanOrEqual(0.4);
  });

  it('scores zero when the target is NOT among the judgment defendants (same-name guard)', () => {
    const j = parseJudgment(html, 'https://judgment.judicial.gov.tw/...', '2026-06-17');
    const scored = scoreCandidate(j, { name: '王小明', keywords: [], aliases: [] });
    expect(scored.match.confidence).toBe(0);
    expect(scored.match.signals).toEqual([]);
  });
});

describe('looksBlocked', () => {
  it('detects CAPTCHA / verification pages', () => {
    expect(looksBlocked('<p>請輸入驗證碼</p>')).toBe(true);
    expect(looksBlocked('<div>captcha challenge</div>')).toBe(true);
    expect(looksBlocked(html)).toBe(false);
  });
});
