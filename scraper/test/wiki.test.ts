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

describe('wikitextToSummary conversion markup', () => {
  it('resolves -{}- conversion markup and fully cleans the real lead (no template leak)', () => {
    const s = wikitextToSummary(fx.lead, 400);
    expect(s).not.toMatch(/\{\{|\}\}|-\{|\}-/);
  });
  it('keeps the display text of zh-tw conversion', () => {
    expect(wikitextToSummary('自請退黨獲-{准}-。')).toBe('自請退黨獲准。');
    expect(wikitextToSummary('-{zh-tw:臺灣;zh-cn:台湾}-民主')).toContain('臺灣');
  });
});

describe('pickControversySections precision', () => {
  it('does not flag benign 提案/法案/方案 sections', () => {
    const benign = [{ index: '1', line: '提案' }, { index: '2', line: '重要法案' }, { index: '3', line: '政見方案' }];
    expect(pickControversySections(benign)).toHaveLength(0);
  });
  it('still flags real controversy sections from the fixture', () => {
    expect(pickControversySections(fx.sections).length).toBeGreaterThan(0);
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
