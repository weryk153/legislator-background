import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { parseCy, parseAmount } from '../adapters/cy';

const here = dirname(fileURLToPath(import.meta.url));
// REAL response from the 監察院 財產申報公告資料 system (priso.cy.gov.tw) Query/QueryData
// API, captured for 韓國瑜. See adapters/cy.ts header for the URL pattern + provenance.
const fixture = readFileSync(join(here, '..', 'fixtures', 'cy-sample.json'), 'utf8');

describe('parseAmount', () => {
  it('strips thousands separators and non-digits', () => {
    expect(parseAmount('1,234,567')).toBe(1234567);
    expect(parseAmount('NT$ 12,000 元')).toBe(12000);
  });
  it('returns 0 when there is no digit', () => {
    expect(parseAmount('')).toBe(0);
    expect(parseAmount('—')).toBe(0);
    expect(parseAmount(undefined as unknown as string)).toBe(0);
  });
});

describe('parseCy', () => {
  it('extracts at least one asset declaration with year and items', () => {
    const assets = parseCy(fixture, 'https://priso.cy.gov.tw/layout/baselist', '2026-06-17');
    expect(assets.length).toBeGreaterThan(0);
    expect(assets[0].year).toBeGreaterThan(2000);
    expect(Array.isArray(assets[0].items)).toBe(true);
    expect(assets[0].source.type).toBe('gazette');
  });

  it('converts 民國 (ROC) years in PublishDate to Gregorian years', () => {
    const assets = parseCy(fixture, 'https://priso.cy.gov.tw/layout/baselist', '2026-06-17');
    // Fixture contains 民國115年 (= 2026) and 民國82年 (= 1993).
    const years = assets.map((a) => a.year);
    expect(years).toContain(2026);
    expect(years).toContain(1993);
    expect(years.every((y) => y > 1980 && y < 2100)).toBe(true);
  });

  it('stamps every row with the gazette source metadata', () => {
    const url = 'https://priso.cy.gov.tw/layout/baselist';
    const assets = parseCy(fixture, url, '2026-06-17');
    for (const a of assets) {
      expect(a.source.type).toBe('gazette');
      expect(a.source.title).toBe('監察院財產申報公報');
      expect(a.source.url).toBe(url);
      expect(a.source.retrievedAt).toBe('2026-06-17');
    }
  });
});
