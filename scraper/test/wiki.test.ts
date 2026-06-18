import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { pickControversySections, wikitextToSummary, extractRefUrls, isLikelyPerson } from '../lib/wiki';

const here = dirname(fileURLToPath(import.meta.url));
const fx = JSON.parse(readFileSync(join(here, '..', 'fixtures', 'wiki-sample.json'), 'utf8'));

describe('pickControversySections', () => {
  it('selects 爭議/案/事件 sections by heading', () => {
    const picked = pickControversySections(fx.sections);
    expect(picked.length).toBeGreaterThan(0);
    expect(picked.some((s: any) => /爭議|案|事件|風波|訴訟|醜聞/.test(s.line))).toBe(true);
  });
});

describe('wikitextToSummary', () => {
  it('strips wiki markup and truncates', () => {
    const wt = fx.section.wikitext['*'];
    const s = wikitextToSummary(wt, 300);
    expect(s.length).toBeGreaterThan(0);
    expect(s.length).toBeLessThanOrEqual(301);
    expect(s).not.toMatch(/\[\[|\{\{|<ref/);
  });
});

describe('extractRefUrls', () => {
  it('pulls external citation URLs from section wikitext', () => {
    const urls = extractRefUrls(fx.section.wikitext['*']);
    expect(Array.isArray(urls)).toBe(true);
    for (const u of urls) expect(u).toMatch(/^https?:\/\//);
  });
});

describe('isLikelyPerson', () => {
  it('accepts a lead mentioning the office/party keywords', () => {
    expect(isLikelyPerson(fx.lead, ['立法委員', '民眾黨', '新竹'])).toBe(true);
  });
  it('rejects a lead with no matching keyword', () => {
    expect(isLikelyPerson('這是一條與政治無關的條目。', ['立法委員', '民眾黨'])).toBe(false);
  });
});
