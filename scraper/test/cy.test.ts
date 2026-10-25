import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { parseCy, parseAmount, cyRowMatchesTarget, cyQueryName } from '../adapters/cy';
import type { Target } from '../lib/types';

const here = dirname(fileURLToPath(import.meta.url));
// REAL response from the 監察院 財產申報公告資料 system (priso.cy.gov.tw) Query/QueryData
// API, captured for 韓國瑜. See adapters/cy.ts header for the URL pattern + provenance.
const fixture = readFileSync(join(here, '..', 'fixtures', 'cy-sample.json'), 'utf8');

describe('declaration identity', () => {
  const target = (name: string, office: Target['office'], district: string): Target => ({ id: 'test', name, office, district, party: 'test', keywords: [], aliases: [] });
  it('separates same-name councilors, legislators and county chiefs before picking a declaration', () => {
    const council = { Name: '許淑華', Dept: '臺北市議會', Title: '議員' };
    const chief = { Name: '許淑華', Dept: '南投縣政府', Title: '縣長' };
    const taipei = target('許淑華', 'councilor', '臺北市第03選舉區');
    expect(cyRowMatchesTarget(council, taipei)).toBe(true);
    expect(cyRowMatchesTarget(chief, taipei)).toBe(false);
    expect(cyRowMatchesTarget(council, target('許淑華', 'mayor_magistrate', '南投縣'))).toBe(false);
    expect(cyRowMatchesTarget({ Name: '李柏毅', Dept: '立法院', Title: '立法委員' }, target('李柏毅', 'councilor', '臺北市第06選舉區'))).toBe(false);
  });
  it('accepts known glyph variants and rejects missing identity metadata', () => {
    const t = target('戴瑋姗', 'councilor', '新北市第05選舉區');
    expect(cyRowMatchesTarget({ Name: '戴瑋姍', Dept: '新北市議會', Title: '議員' }, t)).toBe(true);
    expect(cyRowMatchesTarget({ Name: '戴瑋姍' }, t)).toBe(false);
  });
  it('uses the verified CY registered name without truncating arbitrary Indigenous names', () => {
    const t = target('伍麗華Saidhai‧Tahovecahe', 'legislator', '山地原住民選舉區');
    expect(cyQueryName(t)).toBe('伍麗華');
    expect(cyRowMatchesTarget({ Name: '伍麗華', Dept: '立法院', Title: '立法委員' }, t)).toBe(true);
    expect(cyRowMatchesTarget({ Name: '伍麗華', Dept: '屏東縣議會', Title: '議員' }, t)).toBe(false);
    expect(cyQueryName(target('某姓名族語', 'legislator', '山地原住民選舉區'))).toBe('某姓名族語');
  });
});

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
